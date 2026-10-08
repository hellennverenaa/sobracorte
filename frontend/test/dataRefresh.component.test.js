import assert from 'node:assert/strict'
import test from 'node:test'
import { loadComponent, mountComponent } from './componentsHarness.js'
const settle = () => new Promise(resolve => setTimeout(resolve, 220))
test('retorno à aba agrupa atualizações, preserva rascunho e limpa listeners', async () => {
 const { useDataRefresh } = await loadComponent('src/composables/useDataRefresh.js')
 let calls = 0
 const mounted = await mountComponent({ setup() { useDataRefresh(() => { calls++ }); return {} }, template: '<input value="rascunho" />' })
 window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus'))
 await settle(); assert.equal(calls, 1); assert.equal(mounted.element.querySelector('input').value, 'rascunho')
 mounted.unmount(); window.dispatchEvent(new Event('focus')); await settle(); assert.equal(calls, 1)
})
test('eventos de outra aba respeitam unidade e recurso', async () => {
 const { useDataRefresh } = await loadComponent('src/composables/useDataRefresh.js')
 localStorage.setItem('user', JSON.stringify({ unit: { code: 'QA' } }))
 let calls = 0
 const mounted = await mountComponent({ setup() { useDataRefresh(() => { calls++ }, { paths: ['/settings'] }); return {} }, template: '<div />' })
 const change = (unit, path) => { const event = new Event('storage'); Object.defineProperties(event, { key: { value: 'sobracorte:data-update' }, newValue: { value: JSON.stringify({ unit, path }) } }); window.dispatchEvent(event) }
 change('OUTRA', '/settings/categories'); change('QA', '/inventory/batch'); await settle(); assert.equal(calls, 0)
 change('QA', '/settings/categories'); await settle(); assert.equal(calls, 1)
 mounted.unmount(); localStorage.removeItem('user')
})
test('HTTP avisa apenas alterações confirmadas e evita cache de leitura', async () => {
 const { api } = await loadComponent('src/services/httpClient.ts', { mockHttpClient: false })
 const originalFetch = globalThis.fetch
 localStorage.setItem('user', JSON.stringify({ unit: { code: 'QA' } }))
 let events = 0
 let options
 const listener = event => { assert.equal(event.detail.unit, 'QA'); events++ }
 window.addEventListener('sobracorte:data-update', listener)
 try {
  globalThis.fetch = async (url, config) => { options = config; return new Response('{}', { status: 200 }) }
  await api.get('/settings/categories'); assert.equal(events, 0); assert.equal(options.cache, 'no-store')
  await api.post('/import/csv/preview', {}); assert.equal(events, 0)
  await api.post('/settings/categories', { name: 'QA' }); assert.equal(events, 1)
  globalThis.fetch = async () => new Response('{"error":"inválido"}', { status: 400 })
  await assert.rejects(api.post('/settings/categories', {})); assert.equal(events, 1)
 } finally { globalThis.fetch = originalFetch; window.removeEventListener('sobracorte:data-update', listener); localStorage.removeItem('user') }
})
