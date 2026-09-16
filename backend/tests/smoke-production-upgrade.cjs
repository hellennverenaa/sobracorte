// Run after npm run build, only against the isolated acceptance database.
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.match(url.pathname, /^\/sobracorte_deploy_acceptance_[a-z0-9_]+$/);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
const jwt = require('jsonwebtoken');
const { createApp } = require('../dist/src/app');
const { prismaForInternalUse: db, pool } = require('../dist/src/prisma');
const { loadServerConfig } = require('../dist/src/config/dotenv');

async function main() {
  const operator = await db.userRoleBinding.findFirst({
    where: { role: 'admin' },
    include: { factoryUnit: true, identity: true },
  });
  assert.ok(operator, 'The acceptance copy must contain an administrator for authenticated read checks');
  const token = jwt.sign({ usuario: operator.identity.usuario, nome: operator.identity.nome,
    unidade: operator.factoryUnit.code,
    ...(operator.identity.matriculaDass ? { matricula: Number(operator.identity.matriculaDass) } : {}) },
  process.env.PRIVATE_KEY, { expiresIn: '5m' });
  const app = createApp(loadServerConfig());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const path of ['/health/ready', '/factory-unit/current', '/materials?_limit=5',
      '/settings/categories', '/settings/locations', '/settings/units', '/settings/origins',
      '/dashboard/summary', '/inventory/search?sector=CORTE', '/inventory/search?sector=MONTAGEM',
      '/inventory/movements/history', '/requisitions', '/users', '/users/audit',
      '/reports/inventory', '/reports/movements']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Dass-Unit': operator.factoryUnit.code },
        signal: AbortSignal.timeout(15000),
      });
      await response.text();
      assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
      console.log(`${path}: 200`);
    }
    const rollback = new Error('Acceptance transaction rollback');
    await assert.rejects(db.$transaction(async tx => {
      const material = await tx.material.create({ data: {
        factoryUnitId: operator.factoryUnitId, code: '__UPGRADE_ACCEPTANCE__',
        name: 'UPGRADE ACCEPTANCE', unit: 'm²', type: 'TECIDO',
      } });
      assert.equal(material.quantity.toString(), '0');
      await tx.movement.create({ data: { factoryUnitId: operator.factoryUnitId,
        materialId: material.id, type: 'entrada', quantity: 1, origem: 'UPGRADE ACCEPTANCE' } });
      await tx.roleChangeAudit.create({ data: { factoryUnitId: operator.factoryUnitId,
        userId: operator.id, bindingId: operator.id,
        usuario: operator.identity.usuario, nome: operator.identity.nome,
        previousRole: 'leitor', newRole: 'lider', previousSector: 'CORTE', newSector: 'CORTE',
        changedByName: 'UPGRADE ACCEPTANCE' } });
      const stock = await tx.stockItem.create({ data: { factoryUnitId: operator.factoryUnitId,
        sector: 'MONTAGEM', sku: '__UPGRADE_ACCEPTANCE__', footSide: 'E', quantity: 1 } });
      await tx.stockMovement.create({ data: { factoryUnitId: operator.factoryUnitId,
        stockItemId: stock.id, sector: 'MONTAGEM', type: 'ENTRADA', quantity: 1 } });
      await tx.materialRequisition.create({ data: { factoryUnitId: operator.factoryUnitId,
        code: '__UPGRADE_ACCEPTANCE__', requestSector: 'MONTAGEM', description: 'ACCEPTANCE',
        quantityRequested: 1, reason: 'ACCEPTANCE' } });
      throw rollback;
    }), error => error === rollback);
    console.log('Material, movement, role audit, multi-sector stock and requisition writes passed and rolled back.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; })
  // Both application clients share this pool; close it exactly once.
  .finally(async () => { await pool.end(); });
