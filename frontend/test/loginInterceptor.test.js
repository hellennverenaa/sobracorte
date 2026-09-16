import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComponent } from './componentsHarness.js';

test('erros de login e falhas internas chegam à tela sem refresh ou reload', async (t) => {
  const { attachInterceptors } = await loadComponent('src/services/interceptors/interceptor.ts');
  const originalWindow = globalThis.window;
  let reloads = 0;
  let refreshRequests = 0;
  let rejectResponse;
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { location: { reload: () => { reloads++; } } },
  });
  t.after(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    localStorage.clear();
    sessionStorage.clear();
  });
  const api = { interceptors: {
    request: { use() {} }, response: { use(_resolve, reject) { rejectResponse = reject; } },
  } };
  const refreshFailure = new Error('Refresh de teste recusado');
  attachInterceptors(api, { post: async () => { refreshRequests++; throw refreshFailure; } });

  for (const hasSession of [false, true]) {
    if (hasSession) localStorage.setItem('user', JSON.stringify({ token: 'fixture', unit: { code: 'SEST' } }));
    else localStorage.clear();
    const original = { config: { url: '/auth/check-user', headers: {} }, response: { status: 401 } };
    await assert.rejects(rejectResponse(original), (error) => error === original);
    assert.equal(reloads, 0);
    assert.equal(refreshRequests, 0);
    assert.equal(Boolean(localStorage.getItem('user')), hasSession);
  }

  localStorage.clear();
  const withoutSession = { config: { url: '/inventory/search', headers: {} }, response: { status: 401 } };
  await assert.rejects(rejectResponse(withoutSession), (error) => error === withoutSession);
  const serverError = { config: { url: '/auth/check-user', headers: {} }, response: { status: 500 } };
  await assert.rejects(rejectResponse(serverError), (error) => error === serverError);
  await assert.rejects(rejectResponse({ response: { status: 401 } }));
  assert.equal(reloads, 0);
  assert.equal(refreshRequests, 0);

  // Requests protegidas de uma sessão existente continuam tentando renovar.
  localStorage.setItem('user', JSON.stringify({ token: 'fixture', unit: { code: 'SEST' } }));
  await assert.rejects(rejectResponse({ config: { url: '/inventory/search', headers: {} }, response: { status: 401 } }), (error) => error === refreshFailure);
  assert.equal(refreshRequests, 1);
  assert.equal(reloads, 1);
  assert.equal(Boolean(localStorage.getItem('user')), false);
});
