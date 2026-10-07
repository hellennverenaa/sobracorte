import assert from 'node:assert/strict';
import test from 'node:test';
import { api, flushPromises, loadComponent, mountComponent } from './componentsHarness.js';

async function openEntry({ category = {} } = {}) {
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const component = await loadComponent('src/components/SectorFormInput.vue');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'TESTE' } }, isAuthenticated: true };
  api.get = async url => ({ data: {
    '/settings/categories': [{ id: 1, name: 'COURO', sector: 'CORTE', ...category }],
    '/settings/units': [{ symbol: 'M²', name: 'Metro quadrado', integerOnly: false }, { symbol: 'KG', name: 'Quilograma', integerOnly: false }],
    '/settings/locations': [{ id: 1, name: 'A1', sector: 'CORTE', categoryMode: 'ALL' }],
    '/settings/origins': [{ name: 'SOBRA', sector: 'CORTE' }],
  }[url] || [] });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  await router.push('/');
  const mounted = await mountComponent(component, { pinia, router });
  await flushPromises();
  const field = text => {
    const label = [...mounted.element.querySelectorAll('label')].find(label => label.textContent.includes(text));
    assert.ok(label, text);
    return label.parentElement.querySelector('input, select');
  };
  const set = async (text, value) => {
    const input = field(text);
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await flushPromises();
  };
  const fill = async () => {
    await set('Código', 'MAT-01');
    await set('Nome / Descrição', 'Couro preto');
    await set('Tipo / Categoria', '1');
    await set('Quantidade Inicial', '2.5');
    await set('Prateleira / Localização', 'A1');
    await set('Origem', 'SOBRA');
    await set('Observação adicional', 'Lote 10');
  };
  const submit = async () => {
    mounted.element.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();
  };
  return { ...mounted, field, set, fill, submit, toggle: mounted.element.querySelector('[role="switch"]') };
}

test('entrada mantém dados quando ativado, limpa após desativar e reinicia ao reabrir', async () => {
  const entry = await openEntry();
  const writes = [];
  api.post = async (url, payload) => { writes.push(payload.items[0]); return { data: {} }; };
  assert.equal(entry.toggle.checked, false);
  await entry.fill();
  entry.toggle.click();
  await entry.submit();
  assert.equal(writes.length, 1);
  assert.equal(entry.field('Código').value, 'MAT-01');
  assert.equal(entry.field('Quantidade Inicial').value, '2.5');
  assert.equal(entry.field('Tipo / Categoria').value, '1');
  assert.equal(entry.field('Prateleira / Localização').value, 'A1');
  assert.equal(entry.field('Origem').value, 'SOBRA');
  assert.equal(entry.field('Observação adicional').value, 'Lote 10');
  let confirmations = 0;
  const previousConfirm = window.confirm;
  window.confirm = () => { confirmations++; return false; };
  try {
    assert.equal(await entry.vm.confirmDiscard(), true);
    assert.equal(confirmations, 0);
    await entry.set('Código', 'MAT-02');
    assert.equal(await entry.vm.confirmDiscard(), false);
    assert.equal(confirmations, 1);
    entry.toggle.click();
    await flushPromises();
    assert.equal(entry.field('Código').value, 'MAT-02');
    await entry.submit();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].code, 'MAT-02');
    assert.equal(entry.field('Código').value, '');
    assert.equal(entry.field('Quantidade Inicial').value, '1');
    assert.equal(await entry.vm.confirmDiscard(), true);
  } finally {
    window.confirm = previousConfirm;
    entry.unmount();
  }
  const reopened = await openEntry();
  assert.equal(reopened.toggle.checked, false);
  assert.equal(reopened.field('Código').value, '');
  reopened.unmount();
});

test('entrada com switch desligado limpa após sucesso e preserva dados após erro', async () => {
  const entry = await openEntry();
  await entry.fill();
  api.post = async () => {
    throw Object.assign(new Error('Material já cadastrado'), {
      response: { status: 409, data: { error: 'Material já cadastrado' } },
    });
  };
  await entry.submit();
  assert.match(entry.element.textContent, /Material já cadastrado/);
  assert.equal(entry.field('Código').value, 'MAT-01');
  assert.equal(entry.field('Quantidade Inicial').value, '2.5');
  api.post = async () => ({ data: {} });
  await entry.submit();
  assert.equal(entry.field('Código').value, '');
  assert.equal(entry.field('Quantidade Inicial').value, '1');
  entry.unmount();
});

test('Corte permite escolher unidade livre e mantém unidade fixa ao salvar com reaproveitamento', async () => {
  const free = await openEntry();
  await free.set('Unidade de Medida', 'KG');
  assert.match(free.element.textContent, /Quantidade Inicial \(KG\)/);
  assert.match(free.element.textContent, /12\.5 KG/);
  free.unmount();

  const locked = await openEntry({ category: { unitLocked: true, defaultUnitCode: 'KG' } });
  await locked.fill();
  assert.doesNotMatch(locked.element.textContent, /Unidade de Medida/);
  assert.match(locked.element.textContent, /Quantidade Inicial \(KG\)/);
  assert.match(locked.element.textContent, /Unidade fixada pela categoria/);
  let payload;
  api.post = async (url, data) => { payload = data.items[0]; return { data: {} }; };
  locked.toggle.click();
  await locked.submit();
  assert.equal(payload.unit, 'KG');
  assert.equal(payload.quantity, 2.5);
  assert.match(locked.element.textContent, /Quantidade Inicial \(KG\)/);
  locked.unmount();
});

test('setores de peças exibem UN junto à quantidade e preservam pares e alerta de conflito', async () => {
  const entry = await openEntry({ category: { sector: 'APOIO', unitLocked: true, defaultUnitCode: 'KG' } });
  const selectSector = async text => {
    const button = [...entry.element.querySelectorAll('[aria-label="Setor da entrada de estoque"] button')]
      .find(button => button.textContent.includes(text));
    assert.ok(button);
    button.click();
    await flushPromises();
  };
  await selectSector('Montagem');
  assert.match(entry.element.textContent, /Quantidade Inicial \(UN\)/);
  assert.doesNotMatch(entry.element.textContent, /Unidade de medida/);
  const pair = [...entry.element.querySelectorAll('button')].find(button => button.textContent.includes('Par (E + D)'));
  assert.ok(pair);
  pair.click();
  await flushPromises();
  assert.match(entry.element.textContent, /Quantidade de Pares/);
  assert.match(entry.element.textContent, /Cada par cadastra 1 pé esquerdo e 1 direito/);
  await selectSector('Peças Cortadas');
  await entry.set('Tipo de material / categoria', '1');
  assert.match(entry.element.querySelector('[role="alert"]').textContent, /incompatível com a unidade individual \(UN\)/);
  assert.equal(entry.element.querySelector('button[type="submit"]').disabled, true);
  entry.unmount();
});
