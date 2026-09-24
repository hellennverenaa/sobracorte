import assert from 'node:assert/strict';
import test from 'node:test';
import { executeImportTransaction, planImport, type ValidatedImportItem } from '../src/import/materialImport';

test('importação de 8.450 materiais usa lotes e mantém vínculos e saldos', async () => {
  const items: ValidatedImportItem[] = Array.from({ length: 8450 }, (_, index) => ({
    rowNumber: index + 2, sector: 'CORTE', code: String(1000000 + index),
    name: `TECIDO ${index}`, unit: 'M2', type: 'TECIDO', quantity: index % 2,
    locationId: 1, locationName: 'PRATELEIRA 01',
  }));
  let queries = 0;
  let created = 0;
  let linked = 0;
  let moved = 0;
  let nextId = 1;
  const tx: any = {
    $queryRaw: async () => [{ id: 1 }],
    location: { findMany: async () => [{ id: 1, sector: 'CORTE', name: 'PRATELEIRA 01' }] },
    categoryConfig: { findMany: async () => [] },
    stockItem: {
      findMany: async () => { queries++; return []; },
      createManyAndReturn: async ({ data }: any) => {
        assert.ok(data.length <= 200);
        created += data.length;
        return data.map((item: any) => ({ id: nextId++, ...item }));
      },
    },
    stockItemLocation: { createMany: async ({ data }: any) => {
      linked += data.length;
      for (const link of data) assert.equal(link.quantity, items[link.stockItemId - 1].quantity);
    } },
    stockMovement: { createMany: async ({ data }: any) => { moved += data.length; } },
  };
  const prisma: any = { $transaction: async (callback: any) => callback(tx) };
  const result = await executeImportTransaction(prisma, items, { factoryUnitId: 1, role: 'admin' });
  assert.deepEqual([result.inserted, created, linked, moved], [8450, 8450, 8450, 4225]);
  assert.ok(queries <= 22, `consultas de identidade: ${queries}`);
});

test('pré-validação distingue repetição, item existente e conflito de código', async () => {
  const base: ValidatedImportItem = {
    rowNumber: 2, sector: 'CORTE', code: '1384205', name: 'FILME AZUL',
    type: 'FILME', unit: 'M2', quantity: 0, locationId: 1, locationName: 'PRATELEIRA 01',
  };
  const prisma: any = { stockItem: { findMany: async () => [{
    factoryUnitId: 1, sector: 'CORTE', code: '1384205', name: 'FILME AZUL',
    type: 'FILME TPU', unit: 'M2',
  }] } };
  const conflict = await planImport(prisma, [base], 1);
  assert.equal(conflict.errors.length, 1);
  assert.match(conflict.errors[0].message, /categoria ou unidade diferente/);
  const ignored = await planImport(prisma, [{ ...base, type: 'FILME TPU' }], 1);
  assert.equal(ignored.ignored, 1);
  assert.equal(ignored.toInsert.length, 0);
  const repeated = await planImport({ stockItem: { findMany: async () => [] } }, [base, { ...base, rowNumber: 3 }], 1);
  assert.equal(repeated.errors[0].row, 3);
});
