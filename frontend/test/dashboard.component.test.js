import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { loadComponent, mountComponent, api, flushPromises } from './componentsHarness.js'

beforeEach(() => { localStorage.setItem('user', JSON.stringify({ role: 'admin', unit: { code: 'SEST' } })); });

async function routerFor(component) {
  const { createRouter, createMemoryHistory } = await import('vue-router')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component }] })
  await router.push('/')
  await router.isReady()
  return router
}

test('Dashboard mostra última atualização e filtros de setor acessíveis após sucesso', async () => {
  const component = await loadComponent('src/pages/Dashboard.vue')
  const router = await routerFor(component)
  api.get = async (path) => path === '/dashboard/summary' ? {
    data: { stats: { totalItems: 12 }, volumePorSetor: [{ sector: 'CORTE', quantity: 4 }] },
  } : { data: [] }
  const mounted = await mountComponent(component, { router })
  await flushPromises()
  assert.match(mounted.element.textContent, /Última atualização/)
  assert.ok(mounted.element.querySelector('button[aria-pressed="true"]'))
  assert.equal(Boolean(mounted.element.querySelector('[role="alert"]')), false)
  mounted.unmount()
})

test('Dashboard oferece retry quando a consulta falha', async () => {
  const component = await loadComponent('src/pages/Dashboard.vue')
  const router = await routerFor(component)
  let attempts = 0
  api.get = async (path) => {
    if (path !== '/dashboard/summary') return { data: [] }
    attempts += 1
    if (attempts === 1) throw new Error('offline')
    return { data: { stats: { totalItems: 1 } } }
  }
  const mounted = await mountComponent(component, { router })
  await flushPromises()
  const retry = mounted.element.querySelector('[role="alert"] button')
  assert.ok(retry)
  retry.click()
  await flushPromises()
  assert.equal(attempts, 2)
  mounted.unmount()
})


test('Dashboard de Corte apresenta saídas mistas como registros, sem rotular o total como m²', async () => {
  const component = await loadComponent('src/pages/Dashboard.vue')
  const router = await routerFor(component)
  api.get = async (path) => path === '/dashboard/summary' ? {
    data: { stats: { totalItems: 2 }, setores: { corte: {
      itemsCount: 2, totalQuantity: null, quantitiesByUnit: { KG: 2, 'M²': 7 },
      totalExits: 3, totalExitsVolume: null, exitsByUnit: { KG: 2, 'M²': 7 },
    } } },
  } : { data: [] }
  const mounted = await mountComponent(component, { router })
  await flushPromises()
  const sector = [...mounted.element.querySelectorAll('button[aria-pressed]')].find(button => button.textContent.includes('Corte'))
  assert.ok(sector)
  sector.click()
  await flushPromises()
  assert.match(mounted.element.textContent, /registros de saída/)
  assert.doesNotMatch(mounted.element.textContent, /m² eliminados/)
  assert.match(mounted.element.textContent, /Saídas de Sobras/)
  mounted.unmount()
})

test('Dashboard do Admin de Setor oferece somente o setor atribuído', async () => {
  const component = await loadComponent('src/pages/Dashboard.vue');
  const { createPinia } = await import('pinia');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'admin_setor', assignedSector: 'CORTE', unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  api.get = async () => ({ data: { stats: {}, setores: { corte: { itemsCount: 1 } } } });
  const router = await routerFor(component);
  const mounted = await mountComponent(component, { router, pinia });
  await flushPromises();
  const sectorButtons = [...mounted.element.querySelectorAll('button[aria-pressed]')];
  assert.equal(sectorButtons.length, 1);
  assert.match(sectorButtons[0].textContent, /Corte/);
  assert.equal(sectorButtons[0].getAttribute('aria-pressed'), 'true');
  mounted.unmount();
});
