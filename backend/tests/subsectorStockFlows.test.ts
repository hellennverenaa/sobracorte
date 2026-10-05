import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { StockItemService } from '../src/services/StockItemService';
import { StockMovementService } from '../src/services/StockMovementService';
import { assertStockLocationSubsector } from '../src/auth/subsectorAccess';
import { BatchCreateStockItemSchema, CreateStockMovementSchema } from '../src/types/stock.dto';
import { SettingsController } from '../src/controllers/SettingsController';
import { tenantStorage } from '../src/context/tenantContext';

function replaceTransaction(t: any, transaction: (callback: (tx: any) => any) => any) {
  const original = prisma.$transaction;
  (prisma as any).$transaction = transaction;
  t.after(() => { (prisma as any).$transaction = original; });
}

function apoioEntry(overrides: Record<string, unknown> = {}) {
  return {
    sector: 'APOIO',
    componentType: 'PECA_CORTADA',
    pieceCode: 'PC-1',
    description: 'ABA FRONTAL',
    materialColor: 'PRETO',
    sizeGrade: '40',
    quantity: 2,
    unit: 'UN',
    location: 'PRATELEIRA A',
    ...overrides,
  };
}

function setupItemCreation(t: any, options: {
  locationSubsectorId?: number | null;
  locationMissing?: boolean;
  categoryMode?: string;
  allowedCategoryIds?: number[];
  subsectorSector?: string;
} = {}) {
  const writes: Array<{ table: string; data: any }> = [];
  const subsector = {
    id: 5,
    sector: options.subsectorSector || 'APOIO',
    categoryMode: options.categoryMode || 'ALL',
    categoryLinks: (options.allowedCategoryIds || []).map(categoryConfigId => ({ categoryConfigId })),
  };
  const tx: any = {
    $queryRaw: async () => [],
    subsectorConfig: { findFirst: async ({ where }: any) => where.id === 5 && where.factoryUnitId === 1 && where.active ? subsector : null },
    categoryConfig: { findFirst: async ({ where }: any) => where.id === 10
      ? { id: 10, name: 'PECA', sectors: ['APOIO'], componentType: 'PECA_CORTADA', unitLocked: false, defaultUnitCode: 'UN' }
      : null },
    originConfig: { findFirst: async () => null },
    location: {
      findUnique: async () => options.locationMissing ? null : {
        id: 20, name: 'PRATELEIRA A', sector: 'APOIO', subsectorId: options.locationSubsectorId ?? 5, categoryLinks: [],
      },
      create: async ({ data }: any) => {
        writes.push({ table: 'location', data });
        return { id: 20, ...data, categoryLinks: [] };
      },
    },
    stockItem: {
      findMany: async () => [],
      create: async ({ data }: any) => {
        writes.push({ table: 'stockItem', data });
        return { id: 30, ...data };
      },
    },
    stockItemLocation: { create: async ({ data }: any) => { writes.push({ table: 'stockItemLocation', data }); return data; } },
    stockMovement: { create: async ({ data }: any) => { writes.push({ table: 'stockMovement', data }); return { id: 40, ...data }; } },
  };
  replaceTransaction(t, callback => callback(tx));
  return {
    writes,
    create: (item: any, context: any = { factoryUnitId: 1, role: 'admin' }) => new StockItemService().createBatch(
      BatchCreateStockItemSchema.parse({ items: [item] }),
      context,
    ),
  };
}

test('subsetor é opcional no DTO e associação explícita é persistida no novo item, localização e entrada', async t => {
  const { writes, create } = setupItemCreation(t, { locationMissing: true });
  await create(apoioEntry({ subsectorId: 5 }));

  assert.equal(writes.find(write => write.table === 'location')?.data.subsectorId, 5);
  assert.equal(writes.find(write => write.table === 'stockItem')?.data.subsectorId, 5);
  assert.equal(writes.find(write => write.table === 'stockMovement')?.data.subsectorId, 5);
  assert.equal(BatchCreateStockItemSchema.safeParse({ items: [apoioEntry()] }).success, true);
  assert.equal(CreateStockMovementSchema.safeParse({ stockItemId: 30, subsectorId: 5, type: 'ENTRADA', quantity: 1 }).success, true);
});

test('entrada não compartilha localização vinculada a outro subsetor', async t => {
  const { writes, create } = setupItemCreation(t, { locationSubsectorId: 6 });
  await assert.rejects(create(apoioEntry({ subsectorId: 5 })), /mesmo subsetor/);
  assert.equal(writes.some(write => write.table === 'stockItem'), false);
});

test('cadastro rejeita subsetor de outro setor, outra unidade ou sem concessão explícita', async t => {
  const incompatible = setupItemCreation(t, { subsectorSector: 'MONTAGEM' });
  await assert.rejects(incompatible.create(apoioEntry({ subsectorId: 5 })), /não pertence ao setor/);
  assert.equal(incompatible.writes.some(write => write.table === 'stockItem'), false);

  const foreignUnit = setupItemCreation(t);
  await assert.rejects(foreignUnit.create(apoioEntry({ subsectorId: 5 }), { factoryUnitId: 2, role: 'admin' }), /ou pertence a outra unidade/);

  const unauthorized = setupItemCreation(t);
  await assert.rejects(unauthorized.create(apoioEntry({ subsectorId: 5 }), {
    factoryUnitId: 1, role: 'movimentador', assignedSector: 'APOIO', subsectorIds: [6],
  }), /não possui acesso a este subsetor/);
  assert.equal(unauthorized.writes.some(write => write.table === 'stockItem'), false);
});

test('subsetor em modo SELECTED exige categoria permitida', async t => {
  const { writes, create } = setupItemCreation(t, { categoryMode: 'SELECTED', allowedCategoryIds: [11] });
  await assert.rejects(create(apoioEntry({ subsectorId: 5, categoryId: 10, type: 'PECA' })), /categoria selecionada não está permitida/);
  await assert.rejects(create(apoioEntry({ subsectorId: 5 })), /Selecione uma categoria permitida/);
  assert.equal(writes.some(write => write.table === 'stockItem'), false);
});

test('localizações legadas sem subsetor continuam válidas somente para itens legados', () => {
  assert.doesNotThrow(() => assertStockLocationSubsector({ subsectorId: null }, null));
  assert.throws(() => assertStockLocationSubsector({ subsectorId: 5 }, null), /mesmo subsetor/);
  assert.throws(() => assertStockLocationSubsector({ subsectorId: null }, 5), /mesmo subsetor/);
});

function setupMovement(t: any, locationSubsectors: Record<number, number | null>) {
  const writes: Array<{ table: string; data: any }> = [];
  const item = {
    id: 30, sector: 'APOIO', subsectorId: 5, subsector: { id: 5, sector: 'APOIO' },
    unit: 'UN', categoryId: null, quantity: 10, locations: [],
  };
  const tx: any = {
    $queryRaw: async () => [],
    stockItem: {
      findFirst: async () => item,
      update: async (args: any) => { writes.push({ table: 'stockItem.update', data: args }); return item; },
      updateMany: async (args: any) => { writes.push({ table: 'stockItem.updateMany', data: args }); return { count: 1 }; },
    },
    location: {
      findFirst: async ({ where, select }: any) => select?.name
        ? { name: `LOC-${where.id}` }
        : { id: where.id, name: `LOC-${where.id}`, sector: 'APOIO', subsectorId: locationSubsectors[where.id], categoryLinks: [] },
    },
    originConfig: { findFirst: async () => null },
    stockItemLocation: {
      upsert: async (args: any) => { writes.push({ table: 'stockItemLocation.upsert', data: args }); return {}; },
      updateMany: async (args: any) => { writes.push({ table: 'stockItemLocation.updateMany', data: args }); return { count: 1 }; },
    },
    stockMovement: { create: async ({ data }: any) => { writes.push({ table: 'stockMovement', data }); return { id: 41, ...data }; } },
  };
  replaceTransaction(t, callback => callback(tx));
  return { writes, item, move: (payload: any) => new StockMovementService().createMovement(payload, { factoryUnitId: 1, role: 'admin' }) };
}

test('entrada em item de subsetor herda a classificação e rejeita ID de subsetor adulterado', async t => {
  const { writes, move } = setupMovement(t, { 10: 5 });
  await move({ stockItemId: 30, type: 'ENTRADA', quantity: 1, locationId: 10 });
  assert.equal(writes.find(write => write.table === 'stockMovement')?.data.subsectorId, 5);

  const tampered = setupMovement(t, { 10: 5 });
  await assert.rejects(tampered.move({ stockItemId: 30, subsectorId: 6, type: 'ENTRADA', quantity: 1, locationId: 10 }), /deve corresponder/);
  assert.equal(tampered.writes.length, 0);
});

test('transferência entre subsetores diferentes é bloqueada antes de alterar saldos', async t => {
  const { writes, move } = setupMovement(t, { 10: 5, 11: 6 });
  await assert.rejects(move({
    stockItemId: 30,
    type: 'TRANSFERENCIA',
    quantity: 1,
    locationId: 10,
    destinationLocationId: 11,
  }), /mesmo subsetor/);
  assert.equal(writes.length, 0);
});

function response() {
  let status = 200;
  let body: any;
  return {
    get status() { return status; },
    get body() { return body; },
    res: { status(value: number) { status = value; return this; }, json(value: any) { body = value; return this; } } as any,
  };
}

function replaceMethod(t: any, object: any, key: string, value: any) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

test('configuração associa uma localização nova ao subsetor do mesmo setor', async t => {
  let created: any;
  replaceMethod(t, prisma.subsectorConfig, 'findFirst', async () => ({ id: 5, sector: 'APOIO', categoryMode: 'ALL', categoryLinks: [] }));
  replaceTransaction(t, async callback => callback({
    location: { create: async ({ data }: any) => { created = data; return { id: 20, ...data }; } },
    stockMovement: { create: async () => ({ id: 1 }) },
  }));
  const result = response();
  await tenantStorage.run({ tenantId: 1 }, () => new SettingsController().createLocation({
    tenant: { id: 1 }, user: { role: 'admin', usuario: 'ADMIN' },
    body: { name: 'Serigrafia A', sector: 'APOIO', subsectorId: 5, categoryIds: [] },
  } as any, result.res));

  assert.equal(result.status, 201);
  assert.equal(created.subsectorId, 5);
});

test('localização usada não pode ser reclassificada para outro subsetor', async t => {
  let writes = 0;
  replaceMethod(t, prisma.location, 'findFirst', async () => ({
    id: 20, factoryUnitId: 1, name: 'PRATELEIRA A', sector: 'APOIO', subsectorId: null, categoryId: null,
  }));
  replaceMethod(t, prisma.subsectorConfig, 'findFirst', async () => ({
    id: 5, sector: 'APOIO', active: true, categoryMode: 'ALL', categoryLinks: [],
  }));
  replaceTransaction(t, async callback => callback({
    $queryRaw: async () => [],
    stockItemLocation: { count: async () => 1 },
    stockMovement: { count: async () => 0, create: async () => { writes++; } },
    location: { update: async () => { writes++; } },
  }));
  const result = response();
  await tenantStorage.run({ tenantId: 1 }, () => new SettingsController().updateLocation({
    tenant: { id: 1 }, user: { role: 'admin', usuario: 'ADMIN' },
    params: { id: '20' }, body: { subsectorId: 5 },
  } as any, result.res));

  assert.equal(result.status, 409);
  assert.match(result.body.error, /não pode ser alterado após o primeiro uso/);
  assert.equal(writes, 0);
});
