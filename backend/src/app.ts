import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import type { ServerConfig } from './config/dotenv';
import { routes } from './routes';
import { prisma } from './prisma';

type AppConfig = Pick<ServerConfig, 'corsOrigins'>;

export function createApp(config: AppConfig) {
  const app = express();

  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'Origin', 'X-Requested-With', 'X-Dass-Unit'],
    exposedHeaders: ['X-Total-Count'],
  }));
  app.set('trust proxy', 1);
  app.use(express.urlencoded({ limit: '2mb', extended: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(helmet());

  app.get('/', (_req: Request, res: Response) => {
    res.json({ message: 'API SobraCorte running.' });
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

  app.use((err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'O arquivo CSV excede o limite de 10 MB.' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'O corpo JSON da requisição é inválido.' });
    }
    console.error('[Global Error Handler]', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  });

  return app;
}
