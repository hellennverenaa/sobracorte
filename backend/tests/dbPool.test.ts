import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { pool, prisma, prismaWithoutTenant } from "../src/prisma";

test("pg.Pool é instanciado corretamente e exportado", () => {
  assert.ok(pool instanceof Pool, "pool deve ser uma instância válida de pg.Pool");
  assert.ok(typeof pool.connect === "function", "pool deve possuir método connect");
  assert.ok(typeof pool.query === "function", "pool deve possuir método query");
  assert.ok(typeof pool.end === "function", "pool deve possuir método end");
});

test("pg.Pool possui limites e timeouts configurados", () => {
  // O pool é inicializado com as opções repassadas pelo dotenv/vars
  assert.ok(typeof pool.options.max === "number" && pool.options.max > 0, "max connections deve ser positivo");
  assert.ok(
    typeof pool.options.idleTimeoutMillis === "number" && pool.options.idleTimeoutMillis > 0,
    "idleTimeoutMillis deve ser positivo"
  );
  assert.ok(
    typeof pool.options.connectionTimeoutMillis === "number" && pool.options.connectionTimeoutMillis > 0,
    "connectionTimeoutMillis deve ser positivo"
  );
});

test("pg.Pool possui listener de erro para clientes ociosos (resiliência)", () => {
  const errorListenersCount = pool.listenerCount("error");
  assert.ok(
    errorListenersCount >= 1,
    "pool deve possuir ao menos 1 listener para o evento 'error' prevenindo crash de clientes ociosos"
  );
});

test("Prisma e PrismaWithoutTenant são instanciados com o adapter baseado no Pool", () => {
  assert.ok(prisma, "prisma deve estar definido");
  assert.ok(typeof prisma.$extends === "function", "prisma deve conter extensões");
  assert.ok(prismaWithoutTenant, "prismaWithoutTenant deve estar definido");
  assert.ok(typeof prismaWithoutTenant.$connect === "function", "prismaWithoutTenant deve conter $connect");
});
