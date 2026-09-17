import assert from 'node:assert/strict'
import test from 'node:test'
import { api, flushPromises, loadComponent, mountComponent } from './componentsHarness.js'

test('filtros de requisições mantêm busca e emitem retry', async () => {
  const component = await loadComponent('src/components/RequisitionFilters.vue')
  const events = []
  const mounted = await mountComponent(component, {
    props: {
      status: 'PENDENTE',
      search: 'sku-1',
      onSearch: () => events.push('search'),
      onClearSearch: () => events.push('clear'),
    },
  })
  const search = mounted.element.querySelector('#requisition-search')
  assert.equal(search.value, 'sku-1')
  mounted.element.querySelector('button[title="Limpar busca"]').click()
  assert.deepEqual(events, ['clear'])
  mounted.element.querySelector('button:not([title])').click()
  assert.deepEqual(events, ['clear', 'search'])
  mounted.unmount()
})

test('consulta de requisições expõe erro recuperável e persiste filtros por unidade', async () => {
  const composable = await loadComponent('src/composables/useRequisitions.js')
  localStorage.clear()
  const state = composable.useRequisitions({
    route: { query: {} },
    authStore: { user: { role: 'admin', unit: { code: 'TESTE' } } },
  })
  api.get = async () => ({ data: { data: [{ id: '1', status: 'PENDENTE', stockAvailable: 2, quantityRequested: 1, quantityFulfilled: 0 }], total: 1, totalPages: 1 } })
  await state.loadRequisitions()
  assert.equal(state.requisitions.value.length, 1)
  state.filterStatus.value = 'PENDENTE'
  await flushPromises()
  assert.match(localStorage.getItem('sobracorte:filters:requisitions:TESTE'), /PENDENTE/)

  api.get = async () => { throw new Error('offline') }
  await state.loadRequisitions()
  assert.match(state.error.value, /Serviço indisponível/)
  api.get = async () => ({ data: [] })
})

test('página de requisições consulta a inbox ao montar', async () => {
  const { createPinia } = await import('pinia')
  const { createRouter, createMemoryHistory } = await import('vue-router')
  const component = await loadComponent('src/pages/Requisitions.vue')
  const pinia = createPinia()
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'TESTE' } }, isAuthenticated: true, availableUnits: [] }
  const calls = []
  api.get = async (endpoint) => {
    calls.push(endpoint)
    return endpoint === '/requisitions' ? { data: { data: [], total: 0, totalPages: 1 } } : { data: [] }
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/requisitions', component }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/requisitions')
  const mounted = await mountComponent(component, { pinia, router })
  await flushPromises()
  assert.ok(calls.includes('/requisitions'))
  assert.match(mounted.element.textContent, /Nenhuma requisição de reposição encontrada/)
  const open = [...mounted.element.querySelectorAll('button')].find(button => button.textContent.includes('Nova Solicitação'))
  open.click()
  await flushPromises()
  const close = mounted.element.querySelector('[aria-label="Fechar nova solicitação"]')
  close.click()
  await flushPromises()
  assert.equal(Boolean(mounted.element.querySelector('[aria-label="Fechar nova solicitação"]')), false, 'formulário inicial não deve ser considerado sujo')

  open.click()
  await flushPromises()
  const sku = mounted.element.querySelector('[role="dialog"] input')
  sku.value = 'SKU-ALTERADO'
  sku.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
  mounted.element.querySelector('[aria-label="Fechar nova solicitação"]').click()
  await flushPromises()
  assert.ok(mounted.element.querySelector('[aria-label="Fechar nova solicitação"]'))
  const keepEditing = [...mounted.element.querySelectorAll('[role="dialog"] button')]
    .find(button => button.textContent.includes('Continuar editando'))
  assert.ok(keepEditing)
  keepEditing.click()
  await flushPromises()
  assert.ok(mounted.element.querySelector('[aria-label="Fechar nova solicitação"]'))
  mounted.element.querySelector('[aria-label="Fechar nova solicitação"]').click()
  await flushPromises()
  const discard = [...mounted.element.querySelectorAll('[role="dialog"] button')]
    .find(button => button.textContent.includes('Descartar alterações'))
  assert.ok(discard)
  discard.click()
  await flushPromises()
  assert.equal(Boolean(mounted.element.querySelector('[aria-label="Fechar nova solicitação"]')), false)
  mounted.unmount()
})
