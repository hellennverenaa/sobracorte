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
  globalAdminIdentities: Set<string>;
  dbPoolMax: number;
  dbPoolIdleTimeoutMs: number;
  dbPoolConnectionTimeoutMs: number;
}

export function parseGlobalAdminIdentities(value: string | undefined): Set<string> {
  const identities = new Set<string>();
  for (const item of (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)) {
    const identity = item.toUpperCase();
    if (!/^[A-Z0-9_-]+:\d+$/.test(identity)) {
      throw new Error('GLOBAL_ADMIN_IDENTITIES deve usar o formato UNIDADE:MATRICULA, separado por vírgulas.');
    }
    const [unit, registration] = identity.split(':');
    if (BigInt(registration) <= 0n) {
      throw new Error('GLOBAL_ADMIN_IDENTITIES deve usar o formato UNIDADE:MATRICULA, separado por vírgulas.');
    }
    const canonicalIdentity = `${unit}:${BigInt(registration)}`;
    if (identities.has(canonicalIdentity)) {
      throw new Error(`GLOBAL_ADMIN_IDENTITIES contém identidade duplicada: ${canonicalIdentity}.`);
    }
    identities.add(canonicalIdentity);
  }
  return identities;
}

export function parseOptionalPositiveInt(value: string | undefined, defaultValue: number, paramName: string): number {
  if (!value || value.trim() === '') return defaultValue;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${paramName} deve ser um número inteiro positivo.`);
  }
  return parsed;
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
    globalAdminIdentities: parseGlobalAdminIdentities(env.GLOBAL_ADMIN_IDENTITIES),
    dbPoolMax: parseOptionalPositiveInt(env.DB_POOL_MAX, 20, 'DB_POOL_MAX'),
    dbPoolIdleTimeoutMs: parseOptionalPositiveInt(env.DB_POOL_IDLE_TIMEOUT_MS, 30000, 'DB_POOL_IDLE_TIMEOUT_MS'),
    dbPoolConnectionTimeoutMs: parseOptionalPositiveInt(env.DB_POOL_CONN_TIMEOUT_MS, 5000, 'DB_POOL_CONN_TIMEOUT_MS'),
  };
}

export const vars = {
  DB_URL: process.env.DATABASE_URL?.trim() ?? "",
  PRIVATE_KEY: process.env.PRIVATE_KEY?.trim(),
  GLOBAL_ADMIN_IDENTITIES: parseGlobalAdminIdentities(process.env.GLOBAL_ADMIN_IDENTITIES),
  DB_POOL_MAX: parseOptionalPositiveInt(process.env.DB_POOL_MAX, 20, 'DB_POOL_MAX'),
  DB_POOL_IDLE_TIMEOUT_MS: parseOptionalPositiveInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000, 'DB_POOL_IDLE_TIMEOUT_MS'),
  DB_POOL_CONN_TIMEOUT_MS: parseOptionalPositiveInt(process.env.DB_POOL_CONN_TIMEOUT_MS, 5000, 'DB_POOL_CONN_TIMEOUT_MS'),
};
