import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { run } = require('../scripts/stock-unification.cjs');
const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl) && databaseUrl === process.env.DATABASE_URL
  && /^\/sobracorte_cycle6_[a-z0-9_]+$/.test(new URL(databaseUrl!).pathname)
  && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl!).hostname);

test('backfill, gates e checkpoint protegem migração real entre duas unidades', {
  skip: enabled ? false : 'exige banco descartável sobracorte_cycle6_* e TEST_DATABASE_URL igual a DATABASE_URL',
}, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const sql = (name: string) => readFileSync(path.resolve('scripts', name), 'utf8');
  try {
    // O teste é destrutivo somente em seu banco descartável explicitamente nomeado.
    await client.query('TRUNCATE sobra_corte."StockMigrationCheckpoint", sobra_corte."StockMovement", sobra_corte."StockItemLocation", sobra_corte."StockItem", sobra_corte."MaterialRequisition" CASCADE');
    await client.query(sql('fixtures/stock-unification.sql'));
    await assert.rejects(run(client, 'integrity'), /Falta evidência/);
    await run(client, 'backfill');
    const before = (await client.query('SELECT * FROM sobra_corte."StockItem" ORDER BY id')).rows;
    await run(client, 'backfill');
    assert.deepEqual((await client.query('SELECT * FROM sobra_corte."StockItem" ORDER BY id')).rows, before);
    assert.equal((await client.query('SELECT "cutoverAt" FROM sobra_corte."StockMigrationCheckpoint"')).rows[0].cutoverAt, null);
    await run(client, 'reconcile');
    await run(client, 'integrity');

    const item = before.find(row => row.code === 'C3-MAT-A');
    assert.ok(item);
    await client.query('BEGIN');
    await client.query('UPDATE sobra_corte."StockItem" SET quantity = quantity WHERE id = $1', [item.id]);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT "cutoverAt" FROM sobra_corte."StockMigrationCheckpoint"')).rows[0].cutoverAt, null);
    const links = (await client.query('SELECT * FROM sobra_corte."StockItemLocation" WHERE "stockItemId" = $1 ORDER BY "locationId"', [item.id])).rows;
    assert.equal(links.length, 2);
    assert.equal(links.reduce((sum, row) => sum + Number(row.quantity), 0), 12.5);
    assert.equal((await client.query('SELECT count(*) FROM sobra_corte."StockMovement" WHERE "stockItemId" IS NULL AND "legacyMovementId" IS NOT NULL')).rows[0].count, '1');

    await client.query('BEGIN');
    await client.query('UPDATE sobra_corte."StockItem" SET quantity = quantity - 1 WHERE id = $1', [item.id]);
    await client.query('UPDATE sobra_corte."StockItemLocation" SET quantity = quantity - 1 WHERE "stockItemId" = $1 AND "locationId" = $2', [item.id, links[0].locationId]);
    await client.query('COMMIT');
    assert.ok((await client.query('SELECT "cutoverAt" FROM sobra_corte."StockMigrationCheckpoint"')).rows[0].cutoverAt);
    await run(client, 'integrity');
    await assert.rejects(run(client, 'reconcile'), /pré-cutover recusada/);
    await assert.rejects(run(client, 'backfill'), /gravações canônicas/);
    assert.equal(Number((await client.query('SELECT quantity FROM sobra_corte."StockItem" WHERE id = $1', [item.id])).rows[0].quantity), 11.5);

    // Um item novo é legítimo após cutover, mas saldo/localização divergente não é.
    const fresh = (await client.query(`INSERT INTO sobra_corte."StockItem" ("factoryUnitId", sector, code, name, quantity, "updatedAt")
      VALUES ($1, 'CORTE', 'NEW', 'NOVO', 0, now()) RETURNING id`, [item.factoryUnitId])).rows[0];
    await run(client, 'integrity');
    await client.query('UPDATE sobra_corte."StockItem" SET quantity = 1 WHERE id = $1', [fresh.id]);
    await assert.rejects(run(client, 'integrity'), /Gate reprovado/);
    assert.throws(() => execFileSync(process.execPath, ['scripts/stock-unification.cjs', 'integrity'], {
      env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe',
    }), (error: any) => error.status === 1);
    await client.query('UPDATE sobra_corte."StockItem" SET quantity = 0 WHERE id = $1', [fresh.id]);

    const foreign = before.find(row => row.code === 'C3-MAT-B');
    const badMovement = (await client.query(`INSERT INTO sobra_corte."StockMovement" ("factoryUnitId", "stockItemId", sector, type, quantity)
      VALUES ($1, $2, 'CORTE', 'ENTRADA', 1) RETURNING id`, [item.factoryUnitId, foreign.id])).rows[0];
    await assert.rejects(run(client, 'integrity'), /Gate reprovado/);
    await client.query('DELETE FROM sobra_corte."StockMovement" WHERE id = $1', [badMovement.id]);
    await client.query('UPDATE sobra_corte."StockMovement" SET "itemUnit" = \'WRONG\' WHERE reason = \'fixture-c3-related\'');
    await assert.rejects(run(client, 'integrity'), /Gate reprovado/);
    await client.query('UPDATE sobra_corte."StockMovement" SET "itemUnit" = \'M²\' WHERE reason = \'fixture-c3-related\'');

    const aliasLocation = (await client.query(`INSERT INTO sobra_corte."Location" (name, sector, "factoryUnitId")
      VALUES ('C6-ALIAS', 'DISTRIBUICAO', $1) ON CONFLICT ("factoryUnitId", name) DO UPDATE SET sector = EXCLUDED.sector RETURNING id`, [item.factoryUnitId])).rows[0];
    const aliasItem = (await client.query(`INSERT INTO sobra_corte."StockItem" ("factoryUnitId", sector, sku, quantity, "updatedAt")
      VALUES ($1, 'EXPEDICAO', 'ALIAS', 1, now()) RETURNING id`, [item.factoryUnitId])).rows[0];
    await client.query(`INSERT INTO sobra_corte."StockItemLocation" ("stockItemId", "locationId", "factoryUnitId", quantity)
      VALUES ($1, $2, $3, 1)`, [aliasItem.id, aliasLocation.id, item.factoryUnitId]);
    await run(client, 'integrity');

    await client.query('UPDATE sobra_corte."Movement" SET reason = reason || \' altered\' WHERE reason = \'fixture-c3-related\'');
    await assert.rejects(run(client, 'integrity'), /legado mudou/);
    await client.query('UPDATE sobra_corte."Movement" SET reason = \'fixture-c3-related\' WHERE reason = \'fixture-c3-related altered\'');
    await run(client, 'integrity');

    // Falha tardia deve reverter também os inserts anteriores do backfill.
    await client.query('TRUNCATE sobra_corte."StockMigrationCheckpoint", sobra_corte."StockMovement", sobra_corte."StockItemLocation", sobra_corte."StockItem" CASCADE');
    await client.query('UPDATE sobra_corte."MaterialLocation" SET quantity = quantity + 1 WHERE "materialId" = $1 AND "locationId" = $2', [item.legacyMaterialId, links[0].locationId]);
    await assert.rejects(run(client, 'backfill'), /Gate reprovado/);
    assert.equal((await client.query('SELECT count(*) FROM sobra_corte."StockItem"')).rows[0].count, '0');
    assert.equal((await client.query('SELECT count(*) FROM sobra_corte."StockMovement"')).rows[0].count, '0');
    assert.equal((await client.query('SELECT count(*) FROM sobra_corte."StockMigrationCheckpoint"')).rows[0].count, '0');
    await client.query('UPDATE sobra_corte."MaterialLocation" SET quantity = quantity - 1 WHERE "materialId" = $1 AND "locationId" = $2', [item.legacyMaterialId, links[0].locationId]);
    await run(client, 'backfill');

    // Exclusão após cutover mantém o histórico migrado, mesmo com FK nula.
    const deleted = (await client.query('SELECT id FROM sobra_corte."StockItem" WHERE code = \'C3-MAT-A\'')).rows[0];
    await client.query('DELETE FROM sobra_corte."StockItem" WHERE id = $1', [deleted.id]);
    await run(client, 'integrity');

    // Campos não preenchidos da expansão histórica permanecem desconhecidos.
    assert.ok((await client.query('SELECT "itemModelName", "itemColor" FROM sobra_corte."StockMovement"')).rows.every(row => row.itemModelName === null && row.itemColor === null));
  } finally { await client.end(); }
});

test('seed repetido preserva SAJ e auditoria bloqueia transição incompleta de identidade', {
  skip: enabled ? false : 'exige banco descartável sobracorte_cycle6_* e TEST_DATABASE_URL igual a DATABASE_URL',
}, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const { seedFactoryUnits } = await import('../prisma/seed');
  const { prismaForInternalUse } = await import('../src/prisma');
  try {
    await seedFactoryUnits();
    const saj = (await client.query('SELECT id FROM sobra_corte."FactoryUnit" WHERE code = \'SAJ\'')).rows[0];
    const count = (await client.query('SELECT count(*) FROM sobra_corte."UnitConfig"')).rows[0].count;
    await seedFactoryUnits();
    assert.equal((await client.query('SELECT id FROM sobra_corte."FactoryUnit" WHERE code = \'SAJ\'')).rows[0].id, saj.id);
    assert.equal((await client.query('SELECT count(*) FROM sobra_corte."FactoryUnit" WHERE code = \'STJ\'')).rows[0].count, '0');
    assert.equal((await client.query('SELECT count(*) FROM sobra_corte."UnitConfig"')).rows[0].count, count);

    const migration = readFileSync(path.resolve('prisma/migrations/20260916140000_separate_identity_and_local_rbac/migration.sql'), 'utf8');
    // A tabela de conflitos não é exposta no Prisma; reproduzir seu DDL original
    // somente quando o schema descartável foi gerado sem o histórico completo.
    if (!(await client.query("SELECT to_regclass('sobra_corte.\"IdentityMigrationConflict\"') AS table_name")).rows[0].table_name) {
      const ddl = migration.match(/CREATE TABLE "sobra_corte"\."IdentityMigrationConflict"[\s\S]*?;/);
      assert.ok(ddl);
      await client.query(ddl[0]);
    }
    const unit = (await client.query('SELECT id FROM sobra_corte."FactoryUnit" WHERE code = \'C3A\'')).rows[0].id;
    const user = (await client.query(`INSERT INTO sobra_corte."User" ("factoryUnitId", usuario, nome, email, role, "assignedSector", "authOrigin", "authUserId", "updatedAt")
      VALUES ($1, 'MIGRATION.TEST', 'Sintético', 'test@example.invalid', 'lider', 'CORTE', 'LEGADO', 'migration-test', now()) RETURNING id`, [unit])).rows[0];
    await assert.rejects(run(client, 'identity-audit'), /Transição de identidade pendente/);
    // Executa o backfill de identidade original, sem recriar suas tabelas.
    await client.query(migration.slice(migration.indexOf('INSERT INTO "sobra_corte"."IdentityMigrationConflict"')));
    await run(client, 'identity-audit');
    const binding = (await client.query(`SELECT b.* FROM sobra_corte."UserRoleBinding" b JOIN sobra_corte."AuthIdentity" i
      ON i.id = b."identityId" WHERE i."authUserId" = 'migration-test' AND b."factoryUnitId" = $1`, [unit])).rows[0];
    assert.equal(binding.role, 'lider');
    assert.equal(binding.assignedSector, 'CORTE');
    await client.query('UPDATE sobra_corte."UserRoleBinding" SET role = \'movimentador\' WHERE id = $1', [binding.id]);
    await assert.rejects(run(client, 'identity-audit'), /Transição de identidade pendente/);
    await client.query(`INSERT INTO sobra_corte."RoleChangeAudit" ("userId", "bindingId", usuario, nome, "previousRole", "newRole", "previousSector", "newSector", "changedByName", "factoryUnitId")
      VALUES ($1, $2, 'MIGRATION.TEST', 'Sintético', 'lider', 'movimentador', 'CORTE', 'CORTE', 'Teste', $3)`, [user.id, binding.id, unit]);
    await run(client, 'identity-audit');
    const globalUser = (await client.query(`INSERT INTO sobra_corte."User" ("factoryUnitId", usuario, nome, email, "matriculaDass", "authOrigin", "authUserId", "updatedAt")
      VALUES ($1, 'GLOBAL.TEST', 'Sintético', 'test@example.invalid', 888, 'LEGADO', 'global-test', now()) RETURNING id`, [unit])).rows[0];
    await client.query(migration.slice(migration.indexOf('INSERT INTO "sobra_corte"."IdentityMigrationConflict"')));
    const globalIdentity = (await client.query('SELECT id FROM sobra_corte."AuthIdentity" WHERE "nativeUnitId" = $1 AND "authUserId" = \'global-test\'', [unit])).rows[0];
    await client.query('DELETE FROM sobra_corte."UserRoleBinding" WHERE "identityId" = $1', [globalIdentity.id]);
    const admins = process.env.GLOBAL_ADMIN_IDENTITIES;
    try {
      process.env.GLOBAL_ADMIN_IDENTITIES = 'C3A:000888';
      await run(client, 'identity-audit');
      process.env.GLOBAL_ADMIN_IDENTITIES = '';
      await assert.rejects(run(client, 'identity-audit'), /Transição de identidade pendente/);
    } finally {
      if (admins === undefined) delete process.env.GLOBAL_ADMIN_IDENTITIES;
      else process.env.GLOBAL_ADMIN_IDENTITIES = admins;
      await client.query('DELETE FROM sobra_corte."AuthIdentity" WHERE id = $1', [globalIdentity.id]);
      await client.query('DELETE FROM sobra_corte."User" WHERE id = $1', [globalUser.id]);
    }
    await client.query(`INSERT INTO sobra_corte."User" ("factoryUnitId", usuario, nome, email, "updatedAt")
      VALUES ($1, 'AMBIGUOUS.TEST', 'Sintético', 'test@example.invalid', now()),
             ($1, 'AMBIGUOUS.TEST', 'Sintético', 'test@example.invalid', now())`, [unit]);
    await assert.rejects(run(client, 'identity-audit'), /Transição de identidade pendente/);
    await client.query('DELETE FROM sobra_corte."User" WHERE usuario = \'AMBIGUOUS.TEST\' AND "factoryUnitId" = $1', [unit]);
    await client.query('DELETE FROM sobra_corte."RoleChangeAudit" WHERE "bindingId" = $1', [binding.id]);
    await client.query('DELETE FROM sobra_corte."AuthIdentity" WHERE id = $1', [binding.identityId]);
    await client.query('DELETE FROM sobra_corte."User" WHERE id = $1', [user.id]);
  } finally {
    await client.end();
    await prismaForInternalUse.$disconnect();
  }
});

test('smoke atual usa identidade estável e estoque canônico, revertendo suas gravações', {
  skip: enabled ? false : 'exige banco descartável sobracorte_cycle6_* e build prévio do backend',
}, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  let identityId: number | undefined;
  try {
    const unit = (await client.query('SELECT id FROM sobra_corte."FactoryUnit" WHERE code = \'C3A\'')).rows[0].id;
    identityId = (await client.query(`INSERT INTO sobra_corte."AuthIdentity" ("nativeUnitId", "authOrigin", "authUserId", usuario, nome, email, "matriculaDass", "updatedAt")
      VALUES ($1, 'EXTERNO', 'smoke-provider-id', 'SMOKE.TEST', 'Sintético', 'test@example.invalid', 99999, now()) RETURNING id`, [unit])).rows[0].id;
    await client.query(`INSERT INTO sobra_corte."UserRoleBinding" ("factoryUnitId", "identityId", role, "updatedAt")
      VALUES ($1, $2, 'admin', now())`, [unit, identityId]);
    const checkpoint = (await client.query('SELECT * FROM sobra_corte."StockMigrationCheckpoint"')).rows;
    const output = execFileSync(process.execPath, ['tests/smoke-production-upgrade.cjs'], {
      env: { ...process.env, DATABASE_URL: databaseUrl, PRIVATE_KEY: 'cycle6-smoke-only',
        GLOBAL_ADMIN_IDENTITIES: '', PORT: '3333', CORS_ORIGINS: 'http://localhost:3000' },
      encoding: 'utf8', timeout: 30000,
    });
    assert.match(output, /Canonical stock.*passed and rolled back/);
    assert.match(output, /inventory\/search\?sector=CONSUMO: 200/);
    assert.deepEqual((await client.query('SELECT * FROM sobra_corte."StockMigrationCheckpoint"')).rows, checkpoint);
    assert.equal((await client.query('SELECT count(*) FROM sobra_corte."StockItem" WHERE code = \'__UPGRADE_ACCEPTANCE__\'')).rows[0].count, '0');
    assert.equal((await client.query('SELECT count(*) FROM sobra_corte."Location" WHERE name = \'__UPGRADE_ACCEPTANCE__\'')).rows[0].count, '0');
  } finally {
    if (identityId) await client.query('DELETE FROM sobra_corte."AuthIdentity" WHERE id = $1', [identityId]);
    await client.end();
  }
});
