import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComponent, mountComponent, api, flushPromises } from './componentsHarness.js';

for (const isGlobalAdmin of [false, true]) {
  test(`gestão de usuários protege Master para administrador ${isGlobalAdmin ? 'global' : 'local'}`, async () => {
    const component = await loadComponent('src/pages/Users.vue');
    const { createPinia } = await import('pinia');
    const { createRouter, createMemoryHistory } = await import('vue-router');
    const pinia = createPinia();
    pinia.state.value.auth = { user: { role: 'admin', usuario: 'LOCAL', isGlobalAdmin, unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
    api.get = async url => ({ data: url === '/users' ? [
      { id: 2, usuario: 'OPERADOR', nome: 'Operador', role: 'leitor', assignedSector: 'CORTE' },
      { id: 3, usuario: 'MASTER.ALVO', nome: 'Master Alvo', role: 'admin', assignedSector: null },
    ] : [] });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    await router.push('/');
    const mounted = await mountComponent(component, { pinia, router });
    await flushPromises();
    const rows = [...mounted.element.querySelectorAll('tbody tr')];
    const masterRow = rows.find(row => row.textContent.includes('MASTER.ALVO'));
    assert.ok(masterRow);
    for (const button of masterRow.querySelectorAll('button')) assert.equal(button.disabled, !isGlobalAdmin);
    const readerRow = rows.find(row => row.textContent.includes('OPERADOR'));
    readerRow.querySelector('[title="Editar Permissão e Setor"]').click();
    await flushPromises();
    assert.equal(Boolean(mounted.element.querySelector('input[type="radio"][value="admin"]')), isGlobalAdmin);
    assert.equal(mounted.element.querySelector('select option').disabled, true);
    mounted.unmount();
  });
}
