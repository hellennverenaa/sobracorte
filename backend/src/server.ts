import express, { Request, Response } from "express";
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
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Cache-Control", "Origin", "X-Requested-With"],
  exposedHeaders: ["X-Total-Count"],
}));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: "⚠️ Tráfego suspeito detectado. Acesso bloqueado temporariamente por 15 minutos." },
}));
app.use(routes);

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Api sorbra corte runnig." });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Servidor SobraCorte disponível na porta ${config.port}.`);
});
