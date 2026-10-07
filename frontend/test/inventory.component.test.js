import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComponent, mountComponent, api, flushPromises } from './componentsHarness.js';

test('URL legada de Consumo é descartada e usa Corte para administrador', async () => {
  const component = await loadComponent('src/pages/InventoryHub.vue');
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  localStorage.clear();
  let sector;
  api.get = async (url, config) => {
    if (url === '/settings/units') return { data: [{ symbol: 'M²', name: 'Metro Quadrado', integerOnly: false, decimalPlaces: 3 }] };
    if (url !== '/inventory/search') return { data: [] };
    sector = config.params.sector;
    return { data: {
      metrics: { totalItems: 0, totalCorte: 0, totalApoio: 0, totalPreFabricado: 0, totalExpedicao: 0, totalMontagem: 0 },
      sectors: { corte: { total: 0, data: [] }, apoio: { total: 0, data: [] }, preFabricado: { total: 0, data: [] }, distribuicao: { total: 0, data: [] }, expedicao: { total: 0, data: [] }, montagem: { total: 0, data: [] } },
      filterOptions: { locations: [], origins: [], categories: [] },
      pagination: { page: 1, total: 0, totalPages: 1, limit: 50 },
    } };
  };
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inventory', component }] });
  await router.push('/inventory?sector=CONSUMO');
  const mounted = await mountComponent(component, { pinia, router });
  await flushPromises();
  assert.equal(sector, 'CORTE');
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

test('entrada lista somente localizações do setor e subsetor selecionados', async () => {
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const component = await loadComponent('src/components/SectorFormInput.vue');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  api.get = async url => {
    if (url === '/settings/locations') return { data: [
      { id: 1, name: 'LEGADO-APOIO', sector: 'APOIO', subsectorId: null },
      { id: 2, name: 'SERIGRAFIA-01', sector: 'APOIO', subsectorId: 8 },
      { id: 3, name: 'MONTAGEM-01', sector: 'MONTAGEM', subsectorId: null },
    ] };
    if (url === '/settings/subsectors') return { data: [
      { id: 8, name: 'Serigrafia', sector: 'APOIO', active: true, categoryMode: 'ALL', categoryLinks: [] },
    ] };
    return { data: [] };
  };
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  await router.push('/');
  const mounted = await mountComponent(component, { pinia, router });
  await flushPromises();

  const apoioButton = [...mounted.element.querySelectorAll('[aria-label="Setor da entrada de estoque"] button')]
    .find(button => button.textContent.includes('Peças Cortadas'));
  assert.ok(apoioButton);
  apoioButton.click();
  await flushPromises();

  const subsectorSelect = mounted.element.querySelector('#entry-subsector');
  assert.ok(subsectorSelect);
  assert.deepEqual([...subsectorSelect.options].map(option => option.textContent.trim()), [
    'Sem subsetor (fluxo atual do setor)', 'Serigrafia',
  ]);
  subsectorSelect.value = '8';
  subsectorSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await flushPromises();

  const locationSelect = [...mounted.element.querySelectorAll('select')]
    .find(select => [...select.options].some(option => option.textContent.includes('SERIGRAFIA-01')));
  assert.ok(locationSelect);
  assert.deepEqual([...locationSelect.options].map(option => option.textContent.trim()), [
    'Selecione a Prateleira...', 'SERIGRAFIA-01',
  ]);
  mounted.unmount();
  api.get = async () => ({ data: [] });
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
    if (url === '/settings/units') return { data: [{ symbol: 'M²', name: 'Metro Quadrado', integerOnly: false, decimalPlaces: 3 }] };
    if (url !== '/inventory/search') return { data: {} };
    reads++;
    return { data: { metrics: {}, sectors: { corte: { total: 1, data: [{ id: 23, sector: 'CORTE', code: 'MAT-1', name: 'Material', quantity: 5, unit: 'M2', locations: [{ locationId: 1, quantity: 5, location: { id: 1, name: 'A1', sector: 'CORTE' } }] }] } }, pagination: { page: 1, total: 1, totalPages: 1, limit: 50 }, filterOptions: { locations: [{ id: 1, name: 'A1', sector: 'CORTE' }, { id: 2, name: 'A2', sector: 'CORTE' }, { id: 3, name: 'OUTRO-SETOR', sector: 'MONTAGEM' }, { id: 4, name: 'GERAL', sector: null }] } } };
  };
  api.post = async (url, payload) => { movement = { url, payload }; return { data: {} }; };
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inventory', component }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
  await router.push('/inventory?sector=CORTE');
  const mounted = await mountComponent(component, { pinia, router });
  await flushPromises();
  assert.match(mounted.element.textContent, /MAT-1/);
  const row = mounted.element.querySelector('tbody tr[tabindex="0"]');
  assert.ok(row);
  assert.equal(row.querySelectorAll('button').length, 0);
  assert.equal([...mounted.element.querySelectorAll('th')].some(th => th.textContent === 'Ações'), false);
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await flushPromises();
  const details = mounted.element.querySelector('[aria-label="Movimentação de estoque"]');
  assert.match(details.textContent, /MAT-1/);
  assert.ok(details.contains(document.activeElement));
  assert.equal(mounted.element.querySelector('[aria-label="Detalhes do item de estoque"]'), null);
  assert.doesNotMatch(details.textContent, /fluxo legado|A movimentação mantém o subsetor/);
  assert.match(details.textContent, /A1/);
  assert.equal([...details.querySelectorAll('button')].find(button => button.textContent.trim() === 'Excluir').disabled, true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await flushPromises();
  assert.equal(mounted.element.querySelector('[aria-label="Movimentação de estoque"]'), null);
  mounted.element.querySelector('article[role="button"]').click();
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
  assert.equal(mounted.element.querySelector('[aria-label="Detalhes do item de estoque"]'), null);
  mounted.unmount();
});

}

test('entrada preserva fração digitada e rejeita unidade discreta sem truncar', async () => {
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const component = await loadComponent('src/components/SectorFormInput.vue');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  api.get = async url => ({ data: url === '/settings/locations' ? [{ id: 1, name: 'A1', sector: 'CORTE', categoryMode: 'ALL' }] : url === '/settings/categories' ? [{ id: 1, name: 'TECIDO', sector: 'CORTE', defaultUnitCode: 'M²', entryMode: 'QUANTITY' }, { id: 2, name: 'PEÇA', sector: 'CORTE', defaultUnitCode: 'UN', entryMode: 'QUANTITY' }] : url === '/settings/units' ? [{ symbol: 'M²', name: 'Metro Quadrado', integerOnly: false, decimalPlaces: 3 }, { symbol: 'UN', name: 'Unidade', integerOnly: true, decimalPlaces: 0 }] : [] });
  let writes = 0;
  api.post = async () => { writes++; return { data: {} }; };
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  await router.push('/');
  const mounted = await mountComponent(component, { pinia, router });
  await flushPromises();
  const quantity = mounted.element.querySelector('input[inputmode="decimal"]');
  assert.ok(quantity);
  for (const value of ['1,01', '1.0001']) {
    quantity.value = value;
    quantity.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    assert.equal(quantity.value, value.replace(',', '.'));
  }
  const unit = mounted.element.querySelector('select[aria-required="true"]');
  assert.ok(unit);
  unit.value = '2';
  unit.dispatchEvent(new Event('change', { bubbles: true }));
  await flushPromises();
  const locationLabel = [...mounted.element.querySelectorAll('label')].find(label => label.textContent.includes('Prateleira / Localização'));
  const location = locationLabel.parentElement.querySelector('select');
  location.value = 'A1';
  location.dispatchEvent(new Event('change', { bubbles: true }));
  quantity.value = '1.01';
  quantity.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
  assert.equal(quantity.value, '1.01');
  mounted.element.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flushPromises();
  assert.match(mounted.element.textContent, /inteiro/);
  assert.equal(writes, 0);
  mounted.unmount();
});
