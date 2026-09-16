import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { MountingPairService } from '../src/services/MountingPairService';
import { RequisitionService } from '../src/services/RequisitionService';
import { debitStockItem } from '../src/services/stockDebit';
import { assertCompatiblePair, findRequisitionStock } from '../src/services/requisitionStock';

const item = (id = 1, footSide = 'E', quantity = 131): any => ({ id, factoryUnitId: 1, sector: 'MONTAGEM', sku: 'SKU', productName: 'MODELO', color: 'AZUL', sizeGrade: '40', footSide, type: 'CABEDAL', unit: 'UND', quantity,
  locations: [{ locationId: 1, quantity: quantity - 43, location: { name: 'A' } }, { locationId: 2, quantity: 43, location: { name: 'B' } }] });
const matches = (record: any, where: any): boolean => Object.entries(where).every(([key, value]: any) => {
  if (key === 'AND') return value.every((part: any) => matches(record, part));
  if (value?.in) return value.in.includes(record[key]);
  if (value?.mode) return String(record[key] || '').toUpperCase() === value.equals;
  return record[key] === value;
});

test('baixa multilateral, rollback e operações concorrentes preservam saldo e pendência', async t => {
  let records = [item(), item(2, 'D', 134)];
  let movements: any[] = [];
  let req: any = { id: 'REQ', factoryUnitId: 1, code: 'REQ', requestSector: 'MONTAGEM', sku: 'SKU', modelName: 'MODELO', description: 'CALÇADO COMPLETO', color: 'AZUL', sizeGrade: '40', footSide: 'E', quantityRequested: 10, quantityFulfilled: 0, status: 'PENDENTE' };
  let tail = Promise.resolve();
  const original = prisma.$transaction;
  t.after(() => { (prisma as any).$transaction = original; });
  (prisma as any).$transaction = async (callback: any) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    let locked = false;
    let snapshot: string;
    const tx: any = {
      $queryRaw: async () => { await previous; locked = true; snapshot = JSON.stringify({ records, movements, req }); return []; },
      stockItem: {
        findFirst: async ({ where }: any) => { assert.ok(locked, 'bloqueio deve preceder a leitura'); return structuredClone(records.find(row => matches(row, where))); },
        findMany: async ({ where }: any) => { assert.ok(locked); return structuredClone(records.filter(row => matches(row, where))); },
        updateMany: async ({ where, data }: any) => {
          const row = records.find(row => row.id === where.id && row.factoryUnitId === where.factoryUnitId && row.quantity >= Number(where.quantity.gte));
          if (!row) return { count: 0 };
          row.quantity -= Number(data.quantity.decrement); return { count: 1 };
        },
      },
      stockItemLocation: { updateMany: async ({ where, data }: any) => {
        const link = records.find(row => row.id === where.stockItemId)?.locations.find((link: any) => link.locationId === where.locationId && link.quantity >= Number(where.quantity.gte));
        if (!link) return { count: 0 };
        link.quantity -= Number(data.quantity.decrement); return { count: 1 };
      } },
      stockMovement: { create: async ({ data }: any) => { movements.push(data); return data; } },
      materialRequisition: {
        findFirst: async () => { assert.ok(locked); return structuredClone(req); },
        update: async ({ where, data }: any) => {
          assert.equal(req.status, where.status);
          assert.equal(req.quantityFulfilled, Number(where.quantityFulfilled));
          if (data.quantityFulfilled) req.quantityFulfilled += Number(data.quantityFulfilled.increment);
          req.status = data.status; return structuredClone(req);
        },
      },
    };
    try { return await callback(tx); }
    catch (error) { if (locked) ({ records, movements, req } = JSON.parse(snapshot!)); throw error; }
    finally { release(); }
  };
  const context: any = { factoryUnitId: 1, role: 'admin' };
  const match = () => new MountingPairService().executeMatch({ sector: 'MONTAGEM', leftStockItemId: 1, rightStockItemId: 2, quantity: 100, reason: '' }, context);
  const result = await Promise.allSettled([match(), match()]);
  assert.equal(result.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(records[0].quantity, 31);
  assert.equal(records[0].locations.reduce((sum: number, row: any) => sum + row.quantity, 0), 31);
  assert.equal(movements.length, 4);
  assert.equal(movements.reduce((sum, row) => sum + Number(row.quantity), 0), 200);
  records = [item(), item(2, 'D', 50)]; movements = [];
  await assert.rejects(match(), /Saldo insuficiente/);
  assert.equal(records[0].quantity, 131, 'falha no segundo pé deve reverter o primeiro');
  assert.equal(movements.length, 0);
  const service = new RequisitionService();
  const fulfill = (quantity: number, locationId?: number) => service.fulfillRequisition('REQ', { quantity, locationId } as any, context);
  await assert.rejects(fulfill(10, 999), /não contém/);
  assert.equal(records[0].quantity, 131);
  const fulfilled = await Promise.allSettled([fulfill(7), fulfill(7)]);
  assert.equal(fulfilled.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(req.quantityFulfilled, 7);
  assert.equal(records[0].quantity, 124);
  await assert.rejects(service.cancelRequisition('REQ', context), /pendentes/);
  req = { ...req, status: 'PENDENTE', quantityFulfilled: 0 };
  await service.cancelRequisition('REQ', context);
  await assert.rejects(fulfill(1), /pendentes/);
});

test('seleção exata respeita APOIO, grade, cor, SKU e modelo; pares incompatíveis são recusados', async () => {
  const record = { ...item(), sector: 'APOIO', pieceCode: 'SKU', description: 'LINGUETA', materialColor: 'AZUL+BRANCO', footSide: null };
  const rows = [record, { ...record, id: 2, pieceCode: 'OUTRO' }, { ...record, id: 3, sizeGrade: '41' }];
  const tx: any = { stockItem: { findMany: async ({ where }: any) => rows.filter(row => matches(row, where)) } };
  const req: any = { requestSector: 'APOIO', sku: 'SKU', modelName: 'MODELO', description: 'LINGUETA', color: ' azul + branco ', sizeGrade: '40' };
  assert.deepEqual((await findRequisitionStock(tx, 1, req)).map(row => row.id), [1]);
  assert.equal((await findRequisitionStock(tx, 1, { ...req, color: 'AZULBRANCO' })).length, 0);
  assert.throws(() => assertCompatiblePair(item(), { ...item(2, 'D'), productName: 'OUTRO' }), /mesmo produto/);
  assert.throws(() => assertCompatiblePair(item(), { ...item(2, 'D'), type: 'OUTRO' }), /mesmo produto/);
  let written = false;
  const bad = { ...item(), quantity: 132 };
  await assert.rejects(debitStockItem({ stockItem: { updateMany: async () => { written = true; } } } as any, bad, 1), /diverge/);
  assert.equal(written, false);
  await assert.rejects(debitStockItem({} as any, item(), 100, 1), /Saldo insuficiente/);
  await assert.rejects(debitStockItem({} as any, item(), 0.5), /Quantidade inválida/);
});
