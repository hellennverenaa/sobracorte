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
  assert.deepEqual(calls.sort(), ['/factory-unit/current', '/requisitions/pending-count', '/settings/categories', '/settings/locations', '/settings/origins', '/settings/units'])
  mounted.unmount()
  api.get = async () => ({ data: [] })
})
