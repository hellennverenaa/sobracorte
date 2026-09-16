import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComponent, mountComponent, flushPromises } from './componentsHarness.js';

test('PageState distingue erro de vazio e oferece retry', async () => {
  const component = await loadComponent('src/components/PageState.vue');
  let retries = 0;
  const mounted = await mountComponent(component, { props: { error: 'Sem permissão', empty: true, onRetry: () => retries++ } });
  assert.match(mounted.element.textContent, /Sem permissão/);
  assert.doesNotMatch(mounted.element.textContent, /Nenhum registro/);
  mounted.element.querySelector('button').click();
  assert.equal(retries, 1);
  mounted.unmount();
});

test('ConfirmModal mostra unidade, impede cancelamento durante ação e restaura foco', async () => {
  const component = await loadComponent('src/components/ConfirmModal.vue');
  const { createPinia } = await import('pinia');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { unit: { code: 'SEST' } }, isAuthenticated: true, availableUnits: [] };
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  let cancelled = 0;
  const mounted = await mountComponent(component, { pinia, props: { show: true, loading: true, onCancel: () => cancelled++ } });
  await flushPromises();
  assert.match(mounted.element.textContent, /Unidade ativa: SEST/);
  assert.ok(mounted.element.querySelector('[role="dialog"]'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(cancelled, 0);
  mounted.unmount();
  assert.equal(document.activeElement === trigger, true, 'foco deve retornar ao botão de abertura');
  trigger.remove();
});

test('formulário alterado bloqueia navegação e troca de unidade até confirmação', async () => {
  const { useUnsavedChanges, confirmPendingChanges } = await loadComponent('src/composables/useUnsavedChanges.js');
  const { defineComponent, h } = await import('vue');
  const { createRouter, createMemoryHistory, RouterView } = await import('vue-router');
  const form = defineComponent({ setup() { useUnsavedChanges(() => true); return () => h('input'); } });
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: form }, { path: '/next', component: { template: '<div />' } },
  ] });
  await router.push('/');
  const mounted = await mountComponent({ render: () => h(RouterView) }, { router });
  window.confirm = () => false;
  assert.equal(confirmPendingChanges(), false);
  await router.push('/next');
  assert.equal(router.currentRoute.value.path, '/');
  window.confirm = () => true;
  assert.equal(confirmPendingChanges(), true);
  await router.push('/next');
  assert.equal(router.currentRoute.value.path, '/next');
  await flushPromises();
  window.confirm = () => false;
  assert.equal(confirmPendingChanges(), true);
  mounted.unmount();
});

test('filtros persistem separados por unidade e podem ser limpos', async () => {
  const usePersistedFilters = await loadComponent('src/composables/usePersistedFilters.js');
  const { ref, effectScope } = await import('vue');
  localStorage.clear();
  const unit = ref('SEST');
  const scope = effectScope();
  const state = scope.run(() => usePersistedFilters('test', { search: '' }, () => unit.value));
  state.filters.value.search = 'corte';
  unit.value = 'VDC';
  assert.equal(state.filters.value.search, '');
  state.filters.value.search = 'montagem';
  unit.value = 'SEST';
  assert.equal(state.filters.value.search, 'corte');
  state.resetFilters();
  assert.equal(state.filters.value.search, '');
  scope.stop();
  localStorage.clear();
});
