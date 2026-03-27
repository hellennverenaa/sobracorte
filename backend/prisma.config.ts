import { defineConfig } from "prisma/config";
import { vars } from "./src/config/dotenv";

if (!vars.DB_URL) {
  console.error("Erro ao carregar variavel do banco de dados");
}

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url: vars.DB_URL
  },
});