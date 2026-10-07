import assert from 'node:assert/strict';
import test from 'node:test';
import { executeImportTransaction, planImport, type ValidatedImportItem } from '../src/import/materialImport';

test('importação de 8.450 materiais usa lotes e mantém vínculos e saldos', async () => {
  const items: ValidatedImportItem[] = Array.from({ length: 8450 }, (_, index) => ({
    rowNumber: index + 2, sector: 'CORTE', categoryId: 1, entryMode: 'QUANTITY', code: String(1000000 + index),
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
    location: { findMany: async () => [{ id: 1, sector: 'CORTE', name: 'PRATELEIRA 01', categoryMode: 'ALL' }] },
    categoryConfig: { findMany: async () => [{ id: 1, name: 'TECIDO', sector: 'CORTE', defaultUnitCode: 'M²', entryMode: 'QUANTITY' }] },
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

test('importação de componentes aplica o mesmo mapeamento abaixo e acima de 100 itens', async () => {
  async function importBatch(count: number) {
    const savedItems: any[] = [];
    let nextId = 1;
    const location = { id: 1, name: 'SOL-01', sector: 'PRE_FABRICADO', categoryMode: 'ALL' };
    const category = { id: 2, entryMode: 'SIDE_PAIR', name: 'EVA', sector: 'PRE_FABRICADO', unitLocked: true, defaultUnitCode: 'UN' };
    const tx: any = {
      $queryRaw: async () => [{ id: 1 }],
      location: {
        findFirst: async () => location,
        findMany: async () => [location],
      },
      categoryConfig: { findMany: async () => [category] },
      stockItem: {
        findMany: async () => [],
        create: async ({ data }: any) => {
          const record = { id: nextId++, ...data };
          savedItems.push(record);
          return record;
        },
        createManyAndReturn: async ({ data }: any) => data.map((item: any) => {
          const record = { id: nextId++, ...item };
          savedItems.push(record);
          return record;
        }),
      },
      stockItemLocation: {
        create: async () => undefined,
        createMany: async () => undefined,
      },
      stockMovement: {
        create: async () => undefined,
        createMany: async () => undefined,
      },
    };
    const prisma: any = { $transaction: async (callback: any) => callback(tx) };
    const items: ValidatedImportItem[] = Array.from({ length: count }, (_, index) => ({
      rowNumber: index + 2,
      sector: 'PRE_FABRICADO', categoryId: 2, entryMode: 'SIDE_PAIR',
      code: `SOLA-${index}`,
      name: `SOLA MODELO ${index}`,
      productName: `MODELO ${index}`,
      unit: 'UN',
      type: 'EVA',
      color: 'PRETO/BRANCO',
      sizeGrade: '41',
      footSide: 'E',
      quantity: 1,
      locationId: 1,
      locationName: 'SOL-01',
    }));

    const result = await executeImportTransaction(prisma, items, { factoryUnitId: 1, role: 'admin' });
    return { result, savedItems };
  }

  const smallBatch = await importBatch(1);
  const largeBatch = await importBatch(100);
  const persistedFields = (item: any) => ({
    sector: item.sector,
    componentType: item.componentType,
    type: item.type,
    sku: item.sku,
    productName: item.productName,
    color: item.color,
    sizeGrade: item.sizeGrade,
    footSide: item.footSide,
  });

  assert.equal(smallBatch.result.inserted, 1);
  assert.equal(largeBatch.result.inserted, 100);
  assert.deepEqual(persistedFields(smallBatch.savedItems[0]), persistedFields(largeBatch.savedItems[0]));
  assert.equal(smallBatch.savedItems[0].color, 'PRETO/BRANCO');
  assert.equal(largeBatch.savedItems[0].color, 'PRETO/BRANCO');
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

test('pré-validação não trata item de outro subsetor ou legado como importado no escopo solicitado', async () => {
  const base: ValidatedImportItem = {
    rowNumber: 2, sector: 'CORTE', subsectorId: 9, code: '1384206', name: 'TECIDO AZUL',
    type: 'TECIDO', unit: 'M2', quantity: 0, locationId: 1, locationName: 'PRATELEIRA 01',
  };
  const existing = {
    factoryUnitId: 1, sector: 'CORTE', subsectorId: null, code: '1384206', name: 'TECIDO AZUL',
    type: 'TECIDO', unit: 'M2',
  };
  const plan = await planImport({ stockItem: { findMany: async () => [existing] } }, [base], 1);

  assert.equal(plan.ignored, 0);
  assert.equal(plan.toInsert.length, 0);
  assert.match(plan.errors[0].message, /outro escopo/);
  assert.doesNotMatch(plan.errors[0].message, /TECIDO AZUL/);
});
