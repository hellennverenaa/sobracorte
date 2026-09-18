import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { reconcileExternalIdentity } = require('../scripts/reconcile-external-identity.cjs');
const disposable = Boolean(process.env.TEST_DATABASE_URL)
  && process.env.TEST_DATABASE_URL === process.env.DATABASE_URL;

test('reconciliação externa simula, recusa conflitos e preserva vínculo e auditorias em PostgreSQL', {
  skip: disposable ? false : 'exige TEST_DATABASE_URL igual a DATABASE_URL para banco descartável',
}, async () => {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  let unitId: number | undefined;
  try {
    unitId = (await client.query(`INSERT INTO sobra_corte."FactoryUnit" (code, name)
      VALUES ($1, 'Identity reconciliation test') RETURNING id`, [`REC_${randomUUID()}`])).rows[0].id;
    const legacyId = (await client.query(`INSERT INTO sobra_corte."User"
      ("factoryUnitId", usuario, nome, email, "matriculaDass", role, "updatedAt")
      VALUES ($1, 'RECONCILE.TEST', 'Test', 'test@example.invalid', 900100, 'leitor', now()) RETURNING id`, [unitId])).rows[0].id;
    const identities: number[] = [];
    const bindings: number[] = [];
    for (const [origin, providerId] of [['LEGADO', 'RECONCILE.TEST'], ['EXTERNO', '6']]) {
      const identityId = (await client.query(`INSERT INTO sobra_corte."AuthIdentity"
        ("nativeUnitId", "authOrigin", "authUserId", usuario, nome, email, "matriculaDass", "updatedAt")
        VALUES ($1, $2, $3, 'RECONCILE.TEST', 'Test', 'test@example.invalid', 900100, now()) RETURNING id`,
      [unitId, origin, providerId])).rows[0].id;
      identities.push(identityId);
      const bindingId = (await client.query(`INSERT INTO sobra_corte."UserRoleBinding"
        ("identityId", "factoryUnitId", role, "updatedAt") VALUES ($1, $2, 'leitor', now()) RETURNING id`,
      [identityId, unitId])).rows[0].id;
      bindings.push(bindingId);
      await client.query(`INSERT INTO sobra_corte."RoleChangeAudit"
        ("factoryUnitId", "userId", "bindingId", usuario, nome, "previousRole", "newRole", "changedByName")
        VALUES ($1, $2, $2, 'RECONCILE.TEST', 'Test', 'leitor', 'leitor', 'Test')`, [unitId, bindingId]);
    }
    const snapshot = async () => (await client.query(`SELECT row_to_json(b) AS binding FROM sobra_corte."UserRoleBinding" b
      WHERE "factoryUnitId" = $1 ORDER BY id`, [unitId])).rows;
    const before = await snapshot();
    const audit = async () => (await client.query(readFileSync(
      join(__dirname, '../scripts/identity-migration-audit.sql'), 'utf8'), [[]])).rows
      .filter(row => row.unit_id === unitId);
    assert.ok((await audit()).some(row => row.check_name === 'multiple_bound_identities_for_login'));
    await reconcileExternalIdentity(client, unitId, ...bindings);
    assert.deepEqual(await snapshot(), before, 'simulação não altera vínculos');
    assert.equal((await client.query(`SELECT "authOrigin" FROM sobra_corte."User" WHERE id = $1`, [legacyId])).rows[0].authOrigin, null);
    assert.equal((await client.query(`SELECT count(*) FROM sobra_corte."StockMovement" WHERE "factoryUnitId" = $1`, [unitId])).rows[0].count, '0');

    await assert.rejects(reconcileExternalIdentity(client, unitId! + 1000000, ...bindings, true));
    await assert.rejects(reconcileExternalIdentity(client, unitId, bindings[1], bindings[0], true));
    await client.query(`UPDATE sobra_corte."UserRoleBinding" SET role = 'admin' WHERE id = $1`, [bindings[1]]);
    await assert.rejects(reconcileExternalIdentity(client, unitId, ...bindings, true), /Permissões divergentes/);
    await client.query(`UPDATE sobra_corte."UserRoleBinding" SET role = 'leitor' WHERE id = $1`, [bindings[1]]);
    await client.query(`UPDATE sobra_corte."AuthIdentity" SET "matriculaDass" = 900101 WHERE id = $1`, [identities[1]]);
    await assert.rejects(reconcileExternalIdentity(client, unitId, ...bindings, true), /não correspondem/);
    await client.query(`UPDATE sobra_corte."AuthIdentity" SET "matriculaDass" = 900100 WHERE id = $1`, [identities[1]]);
    assert.deepEqual(await snapshot(), before);

    await reconcileExternalIdentity(client, unitId, ...bindings, true);
    const after = await snapshot();
    assert.equal(after.length, 1);
    assert.equal(after[0].binding.id, bindings[0]);
    assert.equal(after[0].binding.identityId, identities[1]);
    assert.equal(after[0].binding.role, 'leitor');
    const audits = (await client.query(`SELECT "userId", "bindingId" FROM sobra_corte."RoleChangeAudit"
      WHERE "factoryUnitId" = $1 ORDER BY id`, [unitId])).rows;
    assert.deepEqual(audits.map(a => a.userId), bindings);
    assert.deepEqual(audits.map(a => a.bindingId), [bindings[0], bindings[0]]);
    const legacy = (await client.query(`SELECT "authOrigin", "authUserId" FROM sobra_corte."User" WHERE id = $1`, [legacyId])).rows[0];
    assert.deepEqual(legacy, { authOrigin: 'EXTERNO', authUserId: '6' });
    assert.deepEqual(await audit(), [], 'cadastro reconciliado passa na auditoria de migração');
    assert.equal((await client.query(`SELECT count(*) FROM sobra_corte."AuthIdentity" WHERE "nativeUnitId" = $1`, [unitId])).rows[0].count, '2');
    assert.equal((await client.query(`SELECT count(*) FROM sobra_corte."StockMovement" WHERE "factoryUnitId" = $1`, [unitId])).rows[0].count, '1');
    await assert.rejects(reconcileExternalIdentity(client, unitId, ...bindings, true));
    assert.deepEqual(await snapshot(), after);
  } finally {
    if (unitId) {
      for (const table of ['RoleChangeAudit', 'StockMovement', 'UserRoleBinding', 'User']) {
        await client.query(`DELETE FROM sobra_corte."${table}" WHERE "factoryUnitId" = $1`, [unitId]);
      }
      await client.query(`DELETE FROM sobra_corte."AuthIdentity" WHERE "nativeUnitId" = $1`, [unitId]);
      await client.query(`DELETE FROM sobra_corte."FactoryUnit" WHERE id = $1`, [unitId]);
    }
    await client.end();
  }
});
