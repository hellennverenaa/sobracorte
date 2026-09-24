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
    categoryConfig: { findFirst: async () => null },
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
    location: { findUnique: async () => ({ id: 1, name: 'A', sector: null }), findFirst: async () => ({ id: 1, name: 'A', sector: null }) },
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
  const create = (items: any[], factoryUnitId = 1) => service.createBatch(BatchCreateStockItemSchema.parse({ items }), { factoryUnitId, role: 'admin' });
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

  for (const pair of [
    { sector: 'PRE_FABRICADO', sku: 'PAIR-P', productName: 'MODELO', type: 'EVA', color: 'AZUL', sizeGrade: '40' },
    { sector: 'DISTRIBUICAO', sku: 'PAIR-D', productName: 'MODELO', type: 'CABEDAL', color: 'AZUL', sizeGrade: '40' },
    { sector: 'MONTAGEM', sku: 'PAIR-M', productName: 'MODELO', color: 'AZUL', sizeGrade: '40' },
  ]) {
    const input = { ...pair, footSide: 'PAR', quantity: 7, location: 'A' };
    const result = await create([input]);
    assert.equal(result.insertedCount, 2);
    const sides = records.filter(record => record.sku === pair.sku);
    assert.deepEqual(sides.map(record => record.footSide), ['E', 'D']);
    assert.deepEqual(sides.map(record => record.quantity), [7, 7]);
    const beforeDuplicate: number = records.length;
    await assert.rejects(create([{ ...input, sku: `${pair.sku}-NEW` }, input]), DuplicateStockItemError);
    assert.equal(records.length, beforeDuplicate, 'nenhum lado do lote deve persistir se houver duplicata');
  }

  const fixtures = [
    { sector: 'CORTE', code: 'C1', name: 'TECIDO', type: 'TECIDO', unit: 'M2' },
    { sector: 'PRE_FABRICADO', sku: 'P1', productName: 'MODELO', type: 'EVA', color: 'AZUL', sizeGrade: '40', footSide: 'E' },
    { sector: 'DISTRIBUICAO', sku: 'D1', productName: 'MODELO', type: 'CABEDAL', color: 'AZUL', sizeGrade: '40', footSide: 'E' },
    { sector: 'EXPEDICAO', sku: 'E1', productName: 'MODELO', type: 'CABEDAL', color: 'AZUL', sizeGrade: '40', footSide: 'E' },
    { sector: 'MONTAGEM', sku: 'M1', productName: 'MODELO', color: 'AZUL', sizeGrade: '40', footSide: 'E' },
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
    await assert.rejects(executeImportTransaction(prisma, [row], { factoryUnitId: 1, role: 'admin' }), DuplicateStockItemError);
  }
  await assert.rejects(executeImportTransaction(prisma, [{ rowNumber: 2, sector: 'APOIO', code: item.pieceCode, name: item.description, productName: item.productName, color: item.materialColor, sizeGrade: item.sizeGrade, unit: 'UND', type: 'APOIO', quantity: 1, locationId: 1, locationName: 'A' }], { factoryUnitId: 1, role: 'admin' }), DuplicateStockItemError);
  await assert.rejects(create([{ ...fixtures[2], sector: 'EXPEDICAO', quantity: 10, location: 'A' }]), DuplicateStockItemError);
  const beforeImport = records.length;
  const repeatedRow: any = { rowNumber: 2, sector: 'CORTE', code: 'CSV-NOVO', name: 'TECIDO', unit: 'M2', type: 'TECIDO', quantity: 1, locationId: 1, locationName: 'A' };
  await assert.rejects(executeImportTransaction(prisma, [repeatedRow, { ...repeatedRow, rowNumber: 3 }], { factoryUnitId: 1, role: 'admin' }), DuplicateStockItemError);
  assert.equal(records.length, beforeImport, 'repetição dentro do CSV deve reverter o lote');
  const emptyModel = { ...item, pieceCode: 'SEM-MODELO', productName: '' };
  await create([emptyModel]);
  records[records.length - 1].quantity = 0;
  await assert.rejects(create([emptyModel]), DuplicateStockItemError);
  const coloredRecord = records.find(record => record.sector === 'MONTAGEM' && record.sku === 'M1' && record.color === 'AZUL');
  coloredRecord.color = ' A Z U L ';
  await assert.rejects(create([{ ...fixtures[4], quantity: 1, location: 'A' }]), DuplicateStockItemError);

  let status: number | undefined;
  let body: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } };
  await new StockItemController().createBatch({ user: { role: 'admin' }, tenant: { id: 1 }, body: { items: [item] } } as any, res);
  assert.equal(status, 409);
  assert.match(body.error, /já existe no estoque/);
  const originalCategoryLookup = prisma.categoryConfig.findFirst;
  t.after(() => { (prisma.categoryConfig as any).findFirst = originalCategoryLookup; });
  (prisma.categoryConfig as any).findFirst = async () => ({ id: 1, name: 'TECIDO' });
  await new SettingsController().updateCategory({ tenant: { id: 1 }, user: { role: 'admin' }, params: { id: '1' }, body: { name: 'COURO' } } as any, res);
  assert.equal(status, 409);
  assert.match(body.error, /categoria criaria itens duplicados/);
});

test('transferências ficam no setor para todos os perfis, sem alterar o item nem permitir locais incompatíveis', async t => {
  let sourceSector: string | null = 'DISTRIBUICAO';
  let destinationSector: string | null = 'MONTAGEM';
  let mutations = 0;
  let balances = new Map([[1, 100], [2, 0]]);
  let movement: any;
  const source = { id: 1, factoryUnitId: 1, sector: 'DISTRIBUICAO', sku: 'SKU', productName: 'MODELO',
    unit: 'UND', type: 'CABEDAL', quantity: 100, locations: [{ locationId: 1 }] };
  const originalTransaction = prisma.$transaction;
  t.after(() => { (prisma as any).$transaction = originalTransaction; });
  const tx = {
    $queryRaw: async () => [],
    stockItem: {
      findFirst: async () => source,
      update: async () => { throw new Error('Transferência não pode alterar o item'); },
      updateMany: async () => { throw new Error('Transferência não pode baixar o saldo total'); },
      create: async () => { throw new Error('Transferência não pode criar outro item'); },
    },
    location: { findFirst: async ({ where }: any) => {
      assert.equal(where.factoryUnitId, 1);
      return { id: where.id, name: where.id === 1 ? 'ORIGEM' : 'DESTINO', sector: where.id === 1 ? sourceSector : destinationSector };
    } },
    stockItemLocation: {
      updateMany: async ({ where, data }: any) => {
        if ((balances.get(where.locationId) || 0) < where.quantity.gte) return { count: 0 };
        mutations++;
        balances.set(where.locationId, balances.get(where.locationId)! - data.quantity.decrement);
        return { count: 1 };
      },
      upsert: async ({ create }: any) => {
        assert.equal(create.stockItemId, 1);
        mutations++;
        balances.set(create.locationId, (balances.get(create.locationId) || 0) + create.quantity);
      },
    },
    stockMovement: { create: async ({ data }: any) => { mutations++; movement = data; return { id: 1, ...data }; } },
  };
  (prisma as any).$transaction = (callback: any) => callback(tx);
  const service = new StockMovementService();
  const transfer = (quantity: number, role = 'admin', overrides: any = {}) => service.createMovement({
    stockItemId: 1, sector: 'DISTRIBUICAO', type: 'TRANSFERENCIA', quantity, locationId: 1, destinationLocationId: 2,
    ...overrides,
  }, { factoryUnitId: 1, role, assignedSector: 'DISTRIBUICAO' });
  for (const role of ['admin', 'admin_setor', 'lider', 'movimentador']) {
    for (const quantity of [10, 100]) await assert.rejects(transfer(quantity, role), /outro setor/);
  }
  assert.equal(mutations, 0, 'recusa deve preceder qualquer alteração de saldo ou histórico');
  destinationSector = 'DISTRIBUICAO'; sourceSector = 'MONTAGEM';
  for (const type of ['ENTRADA', 'SAIDA', 'REFUGO', 'TRANSFERENCIA']) {
    await assert.rejects(transfer(10, 'admin', { type }), /outro setor/);
  }
  assert.equal(mutations, 0);
  sourceSector = null;
  await assert.rejects(transfer(10, 'admin_setor'), /Admin Master/);
  sourceSector = 'DISTRIBUICAO'; destinationSector = null;
  await assert.rejects(transfer(10, 'admin_setor'), /Admin Master/);
  assert.equal(mutations, 0);
  destinationSector = 'DISTRIBUICAO';
  await assert.rejects(transfer(10, 'admin', { sector: 'MONTAGEM' }), /não pertence ao setor/);
  await assert.rejects(transfer(10, 'admin', { destinationLocationId: 1 }), /devem ser diferentes/);
  for (const sector of ['DISTRIBUICAO', 'EXPEDICAO', null]) {
    destinationSector = sector;
    for (const quantity of [10, 100]) {
      balances = new Map([[1, 100], [2, 0]]);
      await transfer(quantity);
      assert.equal(source.quantity, 100);
      assert.equal(source.type, 'CABEDAL');
      assert.equal(source.sector, 'DISTRIBUICAO');
      assert.equal(balances.get(1), 100 - quantity);
      assert.equal(balances.get(2), quantity);
      assert.equal(movement.stockItemId, 1);
      assert.equal(movement.sourceStockItemId, 1);
      assert.equal(movement.destinationStockItemId, 1);
      assert.equal(movement.sourceSector, 'DISTRIBUICAO');
      assert.equal(movement.destinationSector, 'DISTRIBUICAO');
      assert.equal(movement.sourceLocationId, 1);
      assert.equal(movement.destinationLocationId, 2);
    }
  }
});

test('cadastro e importação recusam o setor retirado antes de gravar', async t => {
  const original = prisma.$transaction;
  t.after(() => { (prisma as any).$transaction = original; });
  let writes = 0;
  const tx = { $queryRaw: async () => [], location: {
    findUnique: async () => ({ id: 1, name: 'A', sector: 'MONTAGEM' }),
    findFirst: async () => ({ id: 1, name: 'A', sector: 'MONTAGEM' }),
  }, stockItem: { create: async () => { writes++; } } };
  (prisma as any).$transaction = (callback: any) => callback(tx);
  assert.equal(BatchCreateStockItemSchema.safeParse({ items: [{ sector: 'CONSUMO', productName: 'COLA', unit: 'KG', quantity: 1, location: 'A' }] }).success, false);
  await assert.rejects(executeImportTransaction(prisma, [{ sector: 'CONSUMO', locationId: 1, quantity: 1, unit: 'KG' }] as any, { factoryUnitId: 1, role: 'admin' }), /Setor inválido|outro setor/);
  assert.equal(writes, 0);
});


test('alterar o setor da localização não pode deslocar itens já alocados para outro setor', async t => {
  const originalTx = prisma.$transaction;
  const originalFind = prisma.location.findFirst;
  t.after(() => { (prisma as any).$transaction = originalTx; (prisma.location as any).findFirst = originalFind; });
  (prisma.location as any).findFirst = async () => ({ id: 1, name: 'ORIGEM', sector: 'DISTRIBUICAO' });
  let writes = 0;
  (prisma as any).$transaction = (callback: any) => callback({ $queryRaw: async () => [],
    stockItemLocation: { findMany: async () => [{ stockItem: { sector: 'DISTRIBUICAO' } }] },
    location: { update: async () => { writes++; } },
  });
  let status: number | undefined;
  const res: any = { status(value: number) { status = value; return this; }, json() {} };
  await new SettingsController().updateLocation({ tenant: { id: 1 }, user: { role: 'admin' }, params: { id: '1' }, body: { sector: 'MONTAGEM' } } as any, res);
  assert.equal(status, 400);
  assert.equal(writes, 0);
});
