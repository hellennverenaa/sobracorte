import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import type { ServerConfig } from './config/dotenv';
import { routes } from './routes';
import { prisma } from './prisma';

export function createApp(config: Pick<ServerConfig, 'corsOrigins'>) {
  const app = express();

  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'Origin', 'X-Requested-With', 'X-Dass-Unit', 'x-factory-unit-id'],
    exposedHeaders: ['X-Total-Count', 'x-factory-unit-id'],
    optionsSuccessStatus: 200,
  }));

  app.set('trust proxy', 1);
  app.use(express.urlencoded({ limit: '2mb', extended: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(helmet());

  app.get('/', (_req: Request, res: Response) => {
    res.json({ message: 'API SobraCorte running.' });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/live', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use(routes);

  // Middleware Global de Captura e Sanitização de Erros
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'O arquivo CSV excede o limite de 10 MB.' });
    }
    if (err?.type === 'entity.parse.failed' || (err?.status === 400 && 'body' in err)) {
      return res.status(400).json({ error: 'O corpo JSON da requisição é inválido.' });
    }
    if (err?.status === 413 || err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'O corpo da requisição excede o limite permitido de 2 MB.' });
    }
    console.error('[Global Error Handler]', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  });

  return app;
}
