import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url) && url === process.env.DATABASE_URL
  && /^\/sobracorte_cycle7_[a-z0-9_]+$/.test(new URL(url!).pathname)
  && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname);
const migration = readFileSync('prisma/migrations/20261007120000_category_entry_rules/migration.sql', 'utf8')
  .replace(/^BEGIN;\n/, '').replace(/COMMIT;\s*$/, '').replaceAll('sobra_corte.', 'category_entry_test.');

test('migração de categorias preserva saldos e histórico, associa legado e bloqueia ambiguidades', { skip: !enabled }, async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const scenario of ['valid', 'mixedUnit', 'mixedSide', 'missingCategory', 'storedPair']) {
      await client.query('BEGIN');
      try {
        await client.query(`CREATE SCHEMA category_entry_test;
          CREATE TYPE category_entry_test."SectorType" AS ENUM ('CORTE','APOIO','PRE_FABRICADO','DISTRIBUICAO','EXPEDICAO','MONTAGEM');
          CREATE TABLE category_entry_test."CategoryConfig" (id int PRIMARY KEY, "factoryUnitId" int, name text, sector category_entry_test."SectorType", sectors category_entry_test."SectorType"[] DEFAULT '{}', "componentType" text, "defaultUnitCode" text, "unitLocked" bool);
          CREATE TABLE category_entry_test."StockItem" (id int PRIMARY KEY, "factoryUnitId" int, "categoryId" int, type text, sector category_entry_test."SectorType", unit text, "footSide" text, code text, quantity numeric, "minStock" numeric DEFAULT 0, "componentType" text DEFAULT 'MATERIA_PRIMA');
          CREATE UNIQUE INDEX "StockItem_factoryUnitId_code_key" ON category_entry_test."StockItem" ("factoryUnitId",code);
          CREATE TABLE category_entry_test."MaterialRequisition" (id int PRIMARY KEY, quantity numeric, "itemUnit" text);
          CREATE TABLE category_entry_test."StockMovement" (id int PRIMARY KEY, quantity numeric, "itemUnit" text);
          INSERT INTO category_entry_test."CategoryConfig" VALUES (1,1,'TECIDO','CORTE','{}','MATERIA_PRIMA','UN',false),(2,1,'SOLADO','PRE_FABRICADO','{}','SOLADO','UN',false);
          INSERT INTO category_entry_test."StockItem" VALUES (1,1,NULL,'TECIDO','CORTE','M2',NULL,'C1',1.25,0,'MATERIA_PRIMA'),(2,1,2,'SOLADO','PRE_FABRICADO','UN','E',NULL,3,0,'SOLADO'),(3,1,2,'SOLADO','PRE_FABRICADO','UN','D',NULL,3,0,'SOLADO');
          INSERT INTO category_entry_test."MaterialRequisition" VALUES (1,2,'PAR');
          INSERT INTO category_entry_test."StockMovement" VALUES (1,1.25,'M2');`);
        if (scenario === 'mixedUnit') await client.query(`UPDATE category_entry_test."StockItem" SET unit='KG' WHERE id=3`);
        if (scenario === 'mixedSide') await client.query(`UPDATE category_entry_test."StockItem" SET "footSide"=NULL WHERE id=3`);
        if (scenario === 'missingCategory') await client.query(`UPDATE category_entry_test."StockItem" SET type='DESCONHECIDO' WHERE id=1`);
        if (scenario === 'storedPair') await client.query(`UPDATE category_entry_test."StockItem" SET "footSide"='PAR' WHERE id=3`);
        if (scenario !== 'valid') {
          await assert.rejects(client.query(migration), /ambíguos|inequívoca/);
        } else {
          await client.query(migration);
          assert.deepEqual((await client.query(`SELECT "defaultUnitCode", "entryMode" FROM category_entry_test."CategoryConfig" ORDER BY id`)).rows,
            [{ defaultUnitCode: 'M²', entryMode: 'QUANTITY' }, { defaultUnitCode: 'UN', entryMode: 'SIDE_PAIR' }]);
          assert.deepEqual((await client.query(`SELECT "categoryId",quantity,unit FROM category_entry_test."StockItem" ORDER BY id`)).rows,
            [{ categoryId: 1, quantity: '1.25', unit: 'M2' }, { categoryId: 2, quantity: '3', unit: 'UN' }, { categoryId: 2, quantity: '3', unit: 'UN' }]);
          assert.deepEqual((await client.query(`SELECT * FROM category_entry_test."MaterialRequisition"`)).rows,
            [{ id: 1, quantity: '2', itemUnit: 'PAR', categoryId: null }]);
          assert.deepEqual((await client.query(`SELECT * FROM category_entry_test."StockMovement"`)).rows,
            [{ id: 1, quantity: '1.25', itemUnit: 'M2' }]);
          await client.query(`INSERT INTO category_entry_test."StockItem" VALUES (4,1,2,'SOLADO','PRE_FABRICADO','UN','E','PAIR',1,0,NULL),(5,1,2,'SOLADO','PRE_FABRICADO','UN','D','PAIR',1,0,NULL)`);
          await assert.rejects(client.query(`INSERT INTO category_entry_test."StockItem" VALUES (6,1,1,'TECIDO','CORTE','M2',NULL,'C1',1,0,NULL)`), /duplicate key/);
        }
      } finally { await client.query('ROLLBACK'); }
    }
  } finally { await client.end(); }
});
