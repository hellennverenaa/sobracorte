// Após build; somente clone local de aceitação. Todas as entradas são revertidas.
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.match(url.pathname, /^\/sobracorte_deploy_acceptance_[a-z0-9_]+$/);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
const { prisma, prismaForInternalUse: db } = require('../dist/src/prisma');
const { tenantStorage } = require('../dist/src/context/tenantContext');
const { StockItemService } = require('../dist/src/services/StockItemService');
const { BatchCreateStockItemSchema } = require('../dist/src/types/stock.dto');

async function main() {
  const locations = await db.location.findMany({ include: { categoryLinks: { include: { category: true } } } });
  const candidates = locations.filter(location => location.name !== location.name.toUpperCase()
    && !location.subsectorId && location.categoryLinks.some(link => link.category.entryMode === 'QUANTITY'
      && (link.category.sector === 'CORTE' || link.category.sectors.includes('CORTE'))));
  assert.ok(candidates.length, 'Clone precisa conter localizações legadas com categorias de Corte');
  let entries = 0;
  const rollback = new Error('Rollback obrigatório da aceitação legada');
  for (const location of candidates) {
    const category = location.categoryLinks.find(link => link.category.entryMode === 'QUANTITY'
      && (link.category.sector === 'CORTE' || link.category.sectors.includes('CORTE'))).category;
    await tenantStorage.run({ tenantId: location.factoryUnitId }, async () => {
      await assert.rejects(db.$transaction(async tx => {
        const original = prisma.$transaction;
        prisma.$transaction = async callback => callback(tx);
        try {
          const origin = await tx.originConfig.findFirst({ where: { factoryUnitId: location.factoryUnitId,
            OR: [{ sector: 'CORTE' }, { sector: null }] }, orderBy: { id: 'asc' } });
          for (const name of [location.name, location.name.toUpperCase()]) {
            const marker = `__LEGACY_ACCEPT_${process.pid}_${entries}`;
            const result = await new StockItemService().createBatch(BatchCreateStockItemSchema.parse({ items: [{
              sector: 'CORTE', categoryId: category.id, code: marker, name: marker,
              quantity: 1, location: name, ...(origin ? { origem: origin.name.toUpperCase() } : {}),
            }] }), { factoryUnitId: location.factoryUnitId, role: 'admin', operatorName: 'ACEITAÇÃO LEGADA' });
            const allocations = await tx.stockItemLocation.findMany({ where: { stockItemId: result.items[0].id } });
            assert.equal(allocations.length, 1);
            assert.equal(allocations[0].locationId, location.id);
            entries++;
          }
        } finally { prisma.$transaction = original; }
        throw rollback;
      }, { timeout: 30000 }), error => error === rollback);
    });
  }
  assert.equal(await db.stockItem.count({ where: { code: { startsWith: `__LEGACY_ACCEPT_${process.pid}_` } } }), 0);
  console.log(JSON.stringify({ locations: candidates.length, entries, rollback: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); await prisma.$disconnect(); });
