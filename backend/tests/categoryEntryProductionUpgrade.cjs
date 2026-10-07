// Executar após build, exclusivamente em um clone local de aceitação migrado.
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.match(url.pathname, /^\/sobracorte_deploy_acceptance_[a-z0-9_]+$/);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
const { prisma, prismaForInternalUse: db, pool } = require('../dist/src/prisma');
const { tenantStorage } = require('../dist/src/context/tenantContext');
const { StockItemService } = require('../dist/src/services/StockItemService');
const { MountingPairService } = require('../dist/src/services/MountingPairService');
const { RequisitionService } = require('../dist/src/services/RequisitionService');
const { BatchCreateStockItemSchema } = require('../dist/src/types/stock.dto');

async function main() {
  const units = await db.factoryUnit.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
  const results = [];
  for (const unit of units) {
    await tenantStorage.run({ tenantId: unit.id }, async () => {
      const context = { factoryUnitId: unit.id, role: 'admin', operatorName: 'UPGRADE VALIDATION' };
      const stock = new StockItemService();
      const pairs = new MountingPairService();
      const requisitions = new RequisitionService();
      const distribution = await db.stockItem.findMany({ where: { factoryUnitId: unit.id,
        sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] } }, include: { category: true } });
      for (const item of distribution) {
        assert.ok(item.category, `Distribuição: item ${item.id} sem categoria`);
        assert.equal(item.category.name, item.type);
        assert.equal(item.category.defaultUnitCode, item.unit);
        assert.equal(item.category.entryMode, 'SIDE_PAIR');
      }
      const inventory = await stock.searchUnified({ sector: 'DISTRIBUICAO', limit: 200 }, context);
      assert.equal(inventory.pagination.total, distribution.length);
      const matches = await pairs.findMatchingPairs(unit.id, 'DISTRIBUICAO', '', context);
      for (const pair of matches) {
        assert.ok(pair.categoryId);
        assert.ok(pair.categoryName);
        assert.ok(pair.formablePairs > 0);
      }
      const historicalRequests = await db.materialRequisition.findMany({ where: { factoryUnitId: unit.id } });
      for (const req of historicalRequests) {
        await requisitions.checkStockAvailability(req, unit.id, prisma, context);
      }
      // Cada categoria usada por Cabedal e Sola Processada permanece disponível para novas requisições.
      for (const type of ['CABEDAL', 'SOLA_PROCESSADA']) {
        const item = distribution.find(item => item.type === type && Number(item.quantity) > 0);
        if (!item) continue;
        const offered = await requisitions.checkStockAvailability({ requestSector: 'DISTRIBUICAO',
          categoryId: item.categoryId, sku: item.sku, modelName: item.productName,
          description: item.description || item.productName || item.name || type,
          type, color: item.color, sizeGrade: item.sizeGrade, footSide: item.footSide }, unit.id, prisma, context);
        assert.ok(offered.candidates.some(candidate => candidate.sourceStockItemIds.includes(item.id)), `${unit.code}: ${type} deixou de ser oferecido`);
      }
      results.push({ unit: unit.code, distributionItems: distribution.length,
        matchingCombinations: matches.length, historicalRequests: historicalRequests.length });
    });
  }
  const unit = units[0];
  assert.ok(unit);
  const rollback = new Error('Rollback da validação de categorias');
  await tenantStorage.run({ tenantId: unit.id }, async () => {
    await assert.rejects(db.$transaction(async tx => {
      const originalTransaction = prisma.$transaction;
      const originalQuery = prisma.$queryRaw;
      // Os serviços reais usam a mesma transação de ensaio; nenhuma escrita é persistida.
      prisma.$transaction = async callback => callback(tx);
      prisma.$queryRaw = (...args) => tx.$queryRaw(...args);
      try {
        const context = { factoryUnitId: unit.id, role: 'admin', operatorName: 'UPGRADE VALIDATION' };
        const stock = new StockItemService();
        const pairs = new MountingPairService();
        for (const sector of ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM']) {
          const marker = `__VALIDATE_${process.pid}_${sector}`;
          const location = await tx.location.create({ data: { factoryUnitId: unit.id, name: marker, sector, categoryMode: 'ALL' } });
          const category = await tx.categoryConfig.create({ data: { factoryUnitId: unit.id,
            name: marker, sector, sectors: [sector], defaultUnitCode: 'UN', entryMode: 'SIDE_PAIR', unitLocked: true } });
          const base = { sector, categoryId: category.id, code: marker, sku: marker, pieceCode: marker,
            name: marker, description: marker, productName: marker, sizeGrade: '40', color: 'PRETO',
            materialColor: 'PRETO', quantity: 3, footSide: 'PAR', location: location.name };
          const created = await stock.createBatch(BatchCreateStockItemSchema.parse({ items: [base] }), context);
          const items = await tx.stockItem.findMany({ where: { id: { in: created.items.map(item => item.id) } }, orderBy: { id: 'asc' } });
          assert.deepEqual(items.map(item => [item.footSide, Number(item.quantity)]), [['E', 3], ['D', 3]]);
          const matches = await pairs.findMatchingPairs(unit.id, sector, marker, context);
          assert.equal(matches.length, 1);
          const req = await new RequisitionService().createRequisition({ items: [{ categoryId: category.id,
            requestSector: sector, sku: sector === 'APOIO' ? undefined : marker,
            pieceCode: sector === 'APOIO' ? marker : undefined, description: marker,
            type: marker, modelName: sector === 'CORTE' ? undefined : marker,
            color: sector === 'CORTE' ? undefined : 'PRETO', sizeGrade: sector === 'CORTE' ? undefined : '40',
            footSide: 'PAR', quantityRequested: 1, reason: 'VALIDATION', confirmSourceSuggestion: false }] }, context);
          assert.equal(req.items[0].categoryId, category.id);
          assert.equal(req.items[0].requestUnit, 'PAR');
          await pairs.executeMatch({ leftStockItemId: matches[0].leftFootStockItemId,
            rightStockItemId: matches[0].rightFootStockItemId, quantity: 1, sector, reason: 'VALIDATION' }, context);
          assert.equal(Number((await tx.stockItem.findUnique({ where: { id: items[0].id } })).quantity), 2);
          await assert.rejects(stock.createBatch(BatchCreateStockItemSchema.parse({ items: [{ ...base, footSide: undefined }] }), context), /Selecione esquerdo/);
          console.log(`${sector}: entrada PAR, requisição PAR, casamento e rejeição sem lado passaram`);
        }
        const fractionalMarker = `__VALIDATE_FRACTION_${process.pid}`;
        const fractionalCategory = await tx.categoryConfig.create({ data: { factoryUnitId: unit.id,
          name: fractionalMarker, sector: 'CORTE', sectors: ['CORTE'], defaultUnitCode: 'M²', entryMode: 'QUANTITY' } });
        const fractionalLocation = await tx.location.create({ data: { factoryUnitId: unit.id,
          name: fractionalMarker, sector: 'CORTE', categoryMode: 'ALL' } });
        const fractionalStock = await stock.createBatch(BatchCreateStockItemSchema.parse({ items: [{
          sector: 'CORTE', categoryId: fractionalCategory.id, code: fractionalMarker, name: fractionalMarker,
          quantity: 1.5, location: fractionalLocation.name,
        }] }), context);
        const legacy = await tx.materialRequisition.create({ data: { factoryUnitId: unit.id,
          code: fractionalMarker, requestSector: 'CORTE', sku: fractionalMarker, description: fractionalMarker,
          quantityRequested: 1.5, reason: 'VALIDATION', categoryId: null, requestUnit: null } });
        await new RequisitionService().fulfillRequisition(legacy.id, { quantity: 0.5 }, context);
        assert.equal(Number((await tx.stockItem.findUnique({ where: { id: fractionalStock.items[0].id } })).quantity), 1);
        console.log('CORTE: atendimento fracionado de requisição histórica sem requestUnit passou');
      } finally {
        prisma.$transaction = originalTransaction;
        prisma.$queryRaw = originalQuery;
      }
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  });
  console.log(JSON.stringify({ historicalFlows: results, writeTestsRolledBack: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
