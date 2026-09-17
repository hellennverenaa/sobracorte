import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComponent, mountComponent, api, flushPromises } from './componentsHarness.js';

test('Consumo abre pela rota e exibe código, descrição e unidade do insumo', async () => {
  const component = await loadComponent('src/pages/InventoryHub.vue');
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'leitor', assignedSector: 'CONSUMO', unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  localStorage.clear();
  let sector;
  api.get = async (url, config) => {
    if (url !== '/inventory/search') return { data: [] };
    sector = config.params.sector;
    return { data: { metrics: { totalConsumo: 1 }, sectors: { consumo: { total: 1, data: [
      { id: 7, sector: 'CONSUMO', code: 'INS-KG', name: 'COLA SINTÉTICA', quantity: 1.5, unit: 'KG', locationDisplay: 'C1' },
    ] } }, pagination: { page: 1, total: 1, totalPages: 1, limit: 50 } } };
  };
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inventory', component }] });
  await router.push('/inventory?sector=CONSUMO');
  const mounted = await mountComponent(component, { pinia, router });
  await flushPromises();
  assert.equal(sector, 'CONSUMO');
  assert.match(mounted.element.textContent, /INS-KG/);
  assert.match(mounted.element.textContent, /COLA SINTÉTICA/);
  assert.match(mounted.element.textContent, /KG/);
  assert.match(mounted.element.textContent, /Consumo/);
  mounted.unmount();
});

test('store de estoque mantém carregamento enquanto outra operação estiver pendente', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());
  const { useStockStore } = await loadComponent('src/stores/stockStore.ts');
  const store = useStockStore();
  const pending = [];
  api.get = () => new Promise((resolve) => pending.push(resolve));
  const inventory = store.fetchInventory();
  const history = store.fetchHistory();
  assert.equal(store.loading, true);
  pending[0]({ data: { metrics: {}, sectors: {}, pagination: {} } });
  await inventory;
  assert.equal(store.loading, true);
  pending[1]({ data: { data: [], total: 0 } });
  await history;
  assert.equal(store.loading, false);
  assert.equal(store.pendingOperations, 0);
});

test('resposta atrasada de outra unidade não sobrescreve estoque, pares ou histórico atuais', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  const pinia = createPinia();
  setActivePinia(pinia);
  pinia.state.value.auth = { user: { unit: { code: 'SEST' } } };
  const { useStockStore } = await loadComponent('src/stores/stockStore.ts');
  const store = useStockStore();
  const pending = [];
  api.get = () => new Promise(resolve => pending.push(resolve));
  const old = [store.fetchInventory(), store.fetchMatchingPairs(), store.fetchHistory()];
  pinia.state.value.auth.user.unit.code = 'SAJ';
  const current = [store.fetchInventory(), store.fetchMatchingPairs(), store.fetchHistory()];
  pending[3]({ data: { metrics: {}, sectors: { corte: { data: [{ code: 'SAJ' }] } } } });
  pending[4]({ data: { pairs: [{ sku: 'SAJ' }], totalMatchingPairsCount: 1 } });
  pending[5]({ data: { data: [{ itemCode: 'SAJ' }] } });
  await Promise.all(current);
  assert.equal(store.loading, true);
  pending[0]({ data: { metrics: {}, sectors: { corte: { data: [{ code: 'SEST' }] } } } });
  pending[1]({ data: { pairs: [{ sku: 'SEST' }] } });
  pending[2]({ data: { data: [{ itemCode: 'SEST' }] } });
  await Promise.all(old);
  assert.equal(store.sectors.corte.data[0].code, 'SAJ');
  assert.equal(store.matchingPairs[0].sku, 'SAJ');
  assert.equal(store.history.data[0].itemCode, 'SAJ');
  assert.equal(store.pendingOperations, 0);
});

test('App limpa estoque na troca de unidade e invalida resposta mesmo ao voltar à unidade inicial', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const component = await loadComponent('src/App.vue');
  const { useStockStore } = await loadComponent('src/stores/stockStore.ts');
  const pinia = createPinia();
  setActivePinia(pinia);
  pinia.state.value.auth = { user: { unit: { code: 'SEST' } } };
  const store = useStockStore();
  store.sectors.corte.data = [{ code: 'OLD' }];
  let finish;
  api.get = () => new Promise(resolve => { finish = resolve; });
  const pending = store.fetchInventory();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  await router.push('/');
  const mounted = await mountComponent(component, { pinia, router });
  pinia.state.value.auth.user.unit.code = 'SAJ';
  await flushPromises();
  assert.deepEqual([...store.sectors.corte.data], []);
  assert.equal(store.pendingOperations, 1);
  pinia.state.value.auth.user.unit.code = 'SEST';
  await flushPromises();
  finish({ data: { metrics: {}, sectors: { corte: { data: [{ code: 'OLD.RESPONSE' }] } } } });
  await pending;
  assert.deepEqual([...store.sectors.corte.data], []);
  assert.equal(store.pendingOperations, 0);
  mounted.unmount();
});

test('formulário de entrada alterado exige confirmação para cancelar', async () => {
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const component = await loadComponent('src/components/SectorFormInput.vue');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  api.get = async () => ({ data: [] });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  await router.push('/');
  let cancelled = 0;
  const mounted = await mountComponent(component, { pinia, router, props: { onCancel: () => cancelled++ } });
  await flushPromises();
  const input = mounted.element.querySelector('input[type="text"]');
  assert.ok(input);
  input.value = 'ALTERADO';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
  window.confirm = () => false;
  const cancel = [...mounted.element.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancelar');
  cancel.click();
  await flushPromises();
  assert.equal(cancelled, 0);
  window.confirm = () => true;
  cancel.click();
  await flushPromises();
  assert.equal(cancelled, 1);
  mounted.unmount();
});

for (const role of ['admin', 'admin_setor']) {
test(`estoque restringe destinos de ${role} e registra saída pela API oficial`, async () => {
  const component = await loadComponent('src/pages/InventoryHub.vue');
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role, assignedSector: 'CORTE', unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  localStorage.clear();
  let reads = 0;
  let movement;
  api.get = async (url) => {
    if (url !== '/inventory/search') return { data: {} };
    reads++;
    return { data: { metrics: {}, sectors: { corte: { total: 1, data: [{ id: 23, sector: 'CORTE', code: 'MAT-1', name: 'Material', quantity: 5, unit: 'M2', locations: [{ locationId: 1, quantity: 5, location: { id: 1, name: 'A1', sector: 'CORTE' } }] }] } }, pagination: { page: 1, total: 1, totalPages: 1, limit: 50 }, filterOptions: { locations: [{ id: 1, name: 'A1', sector: 'CORTE' }, { id: 2, name: 'A2', sector: 'CORTE' }, { id: 3, name: 'OUTRO-SETOR', sector: 'MONTAGEM' }, { id: 4, name: 'GERAL', sector: null }] } } };
  };
  api.post = async (url, payload) => { movement = { url, payload }; return { data: {} }; };
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inventory', component }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
  await router.push('/inventory');
  const mounted = await mountComponent(component, { pinia, router });
  await flushPromises();
  assert.match(mounted.element.textContent, /MAT-1/);
  mounted.element.querySelector('[title="Visualizar Detalhes"]').click();
  await flushPromises();
  const details = mounted.element.querySelector('[aria-label="Detalhes do item de estoque"]');
  assert.match(details.textContent, /MAT-1/);
  assert.ok(details.contains(document.activeElement));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await flushPromises();
  assert.equal(Boolean(mounted.element.querySelector('[aria-label="Detalhes do item de estoque"]')), false);
  mounted.element.querySelector('[title="Registrar Movimentação de Estoque"]').click();
  await flushPromises();
  const dialog = mounted.element.querySelector('[aria-label="Movimentação de estoque"]');
  assert.ok(dialog);
  const transfer = [...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === 'TRANSFERÊNCIA');
  assert.ok(transfer);
  transfer.click();
  await flushPromises();
  const destination = dialog.querySelector('select[aria-label="Prateleira de destino"]');
  assert.ok(destination);
  const options = [...destination.options].map(option => option.textContent);
  assert.ok(options.some(text => text.includes('A2')));
  assert.equal(options.some(text => text.includes('GERAL')), role === 'admin');
  assert.ok(options.every(text => !text.includes('OUTRO-SETOR')));
  assert.doesNotMatch(dialog.textContent, /Autorização Admin Master/);
  assert.doesNotMatch(dialog.textContent, /Motivo \/ Origem da Sobra/);
  const exit = [...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === 'SAÍDA');
  exit.click();
  await flushPromises();
  assert.doesNotMatch(dialog.textContent, /Motivo \/ Origem da Sobra/);
  const submit = [...dialog.querySelectorAll('button')].find((button) => button.textContent.includes('Confirmar SAIDA'));
  assert.equal(submit.disabled, false);
  submit.click();
  await flushPromises();
  assert.equal(movement.url, '/inventory/movements');
  assert.equal(movement.payload.stockItemId, 23);
  assert.equal(movement.payload.type, 'SAIDA');
  assert.equal(movement.payload.quantity, 1);
  assert.ok(reads >= 2);
  assert.match(mounted.element.textContent, /registrada com sucesso/);
  assert.equal(Boolean(mounted.element.querySelector('[aria-label="Movimentação de estoque"]')), false);
  mounted.unmount();
});

}
