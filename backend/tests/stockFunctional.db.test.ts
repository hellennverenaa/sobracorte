import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { prisma, prismaForInternalUse } from '../src/prisma';
import { tenantStorage } from '../src/context/tenantContext';
import { StockItemService } from '../src/services/StockItemService';
import { StockMovementService } from '../src/services/StockMovementService';
import { MountingPairService } from '../src/services/MountingPairService';
import { RequisitionService } from '../src/services/RequisitionService';
import { BatchCreateStockItemSchema, RequisitionItemInputSchema } from '../src/types/stock.dto';
import { DuplicateStockItemError } from '../src/services/stockIdentity';
import { parseCsvRFC4180 } from '../src/import/csvParser';
import { executeImportTransaction, validateImportBatch } from '../src/import/materialImport';
import { createApp } from '../src/app';
import { vars } from '../src/config/dotenv';

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url) && url === process.env.DATABASE_URL
  && /^\/sobracorte_cycle7_[a-z0-9_]+$/.test(new URL(url!).pathname)
  && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname);
const options = { skip: enabled ? false : 'exige banco local descartável sobracorte_cycle7_* e URLs de teste iguais' };
after(async () => { await prisma.$disconnect(); });
const items = new StockItemService();
const movements = new StockMovementService();
const requests = new RequisitionService();
const pairs = new MountingPairService();
const corte = (code: string, quantity = 10, unit = 'M2', location = 'C1') => ({ sector: 'CORTE', code, name: code, quantity, unit, location });
const shoe = (side: 'E' | 'D', quantity: number, sku = 'PAIR') => ({ sector: 'MONTAGEM', sku, productName: sku, color: 'BLACK', sizeGrade: '40', footSide: side, quantity, unit: 'UND', location: 'M1' });

async function inUnit(callback: (context: any) => Promise<void>) {
  const unit = await prismaForInternalUse.factoryUnit.create({ data: {
    code: `C7_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`.toUpperCase(), name: 'Functional disposable test',
  } });
  await tenantStorage.run({ tenantId: unit.id }, () => callback({ factoryUnitId: unit.id, role: 'admin', operatorId: '700', operatorName: 'Synthetic test operator', code: unit.code }));
}
async function create(context: any, ...data: any[]) {
  return (await items.createBatch(BatchCreateStockItemSchema.parse({ items: data }), context)).items;
}
async function balance(id: number, expected: number) {
  const item = await prisma.stockItem.findFirstOrThrow({ where: { id }, include: { locations: true } });
  assert.equal(Number(item.quantity), expected);
  assert.equal(item.locations.reduce((sum, link) => sum + Number(link.quantity), 0), expected);
  assert.ok(item.locations.every(link => Number(link.quantity) >= 0));
}
const requestFor = (code: string, quantityRequested = 10) => RequisitionItemInputSchema.parse({ requestSector: 'CORTE', sku: code, description: code, quantityRequested, reason: 'TEST' });

test('cadastro duplicado concorrente grava uma vez e reverte localização da tentativa perdedora', options, async () => inUnit(async context => {
  const results = await Promise.allSettled(['D1', 'D2'].map(location => create(context, corte('DUP', 10, 'M2', location))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof DuplicateStockItemError);
  assert.equal(await prisma.stockItem.count(), 1);
  assert.equal(await prisma.location.count(), 1);
  assert.equal(await prisma.stockMovement.count(), 1);
  await balance((await prisma.stockItem.findFirstOrThrow()).id, 10);
}));

test('entrada, transferência, refugo e baixas concorrentes preservam saldo decimal por localização', options, async () => inUnit(async context => {
  const [item] = await create(context, corte('BALANCE', 10.5, 'KG'));
  const source = await prisma.location.findFirstOrThrow({ where: { name: 'C1' } });
  const destination = await prisma.location.create({ data: { factoryUnitId: context.factoryUnitId, name: 'C2', sector: 'CORTE' } });
  const move = (data: any) => movements.createMovement({ stockItemId: item.id, locationId: source.id, ...data }, context);
  await move({ type: 'ENTRADA', quantity: 0.5 });
  await move({ type: 'TRANSFERENCIA', quantity: 3.5, destinationLocationId: destination.id });
  await balance(item.id, 11);
  await move({ type: 'REFUGO', quantity: 0.5 });
  await assert.rejects(move({ type: 'TRANSFERENCIA', quantity: 8, destinationLocationId: destination.id }), /Saldo insuficiente/);
  await balance(item.id, 10.5);
  const results = await Promise.allSettled([move({ type: 'SAIDA', quantity: 5 }), move({ type: 'SAIDA', quantity: 5 })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  await balance(item.id, 5.5);
  assert.equal(await prisma.stockMovement.count(), 5);
}));

test('pares concorrentes debitam apenas uma vez e falha no segundo pé reverte o primeiro', options, async () => inUnit(async context => {
  const [left, right] = await create(context, shoe('E', 131), shoe('D', 134));
  const match = () => pairs.executeMatch({ leftStockItemId: left.id, rightStockItemId: right.id, quantity: 100, sector: 'MONTAGEM', reason: '' }, context);
  const results = await Promise.allSettled([match(), match()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  await balance(left.id, 31);
  await balance(right.id, 34);
  const [rollbackLeft, rollbackRight] = await create(context, shoe('E', 131, 'ROLLBACK'), shoe('D', 50, 'ROLLBACK'));
  const before = await prisma.stockMovement.count();
  await assert.rejects(pairs.executeMatch({ leftStockItemId: rollbackLeft.id, rightStockItemId: rollbackRight.id, quantity: 100, sector: 'MONTAGEM', reason: '' }, context), /Saldo insuficiente/);
  await balance(rollbackLeft.id, 131);
  await balance(rollbackRight.id, 50);
  assert.equal(await prisma.stockMovement.count(), before);
  const request = (await requests.createRequisition(RequisitionItemInputSchema.parse({ requestSector: 'MONTAGEM', sku: 'ROLLBACK', modelName: 'ROLLBACK', description: 'SHOE', color: 'BLACK', sizeGrade: '40', footSide: 'PAR', quantityRequested: 100, reason: 'TEST' }), context)).items[0];
  await assert.rejects(requests.fulfillRequisition(request.id, { quantity: 100, observation: '' }, context), /Saldo insuficiente/);
  await balance(rollbackLeft.id, 131);
  await balance(rollbackRight.id, 50);
  assert.equal(Number((await prisma.materialRequisition.findFirstOrThrow({ where: { id: request.id } })).quantityFulfilled), 0);
  assert.equal(await prisma.stockMovement.count(), before);
  await requests.fulfillRequisition(request.id, { quantity: 10, observation: '' }, context);
  await balance(rollbackLeft.id, 121);
  await balance(rollbackRight.id, 40);
}));

test('requisições concorrentes têm códigos distintos e multi-itens compartilham código atomicamente', options, async () => inUnit(async context => {
  await create(context, corte('REQUEST'));
  const results = await Promise.all(Array.from({ length: 4 }, () => requests.createRequisition({ items: [requestFor('REQUEST'), requestFor('REQUEST')] }, context)));
  assert.equal(new Set(results.map(result => result.code)).size, 4);
  for (const result of results) {
    assert.equal(result.items.length, 2);
    assert.ok(result.items.every(item => item.code === result.code));
  }
  assert.equal(await prisma.materialRequisition.count(), 8);
  await assert.rejects(requests.createRequisition({ items: [requestFor('REQUEST'), requestFor('MISSING')] }, context), /INDISPONÍVEL/);
  assert.equal(await prisma.materialRequisition.count(), 8);
}));

test('atendimentos concorrentes não excedem pendência; atendimento/cancelamento têm resultado consistente', options, async () => inUnit(async context => {
  const [item] = await create(context, corte('FULFILL', 30));
  const first = (await requests.createRequisition(requestFor('FULFILL'), context)).items[0];
  const fulfill = (id: string, quantity: number) => requests.fulfillRequisition(id, { quantity, observation: '' }, context);
  const results = await Promise.allSettled([fulfill(first.id, 7), fulfill(first.id, 7)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(Number((await prisma.materialRequisition.findFirstOrThrow({ where: { id: first.id } })).quantityFulfilled), 7);
  await balance(item.id, 23);
  const second = (await requests.createRequisition(requestFor('FULFILL'), context)).items[0];
  const race = await Promise.allSettled([fulfill(second.id, 5), requests.cancelRequisition(second.id, context)]);
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
  const saved = await prisma.materialRequisition.findFirstOrThrow({ where: { id: second.id } });
  assert.ok(['CANCELADA', 'ATENDIDA_PARCIAL'].includes(saved.status));
  const amount = Number(saved.quantityFulfilled);
  assert.equal(amount, saved.status === 'CANCELADA' ? 0 : 5);
  await balance(item.id, 23 - amount);
}));

test('CSV real importa os setores ativos e recusa frações de unidades discretas', options, async () => inUnit(async context => {
  const sectors = ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'] as const;
  const locations = await Promise.all(sectors.map(sector => prisma.location.create({ data: { factoryUnitId: context.factoryUnitId, name: sector, sector } })));
  const csv = parseCsvRFC4180('setor;codigo;descricao;modelo;unidade;tipo;quantidade;prateleira;cor;grade;lado\n' + sectors.map(sector =>
    `${sector};IMPORT-${sector};DESCRIPTION-${sector};MODEL-${sector};${sector === 'CORTE' ? 'M2' : 'UND'};TEST;${sector === 'CORTE' ? '1,5' : '2'};${sector};BLACK;40;${sector === 'MONTAGEM' ? 'E' : ''}`,
  ).join('\n'));
  const validated = validateImportBatch(csv.headers, csv.rows, 'CORTE', locations);
  await executeImportTransaction(prisma, validated, context);
  assert.equal(await prisma.stockItem.count(), 6);
  assert.equal(await prisma.stockMovement.count(), 6);
  for (const item of await prisma.stockItem.findMany()) await balance(item.id, Number(item.quantity));
  await assert.rejects(executeImportTransaction(prisma, validated, context), DuplicateStockItemError);
  assert.equal(await prisma.stockItem.count(), 5);
  for (const sector of ['CORTE']) {
    const discrete = parseCsvRFC4180(`setor;codigo;descricao;unidade;quantidade;prateleira\n${sector};FRACTION;TEST;UN;1,5;${sector}`);
    assert.throws(() => validateImportBatch(discrete.headers, discrete.rows, sector, locations), /validação/i);
  }
  assert.throws(() => BatchCreateStockItemSchema.parse({ items: [corte('FRACTION', 1.5, 'UN')] }), /inteiro/);
  assert.equal(BatchCreateStockItemSchema.safeParse({ items: [{ sector: 'CONSUMO', code: 'FRACTION', productName: 'TEST', quantity: 1.5, unit: 'UN', location: 'CONSUMO' }] }).success, false);
}));

test('histórico e inbox desempatem timestamps iguais por ID entre páginas', options, async () => inUnit(async context => {
  await create(context, corte('PAGES', 30));
  for (let index = 0; index < 3; index++) await requests.createRequisition(requestFor('PAGES'), context);
  const timestamp = new Date('2026-09-17T12:00:00Z');
  await prisma.materialRequisition.updateMany({ data: { createdAt: timestamp } });
  const expected = (await prisma.materialRequisition.findMany()).map(item => item.id).sort().reverse();
  const actual = [];
  for (let page = 1; page <= 3; page++) actual.push((await requests.listRequisitions({ page, limit: 1 }, context)).data[0].id);
  assert.deepEqual(actual, expected);
  const item = await prisma.stockItem.findFirstOrThrow();
  for (let index = 0; index < 2; index++) await movements.createMovement({ stockItemId: item.id, type: 'ENTRADA', quantity: 1, origem: '', reason: '' }, context);
  await prisma.stockMovement.updateMany({ data: { createdAt: timestamp } });
  const movementIds = (await prisma.stockMovement.findMany()).map(row => row.id).sort((a, b) => b - a);
  const paginated = [];
  for (let page = 1; page <= 3; page++) paginated.push((await movements.getHistory({ page, limit: 1 }, context)).data[0].id);
  assert.deepEqual(paginated, movementIds);
}));

test('HTTP real cobre relatórios/exportações, snapshots e 404 das APIs removidas', options, async () => inUnit(async context => {
  const [item] = await create(context, corte('HTTP', 2.5, 'KG'));
  await create(context, corte('HTTP-M2', 3, 'M2'));
  const identity = await prismaForInternalUse.authIdentity.create({ data: { nativeUnitId: context.factoryUnitId, authOrigin: 'EXTERNO', authUserId: 'http-user', usuario: 'HTTP.TEST', nome: 'Synthetic HTTP', email: 'http@test.local' } });
  await prisma.userRoleBinding.create({ data: { identityId: identity.id, factoryUnitId: context.factoryUnitId, role: 'admin' } });
  const previousKey = vars.PRIVATE_KEY;
  const previousAdmins = vars.GLOBAL_ADMIN_IDENTITIES;
  vars.PRIVATE_KEY = 'cycle7-functional-http-test-key';
  vars.GLOBAL_ADMIN_IDENTITIES = new Set();
  const token = jwt.sign({ usuario: 'HTTP.TEST', matricula: '700', unidade: context.code, origem: 'EXTERNO', id: 'http-user' }, vars.PRIVATE_KEY, { expiresIn: '5m' });
  const server = http.createServer(createApp({ corsOrigins: ['http://localhost'] }));
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const get = (path: string) => fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const post = (path: string, payload: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const catalog = await (await get('/settings/units')).json();
    assert.equal(catalog.length, 10);
    assert.ok(catalog.every((unit: any) => typeof unit.integerOnly === 'boolean' && !('id' in unit) && !('linkedCount' in unit)));
    assert.equal((await post('/settings/units', { name: 'Livre', symbol: 'FOLHA' })).status, 404);
    assert.equal((await fetch(`${base}/settings/units/1`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })).status, 404);
    const categoryResponse = await post('/settings/categories', { name: 'LOCKED', sector: 'CORTE', defaultUnitCode: 'm2', unitLocked: true });
    assert.equal(categoryResponse.status, 201);
    assert.equal((await categoryResponse.json()).defaultUnitCode, 'M²');
    const rejected = await post('/inventory/batch', { items: [{ ...corte('LOCKED-INVALID', 1, 'KG'), type: 'LOCKED' }] });
    assert.equal(rejected.status, 400);
    assert.match(JSON.stringify(await rejected.json()), /bloqueada/);

    for (const path of ['/dashboard/summary', '/inventory/search?sector=CORTE', '/inventory/combinations?sector=CORTE', '/inventory/mounting/matching-pairs', '/inventory/movements/history', '/requisitions', '/requisitions/pending-count', '/reports/inventory', '/reports/movements', '/reports/requisitions', '/reports/inventory/export', '/reports/movements/export', '/reports/requisitions/export']) assert.equal((await get(path)).status, 200, path);
    assert.equal((await get('/inventory/search?sector=CONSUMO')).status, 400);
    for (const path of ['/materials', '/movements', '/stats', '/reports/data', '/dashboard/origem-sobras', '/dashboard/distribuicao', '/dashboard/top-materiais']) assert.equal((await get(path)).status, 404, path);
    const report = await (await get('/reports/inventory?page=1&limit=1')).json();
    assert.equal(report.items.length, 1);
    assert.equal(report.pagination.total, 3);
    assert.equal(report.totals.quantidadeTotal, null);
    assert.equal(report.totals.porUnidade.KG.quantidadeTotal, 4);
    assert.equal(report.totals.porUnidade['M²'].quantidadeTotal, 3);
    const moveResponse = await fetch(`${base}/inventory/movements`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ stockItemId: item.id, type: 'SAIDA', quantity: 0.5 }) });
    assert.equal(moveResponse.status, 201);
    await balance(item.id, 2);
    const source = await prisma.location.findFirstOrThrow({ where: { name: 'C1' } });
    await prisma.location.update({ where: { id_factoryUnitId: { id: source.id, factoryUnitId: context.factoryUnitId } }, data: { name: 'RENAMED.LOCATION' } });
    await prisma.stockItem.update({ where: { id_factoryUnitId: { id: item.id, factoryUnitId: context.factoryUnitId } }, data: { name: 'RENAMED.ITEM' } });
    let history = await (await get('/reports/movements')).json();
    assert.ok(history.items.some((row: any) => row.codigo === 'HTTP' && row.descricao === 'HTTP' && row.prateleira === 'C1'));
    await movements.createMovement({ stockItemId: item.id, type: 'SAIDA', quantity: 2.5, origem: '', reason: '' }, context);
    assert.equal((await fetch(`${base}/inventory/stock-items/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })).status, 200);
    history = await (await get('/reports/movements')).json();
    assert.ok(history.items.some((row: any) => row.codigo === 'HTTP' && row.descricao === 'HTTP' && row.prateleira === 'C1'));
    const unknown = await prisma.stockMovement.create({ data: { factoryUnitId: context.factoryUnitId, sector: 'MONTAGEM', type: 'SAIDA', quantity: 1, itemCode: 'OLD.UNKNOWN' } });
    const historical = (await movements.getHistory({ page: 1, limit: 100 }, context)).data.find(row => row.id === unknown.id)!;
    assert.equal(historical.itemModelName, null);
    assert.equal(historical.itemSizeGrade, null);
    assert.equal(historical.itemColor, null);
    const exported = await (await get('/reports/movements/export')).text();
    assert.match(exported, /OLD.UNKNOWN/);
    assert.match(exported, /HTTP/);
  } finally {
    vars.PRIVATE_KEY = previousKey;
    vars.GLOBAL_ADMIN_IDENTITIES = previousAdmins;
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}));

test('quantidades seguem o catálogo nas entradas, transferências e requisições', options, async () => inUnit(async context => {
  for (const unit of ['UN', 'PAR', 'CX', 'ROLO', 'M', 'M²', 'CM', 'L', 'G', 'KG']) {
    const code = `UNIT-${unit}`;
    const [item] = await create(context, corte(code, 10, unit));
    const location = await prisma.location.findFirstOrThrow({ where: { name: 'C1' } });
    const discrete = ['UN', 'PAR', 'CX', 'ROLO'].includes(unit);
    for (const quantity of [0, -1, 1.0001, ...(discrete ? [1.01] : [])]) {
      for (const type of ['ENTRADA', 'SAIDA', 'TRANSFERENCIA'] as const) await assert.rejects(movements.createMovement({ stockItemId: item.id, type, quantity, locationId: location.id, origem: '', reason: '' }, context));
    }
    await balance(item.id, 10);
    if (discrete) await assert.rejects(requests.createRequisition(requestFor(code, 1.01), context), /inteiro/);
    const quantity = discrete ? 1 : 1.01;
    await movements.createMovement({ stockItemId: item.id, type: 'ENTRADA', quantity, locationId: location.id, origem: '', reason: '' }, context);
    const request = (await requests.createRequisition(requestFor(code, quantity), context)).items[0];
    await assert.rejects(requests.fulfillRequisition(request.id, { quantity: 0.0001, observation: '' }, context));
    if (discrete) await assert.rejects(requests.fulfillRequisition(request.id, { quantity: 0.5, observation: '' }, context), /inteiro/);
    await requests.fulfillRequisition(request.id, { quantity, observation: '' }, context);
    await balance(item.id, 10);
  }
  await prisma.categoryConfig.create({ data: { name: 'LOCKED', sector: 'CORTE', factoryUnitId: context.factoryUnitId, defaultUnitCode: 'M²', unitLocked: true } });
  const location = await prisma.location.findFirstOrThrow({ where: { name: 'C1' } });
  await assert.rejects(executeImportTransaction(prisma, [{ rowNumber: 2, sector: 'CORTE', code: 'LOCKED-CSV', name: 'Test', unit: 'KG', type: 'LOCKED', quantity: 1, locationId: location.id, locationName: 'C1' }], context), /bloqueada/);
  assert.equal(await prisma.stockItem.count({ where: { code: 'LOCKED-CSV' } }), 0);
}));
