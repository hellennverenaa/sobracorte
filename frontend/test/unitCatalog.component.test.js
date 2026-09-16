import assert from 'node:assert/strict';
import test from 'node:test';
import { api, loadComponent, mountComponent, flushPromises } from './componentsHarness.js';

const { createPinia, setActivePinia } = await import('pinia');
const { useAuthStore } = await loadComponent('src/stores/auth.js');

test('catálogo compartilha consultas simultâneas, reutiliza resultados e permite atualização explícita', async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useAuthStore();
  let calls = 0;
  let complete;
  api.get = () => {
    calls++;
    return new Promise(resolve => { complete = resolve; });
  };
  const first = store.fetchAvailableUnits();
  const second = store.fetchAvailableUnits();
  assert.equal(calls, 1);
  complete({ data: { data: [{ code: 'SEST' }] } });
  assert.deepEqual(await first, [{ code: 'SEST' }]);
  assert.deepEqual(await second, [{ code: 'SEST' }]);
  await store.fetchAvailableUnits();
  assert.equal(calls, 1);
  const forced = store.fetchAvailableUnits({ force: true });
  complete({ data: [{ code: 'SEST' }, { code: 'VDC' }] });
  await forced;
  assert.equal(calls, 2);
  assert.equal(store.availableUnits.length, 2);
});

test('falha do catálogo mantém erro visível e libera nova tentativa', async () => {
  setActivePinia(createPinia());
  const store = useAuthStore();
  api.get = async () => { throw { response: { status: 429, data: { error: 'Muitas requisições.' } } }; };
  assert.deepEqual(await store.fetchAvailableUnits(), []);
  assert.match(store.unitLoadError, /Muitas requisições/);
  api.get = async () => ({ data: [{ code: 'SEST' }] });
  await store.fetchAvailableUnits();
  assert.equal(store.unitLoadError, '');
  assert.equal(store.availableUnits.length, 1);
});

test('login usa o catálogo compartilhado e mantém SEST disponível sem catálogo externo', async () => {
  const component = await loadComponent('src/pages/Login.vue');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  await router.push('/');
  let calls = 0;
  api.get = async url => {
    if (url === '/auth/external/units') throw new Error('Catálogo externo indisponível');
    calls++;
    return { data: { data: [{ code: 'SEST', name: 'Santo Estêvão' }, { code: 'VDC' }] } };
  };
  const mounted = await mountComponent(component, { router });
  await flushPromises();
  const selector = mounted.element.querySelector('select');
  assert.equal(selector.value, 'SEST');
  assert.equal(selector.querySelectorAll('option').length, 2);
  assert.equal(mounted.element.textContent.includes('O login está indisponível'), false);
  const store = useAuthStore(mounted.pinia);
  await store.fetchAvailableUnits();
  assert.equal(calls, 1, 'login e sessão devem compartilhar o mesmo catálogo');
});
