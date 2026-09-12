import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { loadServerConfig } from "./config/dotenv";
import { routes } from "./routes";
import { prisma, pool } from "./prisma";

const config = loadServerConfig();
const app = express();

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Cache-Control", "Origin", "X-Requested-With", "X-Dass-Unit", "x-factory-unit-id"],
  exposedHeaders: ["X-Total-Count", "x-factory-unit-id"],
  optionsSuccessStatus: 200
}));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  message: { error: "Muitas requisições originadas deste IP. Por favor, tente novamente em instantes." },
  skip: (req) => {
    const path = req.path || '';
    return path === '/' ||
           path === '/health' ||
           path === '/auth/health' ||
           path === '/factory-units' ||
           path === '/auth/units' ||
           path.startsWith('/requisitions/pending-count');
  }
}));
app.use(routes);

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Api sorbra corte runnig." });
});

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Servidor SobraCorte disponível na porta ${config.port}.`);
});

const gracefulShutdown = async (signal: string) => {
  console.log(`Recebido sinal ${signal}. Encerrando servidor e liberando conexões...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      await pool.end();
      console.log("Pool de conexões PostgreSQL e Prisma desconectados com sucesso.");
      process.exit(0);
    } catch (err) {
      console.error("Erro durante o encerramento do pool:", err);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
