import assert from 'node:assert/strict'
import test from 'node:test'
import { loadComponent, mountComponent, api, flushPromises } from './componentsHarness.js'

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
