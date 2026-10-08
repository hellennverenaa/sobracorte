import assert from 'node:assert/strict';
import test from 'node:test';
import { api, flushPromises, loadComponent, mountComponent } from './componentsHarness.js';

async function openEntry({ category = {}, location = {} } = {}) {
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const component = await loadComponent('src/components/SectorFormInput.vue');
  const pinia = createPinia();
  pinia.state.value.auth = { user: { role: 'admin', unit: { code: 'TESTE' } }, isAuthenticated: true };
  api.get = async url => ({ data: {
    '/settings/categories': [{ id: 1, name: 'COURO', sector: 'CORTE', defaultUnitCode: 'M²', entryMode: 'QUANTITY', ...category }],
    '/settings/units': [{ symbol: 'M²', name: 'Metro quadrado', integerOnly: false }, { symbol: 'KG', name: 'Quilograma', integerOnly: false }],
    '/settings/locations': [{ id: 1, name: 'A1', sector: 'CORTE', categoryMode: 'ALL', ...location }],
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
    await set('Categoria do material', '1');
    await set('Quantidade Inicial', '2.5');
    await set('Prateleira / Localização', location.name || 'A1');
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

test('entrada envia o nome exato da localização legada selecionada', async () => {
  const entry = await openEntry({ location: { name: 'Área de Triagem' } });
  const writes = [];
  api.post = async (_url, payload) => { writes.push(payload.items[0]); return { data: {} }; };
  try {
    await entry.fill();
    await entry.submit();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].location, 'Área de Triagem');
  } finally { entry.unmount(); }
});

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
  assert.equal(entry.field('Categoria do material').value, '1');
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

test('categoria define unidade e preserva sua regra ao reaproveitar dados', async () => {
  const entry = await openEntry({ category: { defaultUnitCode: 'KG' } });
  await entry.fill();
  assert.doesNotMatch(entry.element.textContent, /Unidade de Medida/);
  assert.match(entry.element.textContent, /Quantidade Inicial \(KG\)/);
  let payload;
  api.post = async (url, data) => { payload = data.items[0]; return { data: {} }; };
  entry.toggle.click();
  await entry.submit();
  assert.equal(payload.unit, 'KG');
  assert.equal(payload.categoryId, 1);
  assert.equal(payload.quantity, 2.5);
  assert.match(entry.element.textContent, /Quantidade Inicial \(KG\)/);
  entry.unmount();
});

test('categoria de Corte permite lado/par e categoria sem lado esconde a escolha', async () => {
  const entry = await openEntry({ category: { defaultUnitCode: 'UN', entryMode: 'SIDE_PAIR' } });
  await entry.set('Categoria do material', '1');
  const pair = [...entry.element.querySelectorAll('button')].find(button => button.textContent.includes('Par (E + D)'));
  assert.ok(pair);
  pair.click();
  await flushPromises();
  assert.match(entry.element.textContent, /Quantidade de Pares/);
  entry.unmount();
  const ordinary = await openEntry();
  await ordinary.set('Categoria do material', '1');
  assert.equal(ordinary.element.querySelector('[aria-label="Lado do material"]'), null);
  ordinary.unmount();
});

test('origem opcional permite envio com seleção vazia', async () => {
  const entry = await openEntry();
  const writes = [];
  api.post = async (_url, payload) => { writes.push(payload.items[0]); return { data: {} }; };
  try {
    await entry.fill();
    await entry.set('Origem', '');
    assert.equal(entry.field('Origem').required, false);
    assert.equal(entry.element.querySelector('form').checkValidity(), true);
    await entry.submit();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].origem, '');
  } finally { entry.unmount(); }
});
