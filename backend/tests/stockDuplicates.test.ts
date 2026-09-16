import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { StockItemService, DuplicateStockItemError } from '../src/services/StockItemService';
import { StockItemController } from '../src/controllers/StockItemController';
import { BatchCreateStockItemSchema } from '../src/types/stock.dto';
import { executeImportTransaction } from '../src/import/materialImport';
import { stockIdentity } from '../src/services/stockIdentity';
import { StockMovementService } from '../src/services/StockMovementService';
import { SettingsController } from '../src/controllers/SettingsController';

test('cadastros e importações em todos os setores bloqueiam duplicatas e preservam variantes', async t => {
  const records: any[] = [];
  let locked = false;
  const tx = {
    $queryRaw: async () => { locked = true; return [{ id: 1 }]; },
    stockItem: {
      findMany: async ({ where }: any) => {
        assert.equal(locked, true);
        const matches = (record: any, filter: any): boolean => Object.entries(filter).every(([key, value]: any) => {
          if (key === 'AND') return value.every((part: any) => matches(record, part));
          if (key === 'OR') return value.some((part: any) => matches(record, part));
          if (value?.in) return value.in.includes(record[key]);
          if (value?.mode) return String(record[key] || '').toUpperCase() === value.equals;
          return (record[key] ?? null) === value;
        });
        return records.filter(record => matches(record, where));
      },
      create: async ({ data }: any) => {
        const record = { id: records.length + 1, ...data };
        records.push(record);
        return record;
      },
    },
    location: { findUnique: async () => ({ id: 1, name: 'A' }) },
    stockItemLocation: { create: async () => ({}), upsert: async () => ({}) },
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

  const fixtures = [
    { sector: 'CORTE', code: 'C1', name: 'TECIDO', type: 'TECIDO', unit: 'M2' },
    { sector: 'PRE_FABRICADO', sku: 'P1', productName: 'MODELO', type: 'EVA', color: 'AZUL', sizeGrade: '40', footSide: 'E' },
    { sector: 'DISTRIBUICAO', sku: 'D1', productName: 'MODELO', type: 'CABEDAL', color: 'AZUL', sizeGrade: '40', footSide: 'E' },
    { sector: 'EXPEDICAO', sku: 'E1', productName: 'MODELO', type: 'CABEDAL', color: 'AZUL', sizeGrade: '40', footSide: 'E' },
    { sector: 'MONTAGEM', sku: 'M1', productName: 'MODELO', color: 'AZUL', sizeGrade: '40', footSide: 'E' },
    { sector: 'CONSUMO', sku: 'I1', productName: 'INSUMO', unit: 'KG' },
  ];
  for (const fixture of fixtures) {
    const input = { ...fixture, quantity: 10, location: 'A' };
    await create([input]);
    await assert.rejects(create([{ ...input, quantity: 20, location: 'B' }]), DuplicateStockItemError);
    for (const field of Object.keys(stockIdentity(fixture))) {
      const different = { ...input, [field]: field === 'footSide' ? 'D' : field === 'type' ? (fixture.sector === 'CORTE' ? 'COURO' : fixture.sector === 'PRE_FABRICADO' ? 'BORRACHA' : 'SOLA_PROCESSADA') : `DIFERENTE_${fixture.sector}` };
      await create([different]);
    }
    const row: any = { ...fixture, rowNumber: 2, code: 'code' in fixture ? fixture.code : fixture.sku, name: 'name' in fixture ? fixture.name : fixture.productName, unit: fixture.unit || 'UND', type: fixture.type || fixture.sector, quantity: 10, locationId: 1, locationName: 'A' };
    await assert.rejects(executeImportTransaction(prisma, [row], { factoryUnitId: 1 }), DuplicateStockItemError);
  }
  await assert.rejects(executeImportTransaction(prisma, [{ rowNumber: 2, sector: 'APOIO', code: item.pieceCode, name: item.description, productName: item.productName, color: item.materialColor, sizeGrade: item.sizeGrade, unit: 'UND', type: 'APOIO', quantity: 1, locationId: 1, locationName: 'A' }], { factoryUnitId: 1 }), DuplicateStockItemError);
  await assert.rejects(create([{ ...fixtures[2], sector: 'EXPEDICAO', quantity: 10, location: 'A' }]), DuplicateStockItemError);
  const beforeImport = records.length;
  const repeatedRow: any = { rowNumber: 2, sector: 'CORTE', code: 'CSV-NOVO', name: 'TECIDO', unit: 'M2', type: 'TECIDO', quantity: 1, locationId: 1, locationName: 'A' };
  await assert.rejects(executeImportTransaction(prisma, [repeatedRow, { ...repeatedRow, rowNumber: 3 }], { factoryUnitId: 1 }), DuplicateStockItemError);
  assert.equal(records.length, beforeImport, 'repetição dentro do CSV deve reverter o lote');
  const emptyModel = { ...item, pieceCode: 'SEM-MODELO', productName: '' };
  await create([emptyModel]);
  records[records.length - 1].quantity = 0;
  await assert.rejects(create([emptyModel]), DuplicateStockItemError);
  const coloredRecord = records.find(record => record.sector === 'MONTAGEM' && record.sku === 'M1' && record.color === 'AZUL');
  coloredRecord.color = ' A Z U L ';
  await assert.rejects(create([{ ...fixtures[4], quantity: 1, location: 'A' }]), DuplicateStockItemError);

  let status;
  let body;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } };
  await new StockItemController().createBatch({ tenant: { id: 1 }, body: { items: [item] } } as any, res);
  assert.equal(status, 409);
  assert.match(body.error, /já existe no estoque/);
  const originalCategoryLookup = prisma.categoryConfig.findFirst;
  t.after(() => { (prisma.categoryConfig as any).findFirst = originalCategoryLookup; });
  (prisma.categoryConfig as any).findFirst = async () => ({ id: 1, name: 'TECIDO' });
  await new SettingsController().updateCategory({ tenant: { id: 1 }, user: { role: 'admin' }, params: { id: '1' }, body: { name: 'COURO' } } as any, res);
  assert.equal(status, 409);
  assert.match(body.error, /categoria criaria itens duplicados/);
});

test('transferências totais e parciais reutilizam o equivalente e recusam destinos ambíguos', async t => {
  let source: any;
  let destination: any;
  let destinationBalance = 20;
  let ambiguous = false;
  let compatible = true;
  let movement: any;
  let destinationLocationBalance = 20;
  const originalTransaction = prisma.$transaction;
  t.after(() => { (prisma as any).$transaction = originalTransaction; });
  const tx = {
    $queryRaw: async () => [],
    stockItem: {
      findFirst: async () => source,
      findMany: async () => ambiguous ? [destination, { ...destination, id: 3 }] : [destination],
      updateMany: async ({ data }: any) => { source.quantity -= data.quantity.decrement; return { count: 1 }; },
      update: async ({ data }: any) => { destinationBalance += data.quantity.increment; return destination; },
      create: async () => { throw new Error('Não deve criar outro item no destino'); },
    },
    location: { findFirst: async ({ where }: any) => ({ id: where.id, name: where.id === 1 ? 'ORIGEM' : 'DESTINO', sector: where.id === 1 ? 'DISTRIBUICAO' : 'MONTAGEM' }) },
    stockItemLocation: {
      updateMany: async () => ({ count: 1 }),
      upsert: async ({ create }: any) => {
        assert.equal(create.stockItemId, 2);
        destinationLocationBalance += create.quantity;
      },
    },
    stockMovement: { create: async ({ data }: any) => { movement = data; return { id: 1, ...data }; } },
  };
  (prisma as any).$transaction = async (callback: any) => callback(tx);
  const reset = () => {
    source = { id: 1, factoryUnitId: 1, sector: 'DISTRIBUICAO', sku: 'SKU', productName: 'MODELO', color: 'AZUL', sizeGrade: '40', footSide: 'E', type: 'CABEDAL', unit: 'UND', quantity: 100, locations: [{ locationId: 1 }] };
    destination = { ...source, id: 2, sector: 'MONTAGEM', unit: compatible ? 'UND' : 'KG' };
  };
  const transfer = (quantity: number) => new StockMovementService().createMovement({ stockItemId: 1, type: 'TRANSFERENCIA', quantity, locationId: 1, destinationLocationId: 2, origem: '', reason: '' }, { factoryUnitId: 1, role: 'admin' });
  for (const quantity of [10, 100]) {
    reset();
    const previous = destinationBalance;
    const previousLocation = destinationLocationBalance;
    await transfer(quantity);
    assert.equal(source.quantity, 100 - quantity);
    assert.equal(destinationBalance, previous + quantity);
    assert.equal(destinationLocationBalance, previousLocation + quantity);
    assert.equal(movement.stockItemId, 2);
    assert.equal(movement.sourceLocationId, 1);
    assert.equal(movement.destinationLocationId, 2);
  }
  ambiguous = true;
  reset();
  await assert.rejects(transfer(10), /duplicados no setor de destino/);
  ambiguous = false;
  compatible = false;
  reset();
  await assert.rejects(transfer(10), /unidade de medida incompatível/);
  reset();
  source.sku = null;
  await assert.rejects(transfer(10), /campos de identificação necessários/);
});
