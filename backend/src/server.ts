import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { loadServerConfig } from "./config/dotenv";
import { routes } from "./routes";

const config = loadServerConfig();
const app = express();

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Cache-Control", "Origin", "X-Requested-With", "X-Dass-Unit"],
  exposedHeaders: ["X-Total-Count"],
}));
app.set('trust proxy', 1);
app.use(express.urlencoded({ limit: "2mb", extended: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: "⚠️ Tráfego suspeito detectado. Acesso bloqueado temporariamente por 15 minutos." },
}));
app.use(routes);

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "API SobraCorte running." });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Global Error Handler]', err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Servidor SobraCorte disponível na porta ${config.port}.`);
});
