import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { StockItemService, DuplicateStockItemError } from '../src/services/StockItemService';
import { StockItemController } from '../src/controllers/StockItemController';
import { BatchCreateStockItemSchema } from '../src/types/stock.dto';

test('cadastro de Apoio rejeita identidade repetida e permite campos diferentes', async t => {
  const records: any[] = [];
  let locked = false;
  const tx = {
    $queryRaw: async () => { locked = true; return [{ id: 1 }]; },
    stockItem: {
      findFirst: async ({ where }: any) => {
        assert.equal(locked, true);
        return records.find(record => record.factoryUnitId === where.factoryUnitId &&
          ['sector', 'pieceCode', 'description', 'materialColor', 'sizeGrade'].every(key => record[key] === where[key]) &&
          (where.OR ? !record.productName : record.productName === where.productName)) || null;
      },
      create: async ({ data }: any) => {
        const record = { id: records.length + 1, ...data };
        records.push(record);
        return record;
      },
    },
    location: { findUnique: async () => ({ id: 1, name: 'A' }) },
    stockItemLocation: { create: async () => ({}) },
    stockMovement: { create: async () => ({}) },
  };
  const originalTransaction = prisma.$transaction;
  t.after(() => { (prisma as any).$transaction = originalTransaction; });
  (prisma as any).$transaction = async (callback: any) => {
    const count = records.length;
    locked = false;
    try { return await callback(tx); }
    catch (error) { records.splice(count); throw error; }
  };
  const item = { sector: 'APOIO', pieceCode: '121212', productName: 'RACER SPEEDZONE', description: 'LINGUETA', materialColor: 'SINTETICO', sizeGrade: '40', quantity: 100, location: 'A' };
  const service = new StockItemService();
  const create = (items: any[], factoryUnitId = 1) => service.createBatch(BatchCreateStockItemSchema.parse({ items }), { factoryUnitId });
  await create([item]);
  await assert.rejects(create([{ ...item, description: ' lingueta ', quantity: 11, location: 'B' }]), DuplicateStockItemError);
  assert.equal(records.length, 1);
  for (const key of ['pieceCode', 'productName', 'description', 'materialColor', 'sizeGrade']) {
    await create([{ ...item, [key]: 'DIFERENTE' }]);
  }
  await create([item], 2);
  const count = records.length;
  await assert.rejects(create([{ ...item, pieceCode: 'NOVO' }, { ...item, pieceCode: 'NOVO' }]), DuplicateStockItemError);
  assert.equal(records.length, count, 'lote duplicado deve ser revertido integralmente');

  let status;
  let body;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } };
  await new StockItemController().createBatch({ tenant: { id: 1 }, body: { items: [item] } } as any, res);
  assert.equal(status, 409);
  assert.match(body.error, /já existe no estoque/);
});
