import assert from 'node:assert/strict';
import test from 'node:test';
import { MovementRequestError, parseMovementInput } from '../src/movements/validation';

test('normaliza uma entrada válida', () => {
  assert.deepEqual(parseMovementInput({
    materialId: '10',
    quantity: '2.5',
    type: 'ENTRADA',
    location: ' Prateleira A ',
    origem: ' Consumo ',
    reason: ' sobra ',
  }), {
    materialId: 10,
    quantity: '2.5',
    type: 'entrada',
    location: 'Prateleira A',
    origin: 'Consumo',
    reason: 'sobra',
  });
});

test('saída descarta origem', () => {
  assert.equal(parseMovementInput({
    materialId: 1,
    quantity: 1,
    type: 'saida',
    location: 'A',
    origem: 'não deve persistir',
  }).origin, null);
});

for (const [name, payload] of [
  ['material inválido', { materialId: 0, quantity: 1, type: 'entrada', location: 'A', origem: 'X' }],
  ['quantidade zero', { materialId: 1, quantity: 0, type: 'entrada', location: 'A', origem: 'X' }],
  ['quantidade negativa', { materialId: 1, quantity: -1, type: 'saida', location: 'A' }],
  ['quantidade acima da precisão do banco', { materialId: 1, quantity: '1000000000000000.000', type: 'saida', location: 'A' }],
  ['tipo desconhecido', { materialId: 1, quantity: 1, type: 'ajuste', location: 'A' }],
  ['localização ausente', { materialId: 1, quantity: 1, type: 'saida', location: '' }],
  ['origem ausente', { materialId: 1, quantity: 1, type: 'entrada', location: 'A' }],
] as const) {
  test(`rejeita ${name}`, () => {
    assert.throws(() => parseMovementInput(payload), (error) => {
      assert.ok(error instanceof MovementRequestError);
      assert.equal(error.status, 400);
      return true;
    });
  });
}
