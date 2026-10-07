import assert from 'node:assert/strict'
import test from 'node:test'
import { api, flushPromises, loadComponent, mountComponent } from './componentsHarness.js'

test('navegação de Settings expõe aba ativa e seleção acessível', async () => {
  const component = await loadComponent('src/components/SettingsTabNav.vue')
  const mounted = await (async () => {
    const { mountComponent } = await import('./componentsHarness.js')
    return mountComponent(component, {
      props: {
        tabs: [{ key: 'categories', label: 'Categorias' }, { key: 'units', label: 'Unidades' }],
        activeTab: 'categories',
      },
    })
  })()
  const active = mounted.element.querySelector('[aria-current="page"]')
  assert.equal(active.textContent.trim(), 'Categorias')
  mounted.unmount()
})

test('carregadores de Settings distinguem erro e permitem nova tentativa', async () => {
  const composable = await loadComponent('src/composables/useSettings.js')
  const messages = []
  const state = composable.useSettings({ notify: (message) => messages.push(message) })
  api.get = async (endpoint) => {
    if (endpoint === '/settings/categories') return { data: [{ id: 1, name: 'TECIDO' }] }
    throw Object.assign(new Error('offline'), { response: { data: { error: 'Serviço indisponível' } } })
  }
  await state.fetchCategories()
  assert.equal(state.categories.value[0].name, 'TECIDO')
  await state.fetchUnits()
  assert.equal(state.error.value, 'Serviço indisponível')
  assert.equal(messages.length, 1)
  api.get = async () => ({ data: [] })
})

test('página de Settings carrega as coleções ao montar', async () => {
  const { createPinia } = await import('pinia')
  const { createRouter, createMemoryHistory } = await import('vue-router')
  const component = await loadComponent('src/pages/Settings.vue')
  const pinia = createPinia()
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'TESTE' } }, isAuthenticated: true, availableUnits: [] }
  const calls = []
  api.get = async (endpoint) => {
    calls.push(endpoint)
    return { data: [] }
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings', component }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/settings')
  const mounted = await mountComponent(component, { pinia, router })
  await flushPromises()
  assert.doesNotMatch(mounted.element.textContent, /Regras especiais|Gerenciar opções de subtipo/)
  assert.deepEqual(calls.sort(), ['/factory-unit/current', '/requisitions/pending-count', '/settings/categories', '/settings/locations', '/settings/origins', '/settings/subsectors', '/settings/units'])
  assert.equal(mounted.element.textContent.includes('Unidades de Medida'), false)
  assert.equal(mounted.element.textContent.includes('Adicionar Unidade'), false)
  mounted.unmount()
  api.get = async () => ({ data: [] })
})

test('modelo CSV do setor APOIO apresenta Peças Cortadas', async () => {
  const { createPinia } = await import('pinia')
  const { createRouter, createMemoryHistory } = await import('vue-router')
  const component = await loadComponent('src/pages/Settings.vue')
  const pinia = createPinia()
  pinia.state.value.auth = { user: { role: 'admin', assignedSector: 'APOIO', unit: { code: 'TESTE' } }, isAuthenticated: true, availableUnits: [] }
  api.get = async () => ({ data: [] })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings', component }] })
  await router.push('/settings')
  const mounted = await mountComponent(component, { pinia, router })
  await flushPromises()
  const importTab = [...mounted.element.querySelectorAll('button')].find((button) => button.textContent.includes('Importar CSV'))
  assert.ok(importTab)
  importTab.click()
  await flushPromises()
  assert.match(mounted.element.textContent, /Modelo: Peças Cortadas/)
  assert.match(mounted.element.textContent, /Padrão Exigido para o Arquivo CSV — Peças Cortadas/)
  assert.match(mounted.element.textContent, /Exemplo de Arquivo CSV Válido \(Peças Cortadas\)/)
  assert.doesNotMatch(mounted.element.textContent, /\bAPOIO\b/i)
  mounted.unmount()
  api.get = async () => ({ data: [] })
})

test('categoria salva modo por lado/par e volta para quantidade ao escolher KG', async () => {
  const { createPinia } = await import('pinia')
  const { createRouter, createMemoryHistory } = await import('vue-router')
  const component = await loadComponent('src/pages/Settings.vue')
  const pinia = createPinia()
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'TESTE' } }, isAuthenticated: true, availableUnits: [] }
  api.get = async url => ({ data: url === '/settings/units' ? [{ symbol: 'UN', name: 'Unidade' }, { symbol: 'KG', name: 'Quilograma' }] : [] })
  const writes = []
  api.post = async (url, payload) => { writes.push({ url, payload }); return { data: {} } }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings', component }] })
  await router.push('/settings')
  const mounted = await mountComponent(component, { pinia, router })
  await flushPromises()
  const set = async (id, value) => {
    const input = mounted.element.querySelector(`#${id}`)
    assert.ok(input, id)
    input.value = value
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    await flushPromises()
  }
  await set('category-registration-sector', 'CORTE')
  await set('new-category-name', 'PARES')
  await set('new-category-unit', 'UN')
  await set('new-category-entry-mode', 'SIDE_PAIR')
  const form = mounted.element.querySelector('#new-category-name').closest('form')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].payload.entryMode, 'SIDE_PAIR')
  assert.equal(writes[0].payload.defaultUnitCode, 'UN')
  assert.equal('subtypeId' in writes[0].payload, false)
  await set('new-category-name', 'MATERIAL EM KG')
  await set('new-category-unit', 'UN')
  await set('new-category-entry-mode', 'SIDE_PAIR')
  await set('new-category-unit', 'KG')
  assert.equal(mounted.element.querySelector('#new-category-entry-mode'), null)
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  assert.equal(writes[1].payload.entryMode, 'QUANTITY')
  assert.equal(writes[1].payload.defaultUnitCode, 'KG')
  mounted.unmount()
})
