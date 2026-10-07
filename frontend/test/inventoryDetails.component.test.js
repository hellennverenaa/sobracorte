import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComponent, mountComponent, api, flushPromises } from './componentsHarness.js';

async function openItem(user, quantity = 3) {
  const component = await loadComponent('src/pages/InventoryHub.vue');
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { ...user, unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  localStorage.clear();
  api.get = async url => ({ data: url === '/inventory/search' ? {
    metrics: {}, sectors: { corte: { total: 1, data: [{ id: 1, code: 'PECA-1',
      sector: 'CORTE', type: 'Peça', materialColor: 'Azul', footSide: 'E', quantity,
      unit: 'UN', subsector: { name: 'Serigrafia' },
      locations: [{ locationId: 1, quantity, location: { id: 1, name: 'A1', sector: 'CORTE' } }] }] } },
    pagination: { page: 1, total: 1, totalPages: 1, limit: 50 },
    filterOptions: { locations: [{ id: 1, name: 'A1', sector: 'CORTE' }] },
  } : [] });
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/inventory', component }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] });
  await router.push('/inventory?sector=CORTE');
  const mounted = await mountComponent(component, { pinia, router });
  await flushPromises();
  mounted.element.querySelector('tbody tr[tabindex="0"]').click();
  await flushPromises();
  return mounted;
}

for (const user of [{ role: 'leitor', assignedSector: 'CORTE' }, { role: 'admin_setor', assignedSector: 'APOIO' }]) {
  test(`modal unificado oferece somente consulta para ${user.role} sem permissão neste setor`, async () => {
    const mounted = await openItem(user);
    const dialog = mounted.element.querySelector('[aria-label="Detalhes do item de estoque"]');
    assert.ok(dialog);
    assert.match(dialog.textContent, /Serigrafia/);
    assert.match(dialog.textContent, /Azul/);
    assert.match(dialog.textContent, /Pé Esquerdo/);
    assert.match(dialog.textContent, /A1/);
    assert.match(dialog.textContent, /Somente leitura/);
    assert.equal(dialog.querySelector('textarea'), null);
    assert.equal([...dialog.querySelectorAll('button')].some(button => /Confirmar|Excluir|ENTRADA/.test(button.textContent)), false);
    dialog.querySelector('[aria-label="Fechar movimentação"]').click();
    await flushPromises();
    assert.equal(mounted.element.querySelector('[role="dialog"]'), null);
    mounted.unmount();
  });
}

test('excluir item zerado no modal unificado exige confirmação antes de chamar a API', async () => {
  let deleted = 0;
  api.delete = async url => { assert.equal(url, '/inventory/stock-items/1'); deleted++; return { data: {} }; };
  const mounted = await openItem({ role: 'admin' }, 0);
  const dialog = mounted.element.querySelector('[aria-label="Movimentação de estoque"]');
  const remove = [...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === 'Excluir');
  assert.equal(remove.disabled, false);
  assert.doesNotMatch(dialog.textContent, /Operador Responsável|Matrícula:/);
  remove.click();
  await flushPromises();
  assert.equal(deleted, 0);
  assert.equal(mounted.element.querySelector('[aria-label="Movimentação de estoque"]'), null);
  const confirm = [...mounted.element.querySelectorAll('button')].find(button => button.textContent.trim() === 'Sim, Excluir Item');
  assert.ok(confirm);
  confirm.click();
  await flushPromises();
  assert.equal(deleted, 1);
  mounted.unmount();
});
