import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { StockItemService } from '../src/services/StockItemService';
import { StockMovementService } from '../src/services/StockMovementService';

function setup(t: any, options: { itemSector?: string; acceptOrigin?: boolean } = {}) {
  const itemSector = options.itemSector || 'APOIO';
  const writes: any[] = [];
  const originQueries: any[] = [];
  const item = { id: 7, sector: itemSector, unit: 'UN', categoryId: null, quantity: 0, locations: [] };
  const tx: any = {
    $queryRaw: async () => [],
    stockItem: {
      findFirst: async () => item,
      update: async (args: any) => { writes.push(['item', args]); },
    },
    stockItemLocation: { upsert: async (args: any) => { writes.push(['allocation', args]); } },
    location: {
      findFirst: async ({ where, select }: any) => select?.name
        ? { name: 'PRATELEIRA A' }
        : { id: where.id, name: 'PRATELEIRA A', sector: itemSector, categoryLinks: [] },
    },
    originConfig: {
      findFirst: async (args: any) => {
        originQueries.push(args);
        return options.acceptOrigin ? { id: 3 } : null;
      },
    },
    stockMovement: {
      create: async ({ data }: any) => { writes.push(['movement', data]); return { id: 99, ...data }; },
    },
  };
  const originalTransaction = prisma.$transaction;
  t.after(() => { (prisma as any).$transaction = originalTransaction; });
  (prisma as any).$transaction = async (callback: any) => callback(tx);
  return { writes, originQueries, item };
}

const context = { factoryUnitId: 1, role: 'admin' };

test('entrada aceita e registra uma origem configurada para o setor real do item', async t => {
  const { writes, originQueries } = setup(t, { itemSector: 'APOIO', acceptOrigin: true });
  const result = await new StockMovementService().createMovement({
    stockItemId: 7,
    type: 'ENTRADA',
    quantity: 1,
    locationId: 4,
    origem: 'Sobra de peça cortada',
  } as any, context);

  assert.equal(result.movementId, 99);
  assert.equal(originQueries.length, 1);
  assert.deepEqual(originQueries[0].where, {
    factoryUnitId: 1,
    name: 'SOBRA DE PEÇA CORTADA',
    OR: [{ sector: null }, { sector: 'APOIO' }],
  });
  assert.equal(writes.find(([kind]) => kind === 'movement')[1].origem, 'Sobra de peça cortada');
});

test('entrada também aceita origem geral', async t => {
  const { originQueries } = setup(t, { itemSector: 'MONTAGEM', acceptOrigin: true });
  await new StockMovementService().createMovement({
    stockItemId: 7,
    type: 'ENTRADA',
    quantity: 1,
    locationId: 4,
    origem: 'CONSUMO',
  } as any, context);

  assert.deepEqual(originQueries[0].where.OR, [{ sector: null }, { sector: 'MONTAGEM' }]);
});

test('origem cadastrada para outro setor é rejeitada antes de alterar o saldo', async t => {
  const { writes } = setup(t, { itemSector: 'PRE_FABRICADO' });
  const service = new StockMovementService();
  await assert.rejects(service.createMovement({
    stockItemId: 7,
    type: 'ENTRADA',
    quantity: 1,
    locationId: 4,
    origem: 'SOBRA DE PEÇA CORTADA',
  } as any, context), /não está cadastrada para o setor/);
  assert.equal(writes.length, 0);
});

test('entrada aceita ausência de origem e mantém o motivo padrão de compatibilidade', async t => {
  const { writes, originQueries } = setup(t, { itemSector: 'PRE_FABRICADO' });
  await new StockMovementService().createMovement({
    stockItemId: 7,
    type: 'ENTRADA',
    quantity: 1,
    locationId: 4,
  } as any, context);

  assert.equal(originQueries.length, 0);
  assert.equal(writes.find(([kind]) => kind === 'movement')[1].origem, 'Entrada Adicional');
});

test('origens de Distribuição são aceitas para itens com setor legado Expedição', async t => {
  const { originQueries } = setup(t, { itemSector: 'EXPEDICAO', acceptOrigin: true });
  await new StockMovementService().createMovement({
    stockItemId: 7,
    type: 'ENTRADA',
    quantity: 1,
    locationId: 4,
    origem: 'SOBRA DE CABEDAL',
  } as any, context);

  assert.deepEqual(originQueries[0].where.OR, [
    { sector: null },
    { sector: 'DISTRIBUICAO' },
    { sector: 'EXPEDICAO' },
  ]);
});

test('busca de estoque entrega ao seletor somente origens gerais e do setor ativo', async t => {
  const originQuery: any[] = [];
  const originals = [
    [prisma.stockItem, 'count'],
    [prisma.stockItem, 'findMany'],
    [prisma.location, 'findMany'],
    [prisma.originConfig, 'findMany'],
    [prisma.categoryConfig, 'findMany'],
  ] as const;
  for (const [model, method] of originals) {
    const original = (model as any)[method];
    (model as any)[method] = method === 'findMany' && model === prisma.originConfig
      ? async (args: any) => { originQuery.push(args); return [{ id: 5, name: 'SOBRA DE EVA', sector: 'PRE_FABRICADO' }]; }
      : async () => method === 'findMany' ? [] : 0;
    t.after(() => { (model as any)[method] = original; });
  }

  const result = await new StockItemService().searchUnified(
    { sector: 'PRE_FABRICADO' } as any,
    { factoryUnitId: 1, role: 'admin' } as any,
  );

  assert.deepEqual(originQuery[0].where.OR, [
    { sector: 'PRE_FABRICADO' },
    { sector: null },
  ]);
  assert.deepEqual(result.filterOptions.origins, [
    { id: 5, name: 'SOBRA DE EVA', sector: 'PRE_FABRICADO' },
  ]);
});
