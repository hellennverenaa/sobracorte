import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  quiet: true,
});

export interface ServerConfig {
  port: number;
  databaseUrl: string;
  privateKey: string;
  corsOrigins: string[];
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} não configurada.`);
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT deve ser um número inteiro entre 1 e 65535.");
  }
  return port;
}

function parseCorsOrigins(value: string): string[] {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error("CORS_ORIGINS deve conter ao menos uma origem.");

  return origins.map((origin) => {
    const normalized = origin.replace(/\/$/, "");
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new Error(`Origem inválida em CORS_ORIGINS: ${origin}`);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== normalized) {
      throw new Error(`Origem inválida em CORS_ORIGINS: ${origin}`);
    }
    return normalized;
  });
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parsePort(required(env, "PORT")),
    databaseUrl: required(env, "DATABASE_URL"),
    privateKey: required(env, "PRIVATE_KEY"),
    corsOrigins: parseCorsOrigins(required(env, "CORS_ORIGINS")),
  };
}

export const vars = {
  DB_URL: process.env.DATABASE_URL?.trim() ?? "",
  PRIVATE_KEY: process.env.PRIVATE_KEY?.trim(),
};
