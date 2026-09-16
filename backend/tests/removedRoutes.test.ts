import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createApp } from '../src/app';

test('APIs legadas removidas retornam 404 sem autenticação ou persistência', async () => {
  const server = http.createServer(createApp({ corsOrigins: ['http://localhost'] }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as import('node:net').AddressInfo;
  try {
    for (const path of ['/materials', '/materials/1', '/materials/bulk', '/movements', '/stats',
      '/dashboard/origem-sobras', '/dashboard/distribuicao', '/dashboard/top-materiais', '/reports/data']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method });
        assert.equal(response.status, 404, `${method} ${path}`);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
