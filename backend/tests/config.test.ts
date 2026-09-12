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
    globalAdminRegistrations: new Set(),
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

test("valida matrículas de administradores globais", () => {
  assert.deepEqual(
    loadServerConfig({ ...validEnv, GLOBAL_ADMIN_REGISTRATIONS: "12345, 67890" }).globalAdminRegistrations,
    new Set([12345, 67890]),
  );
  assert.throws(() => loadServerConfig({ ...validEnv, GLOBAL_ADMIN_REGISTRATIONS: "12345,12345" }), /duplicada/);
  assert.throws(() => loadServerConfig({ ...validEnv, GLOBAL_ADMIN_REGISTRATIONS: "0" }), /inteiras positivas/);
  assert.throws(() => loadServerConfig({ ...validEnv, GLOBAL_ADMIN_REGISTRATIONS: "12A" }), /inteiras positivas/);
});
