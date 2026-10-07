import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url) && url === process.env.DATABASE_URL
  && /^\/sobracorte_cycle7_[a-z0-9_]+$/.test(new URL(url!).pathname)
  && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname);
const isolatedSql = (path: string) => readFileSync(path, 'utf8')
  .replace(/^BEGIN;$/m, '').replace(/COMMIT;\s*$/, '').replaceAll('sobra_corte.', 'category_recovery_test.');
const repair = isolatedSql('scripts/repair-category-entry-legacy.sql');
const migration = isolatedSql('prisma/migrations/20261007120000_category_entry_rules/migration.sql');

test('correção pontual permite migrar legado sem classificação e recusa estado divergente', { skip: !enabled }, async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const scenario of ['valid', 'changedItem', 'existingCategory']) {
      await client.query('BEGIN');
      try {
        await client.query(`CREATE SCHEMA category_recovery_test;
          CREATE TYPE category_recovery_test."SectorType" AS ENUM ('CORTE','APOIO','PRE_FABRICADO','DISTRIBUICAO','EXPEDICAO','MONTAGEM');
          CREATE TABLE category_recovery_test."FactoryUnit" (id int PRIMARY KEY);
          INSERT INTO category_recovery_test."FactoryUnit" VALUES (1),(2);
          CREATE TABLE category_recovery_test."CategoryConfig" (id serial PRIMARY KEY, "factoryUnitId" int, name text, sector category_recovery_test."SectorType", sectors category_recovery_test."SectorType"[] DEFAULT '{}', "componentType" text, "defaultUnitCode" text, "unitLocked" bool);
          CREATE TABLE category_recovery_test."StockItem" (id int PRIMARY KEY, "factoryUnitId" int, "categoryId" int, type text, sector category_recovery_test."SectorType", unit text, "footSide" text, code text, quantity numeric, "minStock" numeric DEFAULT 0, "componentType" text DEFAULT 'MATERIA_PRIMA');
          CREATE UNIQUE INDEX "StockItem_factoryUnitId_code_key" ON category_recovery_test."StockItem" ("factoryUnitId",code);
          CREATE TABLE category_recovery_test."MaterialRequisition" (id int PRIMARY KEY, quantity numeric);
          INSERT INTO category_recovery_test."MaterialRequisition" VALUES (1,1);
          CREATE TABLE category_recovery_test."StockMovement" (id int PRIMARY KEY, quantity numeric);
          INSERT INTO category_recovery_test."StockMovement" VALUES (1,112);
          INSERT INTO category_recovery_test."StockItem" (id,"factoryUnitId",sector,unit,quantity,"footSide","componentType") VALUES
            (4581,2,'APOIO','UN',112,NULL,'PECA_CORTADA'),
            (4582,1,'MONTAGEM','UN',0,'E','PE_PRONTO'),
            (4583,1,'MONTAGEM','UN',0,'D','PE_PRONTO');`);
        if (scenario === 'changedItem') await client.query(`UPDATE category_recovery_test."StockItem" SET "categoryId"=99 WHERE id=4581`);
        if (scenario === 'existingCategory') await client.query(`INSERT INTO category_recovery_test."CategoryConfig" (name,"factoryUnitId") VALUES ('PE PRONTO',1)`);
        if (scenario !== 'valid') {
          await assert.rejects(client.query(repair), /estado auditado|já existe/);
        } else {
          await client.query(repair);
          await client.query(migration);
          assert.deepEqual((await client.query(`SELECT name,"factoryUnitId","defaultUnitCode","entryMode" FROM category_recovery_test."CategoryConfig" ORDER BY id`)).rows,
            [{ name: 'MOLDE / PEÇA', factoryUnitId: 2, defaultUnitCode: 'UN', entryMode: 'QUANTITY' }, { name: 'PE PRONTO', factoryUnitId: 1, defaultUnitCode: 'UN', entryMode: 'SIDE_PAIR' }]);
          assert.deepEqual((await client.query(`SELECT type,quantity,"footSide" FROM category_recovery_test."StockItem" ORDER BY id`)).rows,
            [{ type: 'MOLDE / PEÇA', quantity: '112', footSide: null }, { type: 'PE PRONTO', quantity: '0', footSide: 'E' }, { type: 'PE PRONTO', quantity: '0', footSide: 'D' }]);
          assert.equal((await client.query(`SELECT quantity FROM category_recovery_test."StockMovement"`)).rows[0].quantity, '112');
          assert.equal((await client.query(`SELECT quantity FROM category_recovery_test."MaterialRequisition"`)).rows[0].quantity, '1');
        }
      } finally { await client.query('ROLLBACK'); }
    }
  } finally { await client.end(); }
});
