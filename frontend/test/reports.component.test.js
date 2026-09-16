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
    return {
      data: {
        items: [{ id: 'movement-1', data: new Date().toISOString(), setor: 'CORTE', tipo: 'ENTRADA', quantidade: 2, unidade: 'M²', responsavel: 'Operador' }],
        pagination: { page: 1, limit: 50, total: 101, totalPages: 3 },
        totals: { totalRegistros: 101, qtdOperacoesEntrada: 1 },
      },
    }
  }
  const mounted = await mountComponent(component, { router })
  await flushPromises()
  assert.ok(calls.some((path) => path.startsWith('/reports/movements?')))
  assert.match(mounted.element.textContent, /Total: 101 registros/)
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
