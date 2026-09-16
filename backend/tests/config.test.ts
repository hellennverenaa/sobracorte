import assert from "node:assert/strict";
import test from "node:test";
import { loadServerConfig } from "../src/config/dotenv";

const validEnv = {
  PORT: "3333",
  DATABASE_URL: "postgresql://localhost/test",
  PRIVATE_KEY: "test-key",
  CORS_ORIGINS: "http://localhost:3000,https://sobracorte.example.com/",
};

test("carrega e normaliza a configuração obrigatória", () => {
  assert.deepEqual(loadServerConfig(validEnv), {
    port: 3333,
    databaseUrl: validEnv.DATABASE_URL,
    privateKey: validEnv.PRIVATE_KEY,
    corsOrigins: ["http://localhost:3000", "https://sobracorte.example.com"],
    globalAdminIdentities: new Set(),
    dbPoolMax: 20,
    dbPoolIdleTimeoutMs: 30000,
    dbPoolConnectionTimeoutMs: 5000,
  });
});

for (const key of ["PORT", "DATABASE_URL", "PRIVATE_KEY", "CORS_ORIGINS"] as const) {
  test(`rejeita configuração sem ${key}`, () => {
    assert.throws(() => loadServerConfig({ ...validEnv, [key]: "" }), new RegExp(key));
  });
}

test("rejeita porta fora do intervalo permitido", () => {
  assert.throws(() => loadServerConfig({ ...validEnv, PORT: "70000" }), /PORT/);
});

test("rejeita origens CORS com caminho", () => {
  assert.throws(
    () => loadServerConfig({ ...validEnv, CORS_ORIGINS: "https://example.com/app" }),
    /CORS_ORIGINS/,
  );
});

test("valida identidades de administradores globais", () => {
  assert.deepEqual(
    loadServerConfig({ ...validEnv, GLOBAL_ADMIN_IDENTITIES: "sest:12345, saj:67890" }).globalAdminIdentities,
    new Set(["SEST:12345", "SAJ:67890"]),
  );
  assert.throws(() => loadServerConfig({ ...validEnv, GLOBAL_ADMIN_IDENTITIES: "SEST:12345,SEST:12345" }), /duplicada/);
  assert.throws(() => loadServerConfig({ ...validEnv, GLOBAL_ADMIN_IDENTITIES: "12345" }), /formato/);
  assert.throws(() => loadServerConfig({ ...validEnv, GLOBAL_ADMIN_IDENTITIES: "SEST:12-A" }), /formato/);
  assert.throws(() => loadServerConfig({ ...validEnv, GLOBAL_ADMIN_IDENTITIES: "SEST:0" }), /formato/);
});

test("carrega e valida configurações customizadas do pool de conexões", () => {
  const customConfig = loadServerConfig({
    ...validEnv,
    DB_POOL_MAX: "50",
    DB_POOL_IDLE_TIMEOUT_MS: "60000",
    DB_POOL_CONN_TIMEOUT_MS: "10000",
  });
  assert.equal(customConfig.dbPoolMax, 50);
  assert.equal(customConfig.dbPoolIdleTimeoutMs, 60000);
  assert.equal(customConfig.dbPoolConnectionTimeoutMs, 10000);

  assert.throws(() => loadServerConfig({ ...validEnv, DB_POOL_MAX: "-5" }), /DB_POOL_MAX/);
  assert.throws(() => loadServerConfig({ ...validEnv, DB_POOL_MAX: "abc" }), /DB_POOL_MAX/);
  assert.throws(() => loadServerConfig({ ...validEnv, DB_POOL_IDLE_TIMEOUT_MS: "0" }), /DB_POOL_IDLE_TIMEOUT_MS/);
  assert.throws(() => loadServerConfig({ ...validEnv, DB_POOL_CONN_TIMEOUT_MS: "-1" }), /DB_POOL_CONN_TIMEOUT_MS/);
});
