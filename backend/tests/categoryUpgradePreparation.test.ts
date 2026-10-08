import assert from 'node:assert/strict';
import test from 'node:test';
const { planPreparation } = require('../scripts/prepare-category-upgrade.cjs');

const item = (overrides = {}) => ({ id: 801, factoryUnitId: 47, sector: 'CORTE', type: 'NOVO MATERIAL', unit: 'M²', footSide: null, quantity: '1.250', minStock: '0.000', componentType: 'MATERIA_PRIMA', ...overrides });

test('preparação deriva categorias dos dados e preserva quantidades; IDs não determinam regras', () => {
  const plan = planPreparation([item(), item({ id: 953, quantity: '9.125' })], []);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.additions.length, 1);
  assert.equal(plan.additions[0].factoryUnitId, 47);
  assert.equal(plan.additions[0].defaultUnitCode, 'M²');
  assert.deepEqual(plan.changes, []);
});

test('colisão em outro setor gera categoria distinta e preparação é repetível', () => {
  const stock = item({ sector: 'PRE_FABRICADO', type: 'EVA', unit: 'UN', footSide: 'E', quantity: '3' });
  const categories = [{ id: 924, factoryUnitId: 47, name: 'EVA', sector: 'CORTE', defaultUnitCode: 'M²' }];
  const first = planPreparation([stock], categories);
  assert.equal(first.additions[0].name, 'EVA (PRE_FABRICADO)');
  assert.equal(first.changes[0].after, first.additions[0].name);
  const second = planPreparation([{ ...stock, type: first.changes[0].after }], [...categories, ...first.additions]);
  assert.deepEqual(second, { blockers: [], additions: [], changes: [] });
});

test('classificação vazia usa apenas metadado legado conhecido; desconhecida bloqueia', () => {
  assert.equal(planPreparation([item({ type: null, sector: 'APOIO', componentType: 'PECA_CORTADA', unit: 'UN', quantity: '2' })], []).changes[0].after, 'MOLDE / PEÇA');
  assert.equal(planPreparation([item({ type: null })], []).blockers.length, 1);
});

test('bloqueia ambiguidade, mistura de medidas/modos, par persistido e quantidade fracionada discreta', () => {
  const categories = [{ id: 1, factoryUnitId: 47, name: 'NOVO MATERIAL', sector: 'CORTE' }, { id: 2, factoryUnitId: 47, name: ' novo material ', sector: 'CORTE' }];
  assert.equal(planPreparation([item()], categories).blockers.length, 1);
  assert.equal(planPreparation([item(), item({ id: 802, unit: 'KG' })], []).blockers.length, 1);
  assert.equal(planPreparation([item({ unit: 'UN', quantity: '1' }), item({ id: 802, unit: 'UN', quantity: '1', footSide: 'E' })], []).blockers.length, 1);
  assert.equal(planPreparation([item({ footSide: 'PAR', unit: 'UN', quantity: '1' })], []).blockers.length, 1);
  assert.equal(planPreparation([item({ unit: 'UN' })], []).blockers.length, 1);
  assert.equal(planPreparation([item({ unit: 'UN', quantity: '9007199254740993.125' })], []).blockers.length, 1);
});
