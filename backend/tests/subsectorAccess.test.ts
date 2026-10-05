import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStockSubsectorAccess,
  locationScopeWhere,
  stockItemScopeWhere,
  stockMovementScopeWhere,
} from '../src/auth/subsectorAccess';
import { StockAccessError } from '../src/auth/stockAccess';
import { prisma } from '../src/prisma';
import { SubsectorController } from '../src/controllers/SubsectorController';
import { tenantStorage } from '../src/context/tenantContext';

function replace(t: any, object: any, methods: Record<string, any>) {
  for (const [key, method] of Object.entries(methods)) {
    const original = object[key]; object[key] = method;
    t.after(() => { object[key] = original; });
  }
}

function response() {
  let status = 200; let body: any;
  return {
    get status() { return status; }, get body() { return body; },
    res: { status(value: number) { status = value; return this; }, json(value: any) { body = value; return this; } } as any,
  };
}

test('estoque de papel operacional combina setor, vínculos explícitos e legado', () => {
  const scope = stockItemScopeWhere({
    role: 'movimentador', assignedSector: 'APOIO', subsectorIds: [12, 15],
  });
  assert.deepEqual(scope, {
    AND: [
      { sector: 'APOIO' },
      { OR: [{ subsectorId: null }, { subsectorId: { in: [12, 15] } }] },
    ],
  });
});

test('Admin de Setor vê subsetores do setor atribuído e registros legados', () => {
  const scope = locationScopeWhere({ role: 'admin_setor', assignedSector: 'DISTRIBUICAO', subsectorIds: [] });
  assert.deepEqual(scope, {
    AND: [
      { sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] } },
      { OR: [
        { subsectorId: null },
        { subsector: { sector: 'DISTRIBUICAO' } },
      ] },
    ],
  });
});

test('histórico limita movimentos aos subsetores autorizados e mantém eventos legados', () => {
  const scope = stockMovementScopeWhere({ role: 'lider', assignedSector: 'CORTE', subsectorIds: [7] });
  assert.deepEqual(scope, {
    AND: [
      { sector: 'CORTE' },
      { OR: [
        { subsectorId: null, OR: [{ stockItemId: null }, { stockItem: { is: { subsectorId: null } } }] },
        { subsectorId: { in: [7] } },
      ] },
    ],
  });
});

test('gravação confere papel, setor e subsetor do registro real', () => {
  const operator = { role: 'movimentador', assignedSector: 'APOIO', subsectorIds: [4] };
  assert.doesNotThrow(() => assertStockSubsectorAccess(operator, { id: 4, sector: 'APOIO' }, 'APOIO'));
  assert.doesNotThrow(() => assertStockSubsectorAccess(operator, null, 'APOIO'));
  assert.throws(() => assertStockSubsectorAccess(operator, { id: 5, sector: 'APOIO' }, 'APOIO'), StockAccessError);
  assert.throws(() => assertStockSubsectorAccess(operator, { id: 4, sector: 'MONTAGEM' }, 'MONTAGEM'), StockAccessError);
  assert.throws(() => assertStockSubsectorAccess(
    { role: 'leitor', assignedSector: 'APOIO', subsectorIds: [4] },
    { id: 4, sector: 'APOIO' }, 'APOIO',
  ), StockAccessError);
});

test('API lista apenas subsetores explicitamente atribuídos a papel operacional', async t => {
  let query: any;
  replace(t, prisma.subsectorConfig, {
    findMany: async (args: any) => { query = args; return []; },
  });
  const result = response();
  await tenantStorage.run({ tenantId: 3 }, () => new SubsectorController().list({
    tenant: { id: 3 },
    query: { sector: 'APOIO' },
    effectiveContext: { effectiveRole: 'movimentador', assignedSector: 'APOIO', subsectorIds: [8], isGlobalAdmin: false },
  } as any, result.res));
  assert.equal(result.status, 200);
  assert.deepEqual(query.where, { factoryUnitId: 3, active: true, sector: 'APOIO', id: { in: [8] } });
});

test('API cria subsetor e normaliza nome sem duplicar categoria', async t => {
  let createData: any;
  replace(t, prisma.categoryConfig, { findMany: async () => [{ id: 11 }] });
  const tx: any = {
    categoryConfig: { findMany: async () => [{ id: 11 }] },
    subsectorConfig: { create: async ({ data }: any) => { createData = data; return { id: 41, ...data }; } },
    stockMovement: { create: async () => ({ id: 91 }) },
  };
  replace(t, prisma, { $transaction: async (callback: any) => callback(tx) });
  const result = response();
  await tenantStorage.run({ tenantId: 3 }, () => new SubsectorController().create({
    tenant: { id: 3 },
    user: { usuario: 'ADMIN', nome: 'Admin' },
    effectiveContext: { effectiveRole: 'admin', assignedSector: null, subsectorIds: [], isGlobalAdmin: false },
    body: { sector: 'APOIO', name: 'Serigrafia', categoryMode: 'SELECTED', categoryIds: [11] },
  } as any, result.res));
  assert.equal(result.status, 201);
  assert.equal(createData.normalizedName, 'SERIGRAFIA');
  assert.deepEqual(createData.categoryLinks.create, [{ categoryConfigId: 11, factoryUnitId: 3 }]);
});

test('API rejeita categoria de outra unidade/setor antes de criar subsetor', async t => {
  let transactionStarted = false;
  replace(t, prisma.categoryConfig, { findMany: async () => [] });
  replace(t, prisma, { $transaction: async () => { transactionStarted = true; } });
  const result = response();
  await tenantStorage.run({ tenantId: 3 }, () => new SubsectorController().create({
    tenant: { id: 3 },
    effectiveContext: { effectiveRole: 'admin', assignedSector: null, subsectorIds: [], isGlobalAdmin: false },
    body: { sector: 'APOIO', name: 'Serigrafia', categoryMode: 'SELECTED', categoryIds: [99] },
  } as any, result.res));
  assert.equal(result.status, 400);
  assert.equal(transactionStarted, false);
});

test('API impede vincular usuário operacional a subsetor de outro setor', async t => {
  let writes = 0;
  let subsectorQuery: any;
  const tx: any = {
    $queryRawUnsafe: async () => [],
    userRoleBinding: { findFirst: async () => ({ id: 24, role: 'movimentador', assignedSector: 'APOIO', identity: { usuario: 'OPERADOR', nome: 'Operador' } }) },
    subsectorConfig: { findMany: async (args: any) => { subsectorQuery = args.where; return [{ id: 8, sector: 'MONTAGEM' }]; } },
    userSubsectorAccess: {
      deleteMany: async () => { writes++; },
      createMany: async () => { writes++; },
    },
  };
  replace(t, prisma, { $transaction: async (callback: any) => callback(tx) });
  const result = response();
  await tenantStorage.run({ tenantId: 3 }, () => new SubsectorController().replaceUserAccess({
    tenant: { id: 3 }, params: { id: '24' }, body: { subsectorIds: [8] },
    effectiveContext: { effectiveRole: 'admin', assignedSector: null, subsectorIds: [], isGlobalAdmin: false },
  } as any, result.res));
  assert.equal(result.status, 400);
  assert.deepEqual(subsectorQuery, { factoryUnitId: 3, active: true, id: { in: [8] } });
  assert.equal(writes, 0);
});

test('API persiste somente os subsetores ativos enviados no vínculo do usuário', async t => {
  let saved: any[] = [];
  const tx: any = {
    $queryRawUnsafe: async () => [],
    userRoleBinding: { findFirst: async () => ({ id: 24, role: 'lider', assignedSector: 'APOIO', identity: { usuario: 'LIDER', nome: 'Líder' } }) },
    subsectorConfig: { findMany: async () => [{ id: 8, sector: 'APOIO' }, { id: 9, sector: 'APOIO' }] },
    userSubsectorAccess: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: any) => { saved = data; return { count: data.length }; },
    },
    stockMovement: { create: async () => ({ id: 92 }) },
  };
  replace(t, prisma, { $transaction: async (callback: any) => callback(tx) });
  const result = response();
  await tenantStorage.run({ tenantId: 3 }, () => new SubsectorController().replaceUserAccess({
    tenant: { id: 3 }, params: { id: '24' }, body: { subsectorIds: [8, 9] },
    user: { usuario: 'ADMIN', nome: 'Admin' },
    effectiveContext: { effectiveRole: 'admin', assignedSector: null, subsectorIds: [], isGlobalAdmin: false },
  } as any, result.res));
  assert.equal(result.status, 200);
  assert.deepEqual(saved, [
    { bindingId: 24, subsectorId: 8, factoryUnitId: 3 },
    { bindingId: 24, subsectorId: 9, factoryUnitId: 3 },
  ]);
});
