import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { prisma, prismaForInternalUse } from '../src/prisma';
import { tenantStorage } from '../src/context/tenantContext';
import { StockItemService } from '../src/services/StockItemService';
import { MountingPairService } from '../src/services/MountingPairService';
import { RequisitionService } from '../src/services/RequisitionService';
import { SettingsController } from '../src/controllers/SettingsController';
import { BatchCreateStockItemSchema } from '../src/types/stock.dto';
import { parseCsvRFC4180 } from '../src/import/csvParser';
import { validateImportBatch, planImport, executeImportTransaction } from '../src/import/materialImport';

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url) && url === process.env.DATABASE_URL
  && /^\/sobracorte_cycle7_[a-z0-9_]+$/.test(new URL(url!).pathname)
  && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname);
after(async () => { await prisma.$disconnect(); });

test('categoria controla entrada, CSV, requisição e pares em todos os setores', { skip: !enabled }, async () => {
  const unit = await prismaForInternalUse.factoryUnit.create({ data: { code: `CAT_${process.pid}_${Date.now()}`, name: 'Category rules disposable test' } });
  await tenantStorage.run({ tenantId: unit.id }, async () => {
    const context = { factoryUnitId: unit.id, role: 'admin', operatorName: 'Teste' };
    const stock = new StockItemService();
    const pairService = new MountingPairService();
    const sectors = ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'] as const;
    for (const sector of sectors) {
      const location = await prisma.location.create({ data: { factoryUnitId: unit.id, name: sector, sector, categoryMode: 'ALL' } });
      const category = await prisma.categoryConfig.create({ data: { factoryUnitId: unit.id, name: `QUANTIDADE ${sector}`, sector, defaultUnitCode: 'KG', entryMode: 'QUANTITY', unitLocked: true } });
      const base = { sector, categoryId: category.id, quantity: 1.25, location: location.name, code: `${sector}-Q`, name: 'MATERIAL', sku: `${sector}-Q`, pieceCode: `${sector}-Q`, description: 'MATERIAL', productName: 'MODELO', sizeGrade: '40', color: 'PRETO', materialColor: 'PRETO' };
      const created = await stock.createBatch(BatchCreateStockItemSchema.parse({ items: [base] }), context);
      const persisted = await prisma.stockItem.findFirstOrThrow({ where: { id: created.items[0].id } });
      assert.equal(persisted.unit, 'KG');
      assert.equal(persisted.footSide, null);
      assert.equal(persisted.type, category.name);
      assert.equal(persisted.componentType, null);
      await assert.rejects(stock.createBatch(BatchCreateStockItemSchema.parse({ items: [{ ...base, footSide: 'E' }] }), context), /sem lado/);
      await assert.rejects(stock.createBatch(BatchCreateStockItemSchema.parse({ items: [{ ...base, quantity: 1, unit: 'UN' }] }), context), /exige a unidade KG/);
      const pairedCategory = await prisma.categoryConfig.create({ data: { factoryUnitId: unit.id, name: `PARES ${sector}`, sector, defaultUnitCode: 'UN', entryMode: 'SIDE_PAIR', unitLocked: true } });
      const paired = { ...base, categoryId: pairedCategory.id, quantity: 3, code: `${sector}-P`, sku: `${sector}-P`, pieceCode: `${sector}-P`, footSide: 'PAR' };
      const pair = await stock.createBatch(BatchCreateStockItemSchema.parse({ items: [paired] }), context);
      assert.deepEqual((await prisma.stockItem.findMany({ where: { id: { in: pair.items.map(i => i.id) } }, orderBy: { id: 'asc' } })).map(i => [i.footSide, Number(i.quantity)]), [['E', 3], ['D', 3]]);
      const matches = await pairService.findMatchingPairs(unit.id, sector);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].formablePairs, 3);
      const req = await new RequisitionService().createRequisition({ items: [{ categoryId: pairedCategory.id, requestSector: sector,
        sku: sector === 'APOIO' ? undefined : paired.sku, pieceCode: sector === 'APOIO' ? paired.pieceCode : undefined,
        modelName: sector === 'CORTE' ? undefined : base.productName, description: base.name,
        type: pairedCategory.name, color: sector === 'CORTE' ? undefined : base.color,
        sizeGrade: sector === 'CORTE' ? undefined : base.sizeGrade,
        footSide: 'PAR', quantityRequested: 1, reason: 'TESTE', confirmSourceSuggestion: false }] } as any, context);
      assert.equal(req.items[0].categoryId, pairedCategory.id);
      assert.equal(req.items[0].requestUnit, 'PAR');
      const suggestions = await new RequisitionService().searchStockSuggestions({ requestSector: sector, categoryId: pairedCategory.id, query: paired.code, field: 'IDENTIFIER', footSide: 'PAR' }, unit.id);
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].footSide, 'PAR');
      let status = 200;
      let response: any;
      const res: any = { status: (value: number) => { status = value; return res; }, json: (value: any) => { response = value; return res; } };
      await new SettingsController().updateCategory({ tenant: { id: unit.id }, user: { role: 'admin' }, params: { id: String(category.id) }, body: { defaultUnitCode: 'UN', entryMode: 'SIDE_PAIR' } } as any, res);
      assert.equal(status, 400);
      assert.match(response.error, /itens vinculados/);
      assert.equal((await prisma.categoryConfig.findFirstOrThrow({ where: { id: category.id } })).entryMode, 'QUANTITY');
      // Uma categoria distinta nunca pode formar um par com a categoria atual.
      const [left, right] = pair.items;
      const wrong = await prisma.stockItem.create({ data: { factoryUnitId: unit.id, sector, categoryId: category.id, sku: 'OUTRO', quantity: 3, unit: 'UN', footSide: 'D' } });
      await assert.rejects(pairService.executeMatch({ leftStockItemId: left.id, rightStockItemId: wrong.id, quantity: 1, sector, reason: '' }, context), /categoria|mesmo produto/);
      await pairService.executeMatch({ leftStockItemId: left.id, rightStockItemId: right.id, quantity: 1, sector, reason: '' }, context);
      assert.equal(Number((await prisma.stockItem.findFirstOrThrow({ where: { id: left.id } })).quantity), 2);
    }
    const csvCategory = await prisma.categoryConfig.create({ data: { factoryUnitId: unit.id, name: 'CSV PARES', sector: 'CORTE', defaultUnitCode: 'UN', entryMode: 'SIDE_PAIR', unitLocked: true } });
    const parsed = parseCsvRFC4180('codigo;descricao;categoria;lado;quantidade;prateleira\nCSV-P;MATERIAL CSV;CSV PARES;PAR;4;CORTE');
    const locations = await prisma.location.findMany();
    const categories = await prisma.categoryConfig.findMany();
    const validated = validateImportBatch(parsed.headers, parsed.rows, 'CORTE', locations as any, categories);
    assert.equal(validated[0].categoryId, csvCategory.id);
    assert.equal(validated.length, 2);
    const plan = await planImport(prisma, validated, unit.id);
    assert.equal(plan.errors.length, 0);
    assert.equal(plan.toInsert.length, 2);
    const result = await executeImportTransaction(prisma, plan.toInsert, context);
    assert.equal(result.inserted, 2);
    assert.deepEqual((await prisma.stockItem.findMany({ where: { code: 'CSV-P' }, orderBy: { id: 'asc' } })).map(i => [i.footSide, Number(i.quantity)]), [['E', 4], ['D', 4]]);
  });
});
