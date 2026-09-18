// Run after npm run build, only against the isolated acceptance database.
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.match(url.pathname, /^\/sobracorte_(deploy_acceptance|cycle6)_[a-z0-9_]+$/);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
const jwt = require('jsonwebtoken');
const { createApp } = require('../dist/src/app');
const { prismaForInternalUse: db, pool } = require('../dist/src/prisma');
const { loadServerConfig } = require('../dist/src/config/dotenv');

async function main() {
  const operators = await db.userRoleBinding.findMany({
    where: { role: 'admin' },
    include: { factoryUnit: true, identity: true },
  });
  const operator = operators.find(binding => binding.factoryUnitId === binding.identity.nativeUnitId && binding.factoryUnit.active);
  assert.ok(operator, 'The acceptance copy must contain an administrator for authenticated read checks');
  const token = jwt.sign({ usuario: operator.identity.usuario, nome: operator.identity.nome,
    unidade: operator.factoryUnit.code,
    origem: operator.identity.authOrigin, authUserId: operator.identity.authUserId,
    ...(operator.identity.matriculaDass ? { matricula: operator.identity.matriculaDass.toString() } : {}) },
  process.env.PRIVATE_KEY, { expiresIn: '5m' });
  const app = createApp(loadServerConfig());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const path of ['/health/ready', '/factory-unit/current', '/inventory/search?limit=5',
      '/settings/categories', '/settings/locations', '/settings/units', '/settings/origins',
      '/dashboard/summary', '/inventory/search?sector=CORTE', '/inventory/search?sector=MONTAGEM', '/inventory/search?sector=CONSUMO',
      '/inventory/movements/history', '/requisitions', '/users', '/users/audit',
      '/reports/inventory', '/reports/movements', '/reports/requisitions']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Dass-Unit': operator.factoryUnit.code },
        signal: AbortSignal.timeout(15000),
      });
      await response.text();
      const expected = path === '/requisitions' && !operator.factoryUnit.enableRequisitions ? 403 : 200;
      assert.equal(response.status, expected, `${path}: HTTP ${response.status}`);
      console.log(`${path}: ${expected}`);
    }
    for (const path of ['/materials', '/movements', '/stats', '/reports/data']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
      await response.text();
      assert.equal(response.status, 404, `${path}: legacy API must be absent`);
    }
    const rollback = new Error('Acceptance transaction rollback');
    await assert.rejects(db.$transaction(async tx => {
      const location = await tx.location.create({ data: {
        factoryUnitId: operator.factoryUnitId, name: '__UPGRADE_ACCEPTANCE__', sector: 'CORTE',
      } });
      const material = await tx.stockItem.create({ data: {
        factoryUnitId: operator.factoryUnitId, code: '__UPGRADE_ACCEPTANCE__',
        sector: 'CORTE', componentType: 'MATERIA_PRIMA',
        name: 'UPGRADE ACCEPTANCE', unit: 'M²', type: 'TECIDO', quantity: 1,
      } });
      await tx.stockItemLocation.create({ data: { factoryUnitId: operator.factoryUnitId,
        stockItemId: material.id, locationId: location.id, quantity: 1 } });
      await tx.stockMovement.create({ data: { factoryUnitId: operator.factoryUnitId,
        stockItemId: material.id, sector: 'CORTE', type: 'ENTRADA', quantity: 1,
        destinationLocationId: location.id, destinationLocationName: location.name,
        itemCode: material.code, itemName: material.name, itemUnit: material.unit,
        origem: 'UPGRADE ACCEPTANCE' } });
      for (const type of ['CRIACAO_CONFIGURACAO', 'EDICAO_CONFIGURACAO', 'EXCLUSAO_CONFIGURACAO']) {
        await tx.stockMovement.create({ data: {
          factoryUnitId: operator.factoryUnitId, sector: 'CONFIGURACOES', type,
          quantity: 0, operatorName: 'UPGRADE ACCEPTANCE',
        } });
      }
      await tx.roleChangeAudit.create({ data: { factoryUnitId: operator.factoryUnitId,
        userId: operator.id, bindingId: operator.id,
        usuario: operator.identity.usuario, nome: operator.identity.nome,
        previousRole: 'leitor', newRole: 'lider', previousSector: 'CORTE', newSector: 'CORTE',
        changedByName: 'UPGRADE ACCEPTANCE' } });
      await tx.materialRequisition.create({ data: { factoryUnitId: operator.factoryUnitId,
        code: '__UPGRADE_ACCEPTANCE__', requestSector: 'MONTAGEM', description: 'ACCEPTANCE',
        quantityRequested: 1, reason: 'ACCEPTANCE' } });
      throw rollback;
    }), error => error === rollback);
    await assert.rejects(db.$transaction(async tx => {
      await tx.stockMovement.create({ data: {
        factoryUnitId: operator.factoryUnitId, sector: 'CORTE', type: 'ENTRADA', quantity: 0,
      } });
    }), error => error.code === 'P2004' || error.cause?.originalCode === '23514');
    console.log('Canonical stock, location balance, movement, role audit and requisition writes passed and rolled back.');
    console.log('Zero quantities accepted for configuration audits and rejected for stock entries.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; })
  // Both application clients share this pool; close it exactly once.
  .finally(async () => { await pool.end(); });
