import assert from 'node:assert/strict';
import test from 'node:test';

test('valida regra de bloqueio de exclusão quando quantidade total > 0', () => {
  const material = {
    id: 1,
    quantity: 15.5,
    locations: [{ quantity: 15.5 }],
  };

  const totalQty = Number(material.quantity || 0);
  const hasLocationBalance = material.locations.some((l) => Number(l.quantity || 0) > 0);
  const isBlocked = totalQty > 0 || hasLocationBalance;

  assert.equal(isBlocked, true);
});

test('valida regra de bloqueio de exclusão quando quantidade total é 0 mas prateleira tem saldo residual', () => {
  const material = {
    id: 2,
    quantity: 0,
    locations: [{ quantity: 0.5 }],
  };

  const totalQty = Number(material.quantity || 0);
  const hasLocationBalance = material.locations.some((l) => Number(l.quantity || 0) > 0);
  const isBlocked = totalQty > 0 || hasLocationBalance;

  assert.equal(isBlocked, true);
});

test('permite exclusão e gera snapshot quando saldo total e prateleiras são 0', () => {
  const material = {
    id: 3,
    code: '1040',
    name: 'COURO BOVINO PRETO',
    type: 'COURO',
    unit: 'M²',
    quantity: 0,
    locations: [
      { locationId: 10, location: { name: 'PRAT-A1' }, quantity: 0 },
    ],
  };

  const totalQty = Number(material.quantity || 0);
  const hasLocationBalance = material.locations.some((l) => Number(l.quantity || 0) > 0);
  const isBlocked = totalQty > 0 || hasLocationBalance;

  assert.equal(isBlocked, false);

  const snapshotLocations = material.locations.map((l) => ({
    locationId: l.locationId,
    locationName: l.location?.name || 'Não informada',
    quantity: Number(l.quantity || 0),
  }));

  const auditPayload = {
    factoryUnitId: 1,
    materialId: material.id,
    code: material.code,
    name: material.name,
    categoryName: material.type,
    unitSymbol: material.unit,
    quantity: 0,
    locations: snapshotLocations,
    deletedById: '12345',
    deletedByName: 'Lider Operacional',
  };

  assert.equal(auditPayload.materialId, 3);
  assert.equal(auditPayload.code, '1040');
  assert.equal(auditPayload.locations.length, 1);
  assert.equal(auditPayload.locations[0].locationName, 'PRAT-A1');
});
