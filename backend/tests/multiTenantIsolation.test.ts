import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTenantGuard, requireTenantContext, TenantGuardError } from '../src/prisma';
import { tenantStorage } from '../src/context/tenantContext';

const tenantOne = 1;
const tenantTwo = 2;

test('TenantGuard falha antes de qualquer query sem contexto ativo', () => {
  assert.throws(() => requireTenantContext('Material', 'findMany'), TenantGuardError);
  assert.equal(tenantStorage.run({ tenantId: tenantOne }, () => requireTenantContext('Material', 'findMany')), tenantOne);
});

test('TenantGuard injeta unidade em leituras, lotes e criações sem aceitar unidade estrangeira', () => {
  assert.deepEqual(
    applyTenantGuard('Material', 'findMany', { where: { code: 'TEC-001' } }, tenantOne),
    { where: { code: 'TEC-001', factoryUnitId: tenantOne } },
  );
  assert.deepEqual(
    applyTenantGuard('Material', 'createMany', { data: [{ code: 'A' }, { code: 'B', factoryUnitId: tenantOne }] }, tenantOne),
    { data: [{ code: 'A', factoryUnitId: tenantOne }, { code: 'B', factoryUnitId: tenantOne }] },
  );
  for (const operation of ['findMany', 'create', 'createMany', 'updateMany', 'deleteMany']) {
    const args = operation === 'create'
      ? { data: { factoryUnitId: tenantTwo } }
      : operation === 'createMany'
        ? { data: [{ factoryUnitId: tenantTwo }] }
        : { where: { factoryUnitId: tenantTwo } };
    assert.throws(() => applyTenantGuard('Material', operation, args, tenantOne), TenantGuardError);
  }
  assert.throws(() => applyTenantGuard('Material', 'updateMany', {
    where: { code: 'TEC-001' }, data: { factoryUnitId: tenantTwo },
  }, tenantOne), TenantGuardError);
});

test('TenantGuard exige seletor composto da unidade ativa em operações singulares', () => {
  for (const operation of ['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']) {
    assert.throws(() => applyTenantGuard('StockItem', operation, { where: { id: 99 } }, tenantOne), TenantGuardError);
    assert.throws(
      () => applyTenantGuard('StockItem', operation, { where: { id: 99, stockItem: { factoryUnitId: tenantOne } } }, tenantOne),
      TenantGuardError,
    );
    assert.throws(
      () => applyTenantGuard('StockItem', operation, { where: { id_factoryUnitId: { id: 99, factoryUnitId: tenantTwo } } }, tenantOne),
      TenantGuardError,
    );
  }
  assert.deepEqual(
    applyTenantGuard('StockItem', 'update', { where: { id_factoryUnitId: { id: 99, factoryUnitId: tenantOne } }, data: { quantity: 2 } }, tenantOne),
    { where: { id_factoryUnitId: { id: 99, factoryUnitId: tenantOne } }, data: { quantity: 2 } },
  );
  assert.throws(() => applyTenantGuard('StockItem', 'update', {
    where: { id_factoryUnitId: { id: 99, factoryUnitId: tenantOne } },
    data: { factoryUnitId: tenantTwo },
  }, tenantOne), TenantGuardError);
});

test('TenantGuard mantém upsert na unidade ativa, inclusive nas ramificações de criação', () => {
  const result = applyTenantGuard('MaterialLocation', 'upsert', {
    where: { materialId_locationId_factoryUnitId: { materialId: 10, locationId: 20, factoryUnitId: tenantOne } },
    update: { quantity: 3 },
    create: { materialId: 10, locationId: 20 },
  }, tenantOne);
  assert.equal(result.create.factoryUnitId, tenantOne);
  assert.throws(() => applyTenantGuard('MaterialLocation', 'upsert', {
    where: { materialId_locationId_factoryUnitId: { materialId: 10, locationId: 20, factoryUnitId: tenantOne } },
    update: {},
    create: { materialId: 10, locationId: 20, factoryUnitId: tenantTwo },
  }, tenantOne), TenantGuardError);
});

test('TenantGuard preserva a unidade em chamadas feitas dentro de transação', async () => {
  await tenantStorage.run({ tenantId: tenantOne }, async () => {
    const guarded = applyTenantGuard('StockItemLocation', 'update', {
      where: { stockItemId_locationId_factoryUnitId: { stockItemId: 1, locationId: 2, factoryUnitId: tenantOne } },
      data: { quantity: 4 },
    }, requireTenantContext('StockItemLocation', 'update'));
    assert.equal(guarded.where.stockItemId_locationId_factoryUnitId.factoryUnitId, tenantOne);
  });
});
