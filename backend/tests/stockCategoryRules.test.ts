import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { StockItemService } from '../src/services/StockItemService';
import { StockCategoryError, StockOriginError, assertStockLocationCategory } from '../src/services/stockIdentity';
import { BatchCreateStockItemSchema } from '../src/types/stock.dto';

const categories = [
  { id: 10, name: 'TECIDO', sectors: ['CORTE'], entryMode: 'QUANTITY', defaultUnitCode: 'M²', unitLocked: true },
  { id: 11, name: 'MOLDE / PEÇA', sectors: ['APOIO'], entryMode: 'QUANTITY', defaultUnitCode: 'UN', unitLocked: false },
];

function setupStockDb(t: any, origins: Array<{ name: string; sector: string | null }> = [], locations?: any[]) {
  const created: any[] = [];
  const movements: any[] = [];
  const originQueries: any[] = [];
  const locationQueries: any[] = [];
  const configuredLocations = locations || [{ id: 1, name: 'PRAT-A', sector: null,
    categoryLinks: categories.map(category => ({ categoryId: category.id })) }];
  const getRequestedSectors = (where: any) => where?.OR?.flatMap((condition: any) =>
    condition.sectors?.hasSome || condition.sector?.in || []
  ) || [];
  const tx = {
    $queryRaw: async () => [],
    categoryConfig: {
      findFirst: async ({ where }: any) => {
        const category = categories.find(item => item.id === where.id);
        const sectors = getRequestedSectors(where);
        return category && (!sectors.length || category.sectors.some(sector => sectors.includes(sector))) ? category : null;
      },
    },
    originConfig: {
      findFirst: async ({ where }: any) => {
        originQueries.push(where);
        return origins.find(origin => (where.name.mode === 'insensitive'
          ? origin.name.toUpperCase() === where.name.equals.toUpperCase()
          : origin.name === where.name.equals)
          && where.OR.some((scope: any) => scope.sector === origin.sector)) || null;
      },
    },
    stockItem: {
      findMany: async () => [],
      create: async ({ data }: any) => {
        const item = { id: created.length + 1, ...data };
        created.push(item);
        return item;
      },
    },
    location: {
      findUnique: async ({ where }: any) => {
        locationQueries.push(where);
        return configuredLocations.find(location => location.name === where.factoryUnitId_name.name) || null;
      },
      findMany: async ({ where }: any) => {
        locationQueries.push(where);
        return configuredLocations.filter(location => location.name.toUpperCase() === where.name.equals.toUpperCase());
      },
    },
    stockItemLocation: { create: async () => ({}) },
    stockMovement: { create: async ({ data }: any) => { movements.push(data); return {}; } },
  };
  const originalTransaction = prisma.$transaction;
  (prisma as any).$transaction = (callback: any) => callback(tx);
  t.after(() => { (prisma as any).$transaction = originalTransaction; });
  return { created, movements, originQueries, locationQueries, create: (item: any) => new StockItemService().createBatch(
    BatchCreateStockItemSchema.parse({ items: [item] }),
    { factoryUnitId: 1, role: 'admin' },
  ) };
}

test('estoques exigem categoria em Corte, Pré-Fabricado e Distribuição', async t => {
  const { create } = setupStockDb(t);
  const cases = [
    { sector: 'CORTE', code: 'C1', name: 'TECIDO', quantity: 1, unit: 'M²', location: 'PRAT-A' },
    { sector: 'PRE_FABRICADO', sku: 'P1', productName: 'MODELO', color: 'PRETO', sizeGrade: '40', quantity: 1, location: 'PRAT-A' },
    { sector: 'DISTRIBUICAO', sku: 'D1', color: 'PRETO', sizeGrade: '40', quantity: 1, location: 'PRAT-A' },
  ];
  for (const item of cases) {
    assert.equal(BatchCreateStockItemSchema.safeParse({ items: [item] }).success, false);
  }
});

test('estoque rejeita categoria de outro setor e aplica unidade bloqueada da categoria', async t => {
  const { create, created } = setupStockDb(t);
  await assert.rejects(create({
    sector: 'DISTRIBUICAO', categoryId: 10, sku: 'D1', type: 'TECIDO', color: 'PRETO',
    sizeGrade: '40', quantity: 1, location: 'PRAT-A',
  }), StockCategoryError);

  await create({
    sector: 'CORTE', categoryId: 10, code: 'C1', name: 'TECIDO', type: 'TECIDO',
    quantity: 1.5, location: 'PRAT-A',
  });
  assert.equal(created[0].unit, 'M²');
});

test('Apoio com categoria persiste a classificação e o saldo inicial', async t => {
  const { create, created, movements, originQueries } = setupStockDb(t);
  await create({
    sector: 'APOIO', categoryId: 11, pieceCode: 'MOL-1', productName: '',
    description: 'MOLDE', materialColor: 'PRETO', sizeGrade: '40', quantity: 2, location: 'PRAT-A',
  });
  assert.equal(created[0].categoryId, 11);
  assert.equal(created[0].type, 'MOLDE / PEÇA');
  assert.equal(originQueries.length, 0);
  assert.equal(movements[0].origem, 'Saldo Inicial / Entrada no Setor');
});

test('cadastro inicial registra a origem configurada para o setor no histórico', async t => {
  const { create, movements, originQueries } = setupStockDb(t, [
    { name: 'SOBRA DE PEÇA CORTADA', sector: 'APOIO' },
  ]);
  await create({
    sector: 'APOIO', categoryId: 11, pieceCode: 'MOL-1', productName: '',
    description: 'MOLDE', materialColor: 'PRETO', sizeGrade: '40', quantity: 2,
    location: 'PRAT-A', origem: 'SOBRA DE PEÇA CORTADA', observation: 'Conferência inicial',
  });

  assert.deepEqual(originQueries[0].OR, [{ sector: null }, { sector: 'APOIO' }]);
  assert.equal(movements[0].origem, 'SOBRA DE PEÇA CORTADA');
  assert.equal(movements[0].reason, 'Conferência inicial');
});

test('cadastro inicial rejeita origem cadastrada para outro setor', async t => {
  const { create, created, movements } = setupStockDb(t, [
    { name: 'SOBRA DE CABEDAL', sector: 'DISTRIBUICAO' },
  ]);
  await assert.rejects(create({
    sector: 'APOIO', categoryId: 11, pieceCode: 'MOL-1', productName: '',
    description: 'MOLDE', materialColor: 'PRETO', sizeGrade: '40', quantity: 2,
    location: 'PRAT-A', origem: 'SOBRA DE CABEDAL',
  }), StockOriginError);

  assert.equal(created.length, 0);
  assert.equal(movements.length, 0);
});

test('entrada rápida aceita nome legado com caixa mista e preserva a origem cadastrada', async t => {
  const { create, created, movements, originQueries } = setupStockDb(t, [
    { name: 'Retalho Aproveitável', sector: null },
  ]);
  await create({ sector: 'CORTE', categoryId: 10, code: 'C-LEGADO', name: 'TECIDO',
    quantity: 1, location: 'PRAT-A', origem: 'RETALHO APROVEITÁVEL' });
  assert.equal(created.length, 1);
  assert.deepEqual(originQueries[0], { factoryUnitId: 1,
    name: { equals: 'RETALHO APROVEITÁVEL', mode: 'insensitive' },
    OR: [{ sector: null }, { sector: 'CORTE' }] });
  assert.equal(movements[0].origem, 'Retalho Aproveitável');
});

test('localização legada com caixa mista preserva ID e nome, inclusive em cliente que envia maiúsculas', async t => {
  const { create, movements, locationQueries } = setupStockDb(t, [], [
    { id: 83, name: 'Área de Triagem', sector: 'CORTE', categoryMode: 'SELECTED', categoryLinks: [{ categoryId: 10 }] },
  ]);
  await create({ sector: 'CORTE', categoryId: 10, code: 'C-LOCAL', name: 'TECIDO',
    quantity: 1, location: 'ÁREA DE TRIAGEM' });
  assert.deepEqual(locationQueries[1], { factoryUnitId: 1,
    name: { equals: 'ÁREA DE TRIAGEM', mode: 'insensitive' } });
  assert.equal(movements[0].destinationLocationId, 83);
  assert.equal(movements[0].destinationLocationName, 'Área de Triagem');
});

test('localizações com nomes equivalentes bloqueiam a entrada sem escolha arbitrária', async t => {
  const { create, created, movements } = setupStockDb(t, [], [
    { id: 83, name: 'Triagem', sector: 'CORTE' },
    { id: 84, name: 'triagem', sector: 'CORTE' },
  ]);
  await assert.rejects(create({ sector: 'CORTE', categoryId: 10, code: 'C-LOCAL', name: 'TECIDO',
    quantity: 1, location: 'TRIAGEM' }), /nomes equivalentes/);
  assert.equal(created.length, 0);
  assert.equal(movements.length, 0);
});


test('localização nova com modo ALL recebe categorias do setor sem vínculo manual', () => {
  assert.doesNotThrow(() => assertStockLocationCategory({ categoryMode: 'ALL', categoryLinks: [] }, 10));
});

test('localizações legadas e modo SELECTED preservam restrições explícitas', () => {
  const legacy = { categoryLinks: [{ categoryId: 10 }] };
  assert.doesNotThrow(() => assertStockLocationCategory(legacy, 10));
  assert.throws(() => assertStockLocationCategory(legacy, 11), StockCategoryError);
  assert.throws(() => assertStockLocationCategory({ categoryMode: 'SELECTED', categoryLinks: [] }, 10), StockCategoryError);
});
