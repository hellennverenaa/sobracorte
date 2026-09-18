import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { assignedStockSector, assertStockSectorAccess, assertGeneralStockAccess, StockAccessError } from '../src/auth/stockAccess';
import { StockMovementService } from '../src/services/StockMovementService';
import { StockItemService } from '../src/services/StockItemService';
import { SettingsController } from '../src/controllers/SettingsController';
import { StockItemController } from '../src/controllers/StockItemController';
import { ReportController } from '../src/controllers/ReportController';
import { executeImportTransaction } from '../src/import/materialImport';
import { UserService, UnauthorizedRoleAssignmentError } from '../src/services/UserService';
import { normalizeSector } from '../src/utils/sectorHelper';
import { normalizeStockSector } from '../src/services/stockIdentity';

function replace(t: any, object: any, methods: Record<string, any>) {
  for (const [key, method] of Object.entries(methods)) {
    const original = object[key]; object[key] = method;
    t.after(() => { object[key] = original; });
  }
}
function response() {
  let status = 200; let body: any;
  return { get status() { return status; }, get body() { return body; },
    res: { status(value: number) { status = value; return this; }, json(value: any) { body = value; return this; } } as any };
}

test('autocomplete de combinações força setor local em todos os perfis comuns', async t => {
  const queries: any[] = [];
  replace(t, prisma.stockItem, { findMany: async ({ where }: any) => { queries.push(where); return [{ color: 'LOCAL' }]; } });
  for (const role of ['admin_setor', 'lider', 'movimentador', 'leitor']) {
    const result = response();
    await new StockItemController().combinations({ tenant: { id: 1 }, user: { role, assignedSector: 'CORTE' }, query: { sector: 'APOIO' } } as any, result.res);
    assert.equal(result.status, 200);
    assert.equal(queries.at(-1).sector, 'CORTE');
    assert.equal(queries.at(-1).factoryUnitId, 1);
  }
  const master = response();
  await new StockItemController().combinations({ tenant: { id: 1 }, user: { role: 'admin' }, query: { sector: 'APOIO' } } as any, master.res);
  assert.equal(master.status, 200);
  assert.equal(queries.at(-1).sector, 'APOIO');
});

test('normalização de aliases é a mesma para autorização e identidade de estoque', () => {
  for (const value of ['Expedição', ' expedicao ', 'CABEDAIS', 'distribuição']) {
    assert.equal(normalizeSector(value), 'DISTRIBUICAO');
    assert.equal(normalizeStockSector(value), 'DISTRIBUICAO');
    assert.equal(assignedStockSector({ role: 'leitor', assignedSector: value }), 'DISTRIBUICAO');
  }
  assert.throws(() => assignedStockSector({ role: 'leitor', assignedSector: 'DESCONHECIDO' }), StockAccessError);
});

test('perfil legado de Consumo não recebe setor de estoque automaticamente', () => {
  assert.throws(() => assignedStockSector({ role: 'leitor', assignedSector: 'CONSUMO' }), StockAccessError);
});

test('perfis comuns exigem setor específico; Geral/Livre é exclusivo de Master', () => {
  for (const role of ['admin_setor', 'lider', 'movimentador', 'leitor']) {
    for (const assignedSector of [null, '', 'TODOS', 'INVALIDO']) assert.throws(() => assignedStockSector({ role, assignedSector }), StockAccessError);
    const context = { role, assignedSector: 'EXPEDICAO' };
    assert.equal(assignedStockSector(context), 'DISTRIBUICAO');
    assert.doesNotThrow(() => assertStockSectorAccess(context, 'CABEDAIS'));
    assert.throws(() => assertStockSectorAccess(context, 'MONTAGEM'), StockAccessError);
    assert.throws(() => assertGeneralStockAccess(context, { sector: null }), StockAccessError);
  }
  for (const context of [{ role: 'admin' }, { role: 'leitor', isGlobalAdmin: true }]) {
    assert.equal(assignedStockSector(context), null);
    assert.doesNotThrow(() => assertGeneralStockAccess(context, { sector: null }));
  }
});

test('movimentação sem sector no payload autoriza pelo item real antes de gravar', async t => {
  let writes = 0;
  const tx: any = { $queryRaw: async () => [], stockItem: {
    findFirst: async () => ({ id: 9, sector: 'MONTAGEM', unit: 'UN', quantity: 10, locations: [] }),
    update: async () => { writes++; },
  } };
  replace(t, prisma, { $transaction: async (cb: any) => cb(tx) });
  for (const role of ['admin_setor', 'lider', 'movimentador']) {
    await assert.rejects(new StockMovementService().createMovement({ stockItemId: 9, type: 'SAIDA', quantity: 1 } as any,
      { factoryUnitId: 1, role, assignedSector: 'CORTE' }), StockAccessError);
  }
  assert.equal(writes, 0);
});

test('cadastro e CSV não gravam em Geral/Livre com perfil de setor', async t => {
  let writes = 0;
  const tx: any = { $queryRaw: async () => [], location: {
    findUnique: async () => ({ id: 1, sector: null }), findFirst: async () => ({ id: 1, sector: null }),
  }, categoryConfig: { findFirst: async () => null }, stockItem: { create: async () => { writes++; } } };
  replace(t, prisma, { $transaction: async (cb: any) => cb(tx) });
  const item: any = { sector: 'CORTE', code: 'C1', name: 'TECIDO', type: 'TECIDO', quantity: 1, unit: 'M2', location: 'GERAL', locationId: 1 };
  for (const role of ['admin_setor', 'lider']) {
    const context = { factoryUnitId: 1, role, assignedSector: 'CORTE' };
    await assert.rejects(new StockItemService().createBatch({ items: [item] }, context), StockAccessError);
    await assert.rejects(executeImportTransaction(prisma, [item], context), StockAccessError);
  }
  // A regra também verifica cada linha de lote, não somente a primeira.
  await assert.rejects(new StockItemService().createBatch({ items: [{ ...item, sector: 'APOIO' }] },
    { factoryUnitId: 1, role: 'lider', assignedSector: 'CORTE' }), StockAccessError);
  assert.equal(writes, 0);
});

test('consultas de configurações forçam setor e não incluem Geral/Livre para operação', async t => {
  const queries: any[] = [];
  replace(t, prisma.location, { findMany: async (args: any) => { queries.push(args.where); return []; } });
  for (const role of ['admin_setor', 'lider', 'movimentador', 'leitor']) {
    const result = response();
    await new SettingsController().getLocations({ tenant: { id: 1 }, user: { role, assignedSector: 'EXPEDICAO' }, query: { sector: 'MONTAGEM' } } as any, result.res);
    assert.equal(result.status, 200);
    assert.deepEqual(queries.at(-1), { factoryUnitId: 1, OR: [{ sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] } }] });
  }
});

test('edição e exclusão de localização de outro setor não alcançam a gravação', async t => {
  replace(t, prisma.location, { findFirst: async ({ where }: any) => {
    assert.equal(where.sector, 'CORTE');
    return null; // Localização MONTAGEM não corresponde ao filtro de autorização.
  } });
  replace(t, prisma, { $transaction: async () => { assert.fail('não deve abrir transação de gravação'); } });
  for (const method of ['updateLocation', 'deleteLocation'] as const) {
    const result = response();
    await new SettingsController()[method]({ tenant: { id: 1 }, user: { role: 'admin_setor', assignedSector: 'CORTE' }, params: { id: '99' }, body: { sector: 'CORTE' } } as any, result.res);
    assert.equal(result.status, 404);
  }
});

test('relatório de inventário aplica o setor às listas e a todos os totais', async t => {
  const queries: any[] = [];
  replace(t, prisma.stockItem, {
    findMany: async (args: any) => { queries.push(args.where); return []; },
    count: async (args: any) => { queries.push(args.where); return 0; },
    aggregate: async (args: any) => { queries.push(args.where); return { _sum: { quantity: 0 } }; },
    groupBy: async (args: any) => { queries.push(args.where); return []; },
  });
  const result = response();
  await new ReportController().inventory({ tenant: { id: 1 }, user: { role: 'lider', assignedSector: 'CORTE' }, query: { sector: 'TODOS' } } as any, result.res);
  assert.equal(result.status, 200);
  assert.equal(queries.length, 5);
  for (const where of queries) assert.deepEqual(where, { factoryUnitId: 1, sector: 'CORTE' });
});

test('somente Global pode rebaixar ou remover Master; perfis restritos precisam de setor', async () => {
  let writes = 0;
  const target = { id: 9, role: 'admin', assignedSector: null, identity: { usuario: 'MASTER.ALVO', nome: 'Master' } };
  const tx: any = { $queryRaw: async () => [], userRoleBinding: {
    findFirst: async () => target,
    update: async ({ data }: any) => { writes++; return { ...target, ...data }; },
    delete: async () => { writes++; return target; },
  }, roleChangeAudit: { create: async () => ({}) }, stockMovement: { create: async () => ({}) } };
  const db = { $transaction: async (cb: any) => cb(tx) };
  const service = new UserService();
  for (const role of ['admin_setor', 'lider', 'movimentador', 'leitor'] as const) {
    await assert.rejects(service.updateUserRole(db, { targetUserId: 9, factoryUnitId: 1, newRole: role, newSector: 'CORTE', actor: { usuario: 'LOCAL', nome: 'Local', isGlobalAdmin: false } }), UnauthorizedRoleAssignmentError);
  }
  await assert.rejects(service.removeUser(db, 9, 1, { usuario: 'LOCAL', isGlobalAdmin: false }), UnauthorizedRoleAssignmentError);
  assert.equal(writes, 0);
  await service.updateUserRole(db, { targetUserId: 9, factoryUnitId: 1, newRole: 'lider', newSector: 'CORTE', actor: { usuario: 'GLOBAL', nome: 'Global', isGlobalAdmin: true } });
  await service.removeUser(db, 9, 1, { usuario: 'GLOBAL', isGlobalAdmin: true });
  assert.equal(writes, 2);
  target.role = 'leitor';
  await assert.rejects(service.updateUserRole(db, { targetUserId: 9, factoryUnitId: 1, newRole: 'admin_setor', newSector: null, actor: { usuario: 'GLOBAL', nome: 'Global', isGlobalAdmin: true } }), StockAccessError);
});
