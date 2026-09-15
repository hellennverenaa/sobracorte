// Read-only acceptance check: DATABASE_URL is the restored production source.
// Usage: node tests/verify-production-upgrade.cjs <isolated-migrated-database>
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { readdirSync } = require('node:fs');
require('dotenv').config({ quiet: true });

async function main() {
  const sourceUrl = new URL(process.env.DATABASE_URL);
  const targetName = process.argv[2];
  assert.match(targetName || '', /^sobracorte_[a-z0-9_]+$/);
  assert.notEqual(sourceUrl.pathname, `/${targetName}`);
  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = `/${targetName}`;
  const source = new Client({ connectionString: sourceUrl.toString() });
  const target = new Client({ connectionString: targetUrl.toString() });
  try {
    await source.connect();
    await target.connect();
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await target.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const sourceQueries = {
      Material: `SELECT m.*, c.name AS type, u.symbol AS unit
        FROM sobra_corte."Material" m
        JOIN sobra_corte."CategoryConfig" c ON c.id=m."categoryId" AND c."factoryUnitId"=m."factoryUnitId"
        JOIN sobra_corte."UnitConfig" u ON u.id=m."unitId" AND u."factoryUnitId"=m."factoryUnitId"`,
      Movement: `SELECT m.*, COALESCE(m."originName", o.name) AS origem
        FROM sobra_corte."Movement" m LEFT JOIN sobra_corte."OriginConfig" o
        ON o.id=m."originId" AND o."factoryUnitId"=m."factoryUnitId"`,
    };
    const ignored = { Material: ['categoryId', 'unitId'], Movement: ['originId', 'originName', 'locationId'] };
    const tableKeys = {
      FactoryUnit: ['id'], Material: ['id'], Movement: ['id'], User: ['id'],
      MaterialLocation: ['materialId', 'locationId'], LocationCategory: ['locationId', 'categoryId'],
      CategoryConfig: ['id'], Location: ['id'], UnitConfig: ['id'], OriginConfig: ['id'],
      MaterialDeletionAudit: ['id'], RoleChangeAudit: ['id'],
    };
    for (const [table, keys] of Object.entries(tableKeys)) {
      const original = (await source.query(sourceQueries[table] || `SELECT * FROM sobra_corte."${table}"`)).rows;
      const migrated = (await target.query(`SELECT * FROM sobra_corte."${table}"`)).rows;
      const key = row => JSON.stringify(keys.map(k => row[k]));
      const byKey = new Map(migrated.map(row => [key(row), row]));
      if (sourceQueries[table]) {
        const count = (await source.query(`SELECT count(*) FROM sobra_corte."${table}"`)).rows[0].count;
        assert.equal(original.length, Number(count), `${table}: unresolved source references`);
      }
      for (const before of original) {
        const after = byKey.get(key(before));
        assert.ok(after, `${table}: original row missing`);
        for (const column of ignored[table] || []) delete before[column];
        const projection = Object.fromEntries(Object.keys(before).map(column => [column, after[column]]));
        // Print no production row contents if an assertion fails.
        assert.ok(JSON.stringify(before) === JSON.stringify(projection), `${table}: original values changed`);
      }
      if (['Material', 'Movement', 'User', 'MaterialLocation', 'MaterialDeletionAudit', 'RoleChangeAudit'].includes(table)) {
        assert.equal(migrated.length, original.length, `${table}: unexpected row count`);
      }
      console.log(`${table}: ${original.length} original rows preserved`);
    }
    const units = (await target.query('SELECT code FROM sobra_corte."FactoryUnit"')).rows.map(row => row.code);
    assert.ok(units.includes('SAJ') && !units.includes('STJ'), 'SAJ must not be duplicated as STJ');
    for (const table of ['StockItem', 'StockItemLocation', 'StockMovement', 'MaterialRequisition']) {
      assert.equal(Number((await target.query(`SELECT count(*) FROM sobra_corte."${table}"`)).rows[0].count), 0);
    }
    for (const client of [source, target]) {
      const failures = await client.query('SELECT count(*) FROM sobra_corte._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL');
      assert.equal(Number(failures.rows[0].count), 0, 'Unresolved migration failure');
    }
    const applied = new Set((await target.query('SELECT migration_name FROM sobra_corte._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows.map(row => row.migration_name));
    const local = readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
    for (const name of local) assert.ok(applied.has(name), `Pending migration: ${name}`);
    for (const name of applied) assert.ok(local.includes(name), `Missing historical file: ${name}`);
    console.log('Acceptance passed: data preserved, SAJ preserved, no pending or failed migrations.');
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
