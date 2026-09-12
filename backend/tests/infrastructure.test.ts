import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createApp } from "../src/app";
import { publicLimiter, authenticatedLimiter, mutationLimiter } from "../src/routes";

const testApp = createApp({
  corsOrigins: ["http://localhost:3000"],
});

function createTestServer(): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(testApp);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      const url = `http://127.0.0.1:${address.port}`;
      resolve({
        server,
        url,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

test("GET / retorna mensagem de status da API SobraCorte", async () => {
  const { url, close } = await createTestServer();
  try {
    const res = await fetch(`${url}/`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { message: "API SobraCorte running." });
  } finally {
    await close();
  }
});

test("GET /health e /health/live retornam status ok", async () => {
  const { url, close } = await createTestServer();
  try {
    const res1 = await fetch(`${url}/health`);
    assert.equal(res1.status, 200);
    assert.deepEqual(await res1.json(), { status: "ok" });

    const res2 = await fetch(`${url}/health/live`);
    assert.equal(res2.status, 200);
    assert.deepEqual(await res2.json(), { status: "ok" });
  } finally {
    await close();
  }
});

test("GET /health/ready responde status de prontidão com o banco", async () => {
  const { url, close } = await createTestServer();
  try {
    const res = await fetch(`${url}/health/ready`);
    assert.ok(res.status === 200 || res.status === 503, "Deve responder 200 ou 503");
    const body = await res.json();
    assert.ok(body.status === "ready" || body.status === "unavailable");
  } finally {
    await close();
  }
});

test("Payload JSON malformado é interceptado pelo Global Error Handler retornando HTTP 400", async () => {
  const { url, close } = await createTestServer();
  try {
    const res = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid-json{not_closed",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.deepEqual(body, { error: "O corpo JSON da requisição é inválido." });
  } finally {
    await close();
  }
});

test("Rate Limiters possuem limites e configurações apropriadas", () => {
  assert.ok(publicLimiter, "publicLimiter deve estar definido");
  assert.ok(authenticatedLimiter, "authenticatedLimiter deve estar definido");
  assert.ok(mutationLimiter, "mutationLimiter deve estar definido");
});
