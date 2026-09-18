import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url) && url === process.env.DATABASE_URL && /^\/sobracorte_cycle7_[a-z0-9_]+$/.test(new URL(url!).pathname) && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname);
const migration = readFileSync('prisma/migrations/20260918120000_fixed_unit_catalog/migration.sql', 'utf8').replace(/^BEGIN;\n/, '').replace(/COMMIT;\s*$/, '').replaceAll('sobra_corte.', 'unit_catalog_test.');

test('migration preserva quantidades e históricos e bloqueia inconsistências', { skip: !enabled }, async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const invalid of ['configuredUnknown', 'unknown', 'fraction', 'minStock', 'location', 'legacyConflict', 'legacyUnknown', 'lockedWithoutUnit', null]) {
      await client.query('BEGIN');
      try {
        await client.query(`CREATE SCHEMA unit_catalog_test;
          CREATE TABLE unit_catalog_test."UnitConfig" (id int PRIMARY KEY, symbol text, "factoryUnitId" int);
          CREATE TABLE unit_catalog_test."CategoryConfig" (id int PRIMARY KEY, "defaultUnitId" int, "factoryUnitId" int, "unitLock" text, "unitLocked" bool);
          CREATE TABLE unit_catalog_test."StockItem" (id int PRIMARY KEY, unit text, sector text, quantity numeric(18,3), "minStock" numeric(18,3));
          CREATE TABLE unit_catalog_test."StockItemLocation" ("stockItemId" int, quantity numeric(18,3));
          CREATE TABLE unit_catalog_test."StockMovement" (id int PRIMARY KEY, "itemUnit" text, quantity numeric(18,3));
          INSERT INTO unit_catalog_test."UnitConfig" VALUES (1,'m2',1);
          INSERT INTO unit_catalog_test."CategoryConfig" VALUES (1,1,1,'m2',false), (2,NULL,1,'m',false);
          INSERT INTO unit_catalog_test."StockItem" VALUES (1,'UND','APOIO',2,0), (2,'m2','CORTE',1.01,0.001);
          INSERT INTO unit_catalog_test."StockItemLocation" VALUES (1,2),(2,1.01);
          INSERT INTO unit_catalog_test."StockMovement" VALUES (1,'UND',2);`);
        if (invalid === 'configuredUnknown') await client.query(`INSERT INTO unit_catalog_test."UnitConfig" VALUES (3,'FOLHA',1)`);
        if (invalid === 'unknown') await client.query(`UPDATE unit_catalog_test."StockItem" SET unit='FOLHA' WHERE id=1`);
        if (invalid === 'fraction') await client.query(`UPDATE unit_catalog_test."StockItem" SET quantity=1.01 WHERE id=1`);
        if (invalid === 'minStock') await client.query(`UPDATE unit_catalog_test."StockItem" SET "minStock"=1.01 WHERE id=1`);
        if (invalid === 'location') await client.query(`UPDATE unit_catalog_test."StockItemLocation" SET quantity=1.01 WHERE "stockItemId"=1`);
        if (invalid === 'legacyConflict') await client.query(`UPDATE unit_catalog_test."CategoryConfig" SET "unitLock"='m' WHERE id=1`);
        if (invalid === 'legacyUnknown') await client.query(`UPDATE unit_catalog_test."CategoryConfig" SET "unitLock"='foo' WHERE id=1`);
        if (invalid === 'lockedWithoutUnit') await client.query(`UPDATE unit_catalog_test."CategoryConfig" SET "unitLock"='livre', "unitLocked"=true, "defaultUnitId"=NULL WHERE id=1`);
        if (invalid) await assert.rejects(client.query(migration), /inconsistências/);
        else {
          await client.query(migration);
          assert.deepEqual((await client.query(`SELECT unit,quantity,"minStock" FROM unit_catalog_test."StockItem" ORDER BY id`)).rows, [{unit:'UN',quantity:'2.000',minStock:'0.000'},{unit:'M²',quantity:'1.010',minStock:'0.001'}]);
          assert.deepEqual((await client.query(`SELECT "defaultUnitCode","unitLocked" FROM unit_catalog_test."CategoryConfig" ORDER BY id`)).rows, [{defaultUnitCode:'M²',unitLocked:true},{defaultUnitCode:'M',unitLocked:true}]);
          assert.equal((await client.query(`SELECT "itemUnit" FROM unit_catalog_test."StockMovement"`)).rows[0].itemUnit, 'UND');
          assert.equal((await client.query(`SELECT to_regclass('unit_catalog_test."UnitConfig"') AS value`)).rows[0].value, null);
        }
      } finally { await client.query('ROLLBACK'); }
    }
  } finally { await client.end(); }
});
