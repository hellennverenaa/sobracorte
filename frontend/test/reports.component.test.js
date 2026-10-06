import assert from 'node:assert/strict'
import test from 'node:test'
import { loadComponent, mountComponent, api, flushPromises } from './componentsHarness.js'

async function routerFor(component) {
  const { createRouter, createMemoryHistory } = await import('vue-router')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/reports', component }] })
  await router.push('/reports')
  await router.isReady()
  return router
}

test('Reports consulta no servidor e preserva total da paginação', async () => {
  const component = await loadComponent('src/pages/Reports.vue')
  const router = await routerFor(component)
  const calls = []
  api.get = async (path) => {
    calls.push(path)
    if (path === '/settings/origins') return { data: [] }
    if (path === '/settings/subsectors') return { data: [] }
    return {
      data: {
        items: [{ id: 'movement-1', data: new Date().toISOString(), setor: 'CORTE', tipo: 'ENTRADA', quantidade: 2, unidade: 'M²', responsavel: 'Operador', prateleira: 'PRAT-A1', motivo: 'Casamento de Par - Pé D. Obs: detalhe operacional' }],
        pagination: { page: 1, limit: 50, total: 101, totalPages: 3 },
        totals: { totalRegistros: 101, qtdOperacoesEntrada: 1 },
      },
    }
  }
  const mounted = await mountComponent(component, { router })
  await flushPromises()
  assert.ok(calls.some((path) => path.startsWith('/reports/movements?')))
  assert.match(mounted.element.textContent, /Total: 101 registros/)
  assert.match(mounted.element.textContent, /Casamento de Par - Pé D\./)
  assert.doesNotMatch(mounted.element.textContent, /detalhe operacional/)
  const locationCell = [...mounted.element.querySelectorAll('.report-table-movements td')]
    .find((cell) => cell.textContent.includes('PRAT-A1'))
  assert.ok(locationCell?.classList.contains('print:hidden'))
  assert.ok(mounted.element.querySelector('select[aria-label="Setor industrial"]'))
  assert.ok(mounted.element.querySelector('button[aria-label="Próxima página"]'))
  mounted.unmount()
})

test('Reports mostra erro recuperável e mantém botão de retry', async () => {
  const component = await loadComponent('src/pages/Reports.vue')
  const router = await routerFor(component)
  let attempts = 0
  api.get = async (path) => {
    if (path === '/settings/origins') return { data: [] }
    if (path === '/settings/subsectors') return { data: [] }
    attempts += 1
    throw new Error('serviço indisponível')
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

test('Reports limpar filtros inicia consulta controlada pela página e permite retry', async () => {
  const component = await loadComponent('src/pages/Reports.vue')
  const router = await routerFor(component)
  let attempts = 0
  api.get = async (path) => {
    if (path === '/settings/origins') return { data: [] }
    if (path === '/settings/subsectors') return { data: [] }
    attempts += 1
    if (attempts === 2) throw new Error('falha ao recarregar')
    return { data: { items: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 }, totals: {} } }
  }
  const mounted = await mountComponent(component, { router })
  await flushPromises()
  const clear = [...mounted.element.querySelectorAll('button')].find((button) => /Limpar Filtros/i.test(button.textContent))
  assert.ok(clear)
  clear.click()
  await flushPromises()
  const retry = mounted.element.querySelector('[role="alert"] button')
  assert.ok(retry)
  retry.click()
  await flushPromises()
  assert.equal(attempts, 3)
  mounted.unmount()
})

test('Reports restringe seletor e consultas ao setor atribuído, inclusive após limpar filtros', async () => {
  const component = await loadComponent('src/pages/Reports.vue');
  const { createPinia } = await import('pinia');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'lider', assignedSector: 'APOIO', unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  const calls = [];
  api.get = async path => {
    if (path === '/settings/origins') return { data: [] };
    if (path === '/settings/subsectors') return { data: [] };
    if (path.startsWith('/reports/')) calls.push(path);
    return { data: { items: [], pagination: { page: 1, total: 0, totalPages: 1 }, totals: {} } };
  };
  const router = await routerFor(component);
  const mounted = await mountComponent(component, { router, pinia });
  await flushPromises();
  const sector = mounted.element.querySelector('select[aria-label="Setor industrial"]');
  assert.equal(sector.options.length, 1);
  assert.equal(sector.value, 'APOIO');
  assert.equal(sector.options[0].textContent.trim(), 'Peças Cortadas');
  const clear = [...mounted.element.querySelectorAll('button')].find(button => /Limpar Filtros/i.test(button.textContent));
  clear.click();
  await flushPromises();
  assert.ok(calls.length >= 2);
  assert.ok(calls.every(path => new URL(path, 'http://localhost').searchParams.get('sector') === 'APOIO'));
  mounted.unmount();
});

test('Reports envia o subsetor selecionado na consulta de movimentos', async () => {
  const component = await loadComponent('src/pages/Reports.vue');
  const { createPinia } = await import('pinia');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'admin', isGlobalAdmin: true, unit: { code: 'REPORT-SUBSECTOR-TEST' } }, isAuthenticated: true, availableUnits: [] };
  const calls = [];
  api.get = async path => {
    calls.push(path);
    if (path === '/settings/origins') return { data: [] };
    if (path === '/settings/subsectors') return { data: [{ id: 12, name: 'Serigrafia', sector: 'APOIO' }] };
    return { data: { items: [], pagination: { page: 1, total: 0, totalPages: 1 }, totals: {} } };
  };
  const router = await routerFor(component);
  const mounted = await mountComponent(component, { router, pinia });
  await flushPromises();

  const sector = mounted.element.querySelector('select[aria-label="Setor industrial"]');
  sector.value = 'TODOS';
  sector.dispatchEvent(new Event('change', { bubbles: true }));
  await flushPromises();
  const subsector = mounted.element.querySelector('select[aria-label="Subsetor do relatório"]');
  assert.ok(subsector);
  assert.match(subsector.textContent, /Serigrafia/);
  subsector.value = '12';
  subsector.dispatchEvent(new Event('change', { bubbles: true }));
  mounted.element.querySelector('button[aria-label="Aplicar filtros"]').click();
  await flushPromises();

  const reportCalls = calls.filter(path => path.startsWith('/reports/movements?'));
  assert.ok(reportCalls.some(path => new URL(path, 'http://localhost').searchParams.get('subsectorId') === '12'));
  mounted.unmount();
});
