import { loadServerConfig } from "./config/dotenv";
import { createApp } from "./app";
import { prisma, pool } from "./prisma";

const config = loadServerConfig();
const app = createApp(config);

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
