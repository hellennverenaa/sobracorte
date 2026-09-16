import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Executa as actions reais da store com o transporte oficial simulado, sem rede.
function loadStore(authApi: object, api: object, loginFlow: object) {
  const source = readFileSync(path.resolve(__dirname, '../../frontend/src/stores/auth.js'), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace('export const useAuthStore =', 'globalThis.store =');
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const context = vm.createContext({
    authApi, api, localStorage: storage, sessionStorage: storage, ...loginFlow,
    defineStore: (_name: string, options: any) => options,
  });
  vm.runInContext(source, context);
  return context.store;
}

test('indisponibilidade ou rejeição do provedor externo não chama login legado nem sincroniza usuário', async () => {
  for (const failure of [
    { message: 'Network Error', code: 'ERR_NETWORK' },
    { response: { status: 503, data: { message: 'Provedor indisponível' } } },
    { response: { status: 401, data: { message: 'Credenciais inválidas' } } },
  ]) {
    let providerCalls = 0;
    const store = loadStore({ post: async (url: string, body: object) => {
      providerCalls++;
      assert.equal(url, '/auth/external/login');
      assert.equal(JSON.stringify(body), JSON.stringify({ unidade: 'SAJ', usuario: 'USER', senha: 'test-password' }));
      throw failure;
    } }, { post: () => assert.fail('Não deve sincronizar usuário sem identidade validada') }, {
      normalizeUnitCode: (unit: string) => unit.trim().toUpperCase(),
      loginRequest: (unidade: string, usuario: string, senha: string) => ({
        endpoint: '/auth/external/login', payload: { unidade, usuario, senha }, legacy: false,
      }),
      externalLoginMessage: () => null,
    });
    const state = store.state();
    await assert.rejects(() => store.actions.login.call(state, 'USER', 'test-password', 'SAJ'));
    assert.equal(providerCalls, 1);
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.user, null);
  }
});
