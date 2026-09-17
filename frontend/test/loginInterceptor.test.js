import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComponent, api as mockedApi } from './componentsHarness.js';

function tokenFor(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

test('cliente HTTP renova uma sessão uma vez e repete requisições concorrentes', async (t) => {
  const { api } = await loadComponent('src/services/httpClient.ts', { mockHttpClient: false });
  const originalFetch = globalThis.fetch;
  const calls = [];
  const refreshedToken = tokenFor({ usuario: 'OPERADOR01', nome: 'Operador', setor: 'Corte' });
  let protectedRequests = 0;

  localStorage.setItem('user', JSON.stringify({
    id: 1,
    usuario: 'OPERADOR01',
    token: 'expired-token',
    unit: { code: 'UNIDADE_01' },
  }));
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/me')) {
      return new Response(JSON.stringify({ data: { token: refreshedToken }, tokenExpirationTime: 'later' }), { status: 200 });
    }
    if (String(url).endsWith('/auth/check-user')) {
      return new Response(JSON.stringify({ user: { id: 1, role: 'lider', assignedSector: 'CORTE' }, unit: { code: 'UNIDADE_01' } }), { status: 200 });
    }
    protectedRequests += 1;
    if (protectedRequests <= 2) return new Response(JSON.stringify({ error: 'Sessão expirada' }), { status: 401 });
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    sessionStorage.clear();
  });

  const [first, second] = await Promise.all([
    api.get('/inventory/search', { headers: { authorization: 'Bearer expired-token' } }),
    api.get('/dashboard/summary'),
  ]);

  assert.deepEqual(first.data, { items: [] });
  assert.deepEqual(second.data, { items: [] });
  assert.equal(calls.filter(({ url }) => url.endsWith('/auth/me')).length, 1);
  const retried = calls.filter(({ url }) => url.endsWith('/inventory/search') || url.endsWith('/dashboard/summary')).slice(-2);
  assert.ok(retried.every(({ init }) => init.headers.get('authorization') === `Bearer ${refreshedToken}`));
  assert.equal(JSON.parse(localStorage.getItem('user')).assignedSector, 'CORTE');
});

test('falha de refresh rejeita requisições concorrentes e limpa a sessão sem loop', async t => {
  const { api } = await loadComponent('src/services/httpClient.ts', { mockHttpClient: false });
  const originalFetch = globalThis.fetch;
  let refreshCalls = 0;
  let protectedCalls = 0;
  localStorage.setItem('user', JSON.stringify({ usuario: 'OPERADOR01', token: 'expired-token', unit: { code: 'SAJ' } }));
  sessionStorage.setItem('expirationTime', 'expired');
  globalThis.fetch = async url => {
    if (String(url).endsWith('/auth/me')) {
      refreshCalls++;
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401 });
    }
    assert.ok(!String(url).endsWith('/auth/check-user'));
    protectedCalls++;
    return new Response(JSON.stringify({ error: 'Token expirado' }), { status: 401 });
  };
  t.after(() => { globalThis.fetch = originalFetch; localStorage.clear(); sessionStorage.clear(); });
  const results = await Promise.allSettled([api.get('/inventory/search'), api.get('/dashboard/summary')]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(refreshCalls, 1);
  assert.equal(protectedCalls, 2);
  assert.equal(localStorage.getItem('user'), null);
  assert.equal(sessionStorage.getItem('expirationTime'), null);
});

test('logout limpa store e armazenamento mesmo com provedor indisponível', async t => {
  const { createPinia, setActivePinia } = await import('pinia');
  const { useAuthStore } = await loadComponent('src/stores/auth.js');
  const previousPost = mockedApi.post;
  localStorage.setItem('user', JSON.stringify({ usuario: 'OPERADOR01', token: 'test-token', unit: { code: 'SAJ' } }));
  sessionStorage.setItem('expirationTime', 'later');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.availableUnits = [{ code: 'SAJ' }];
  mockedApi.post = async url => { assert.equal(url, '/auth/logout'); throw new Error('Provider unavailable'); };
  t.after(() => { mockedApi.post = previousPost; localStorage.clear(); sessionStorage.clear(); });
  await assert.rejects(auth.logout(), /Provider unavailable/);
  assert.equal(auth.isAuthenticated, false);
  assert.equal(auth.user, null);
  assert.deepEqual([...auth.availableUnits], []);
  assert.equal(localStorage.getItem('user'), null);
  assert.equal(sessionStorage.getItem('expirationTime'), null);
});
