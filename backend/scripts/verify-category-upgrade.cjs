// Compara um clone 2.0 preservado com seu ensaio atualizado. Somente leitura.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Client } = require('pg');
const { planPreparation } = require('./prepare-category-upgrade.cjs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const serial = value => JSON.stringify(canonical(value));
const identifier = value => `"${value.replaceAll('"', '""')}"`;

async function main() {
  const [source, target] = process.argv.slice(2);
  assert.ok(source && target && source !== target, 'Informe bancos de origem e ensaio distintos.');
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('schema');
  const connect = async database => {
    const destination = new URL(url);
    destination.pathname = `/${database}`;
    const client = new Client({ connectionString: destination.toString(), connectionTimeoutMillis: 5000 });
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    return client;
  };
  const before = await connect(source);
  let after;
  try {
    after = await connect(target);
    const read = async (db, table) => {
      // Preserva precisão de NUMERIC/BIGINT, inclusive acima do limite do Number.
      const numeric = (await db.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='sobra_corte' AND table_name=$1 AND data_type IN ('numeric','bigint')`, [table])).rows;
      let expression = 'to_jsonb(t)';
      for (const { column_name: column } of numeric) {
        expression += ` || jsonb_build_object('${column.replaceAll("'", "''")}', t.${identifier(column)}::text)`;
      }
      return (await db.query(`SELECT ${expression} AS data FROM sobra_corte.${identifier(table)} t`)).rows.map(row => row.data);
    };
    const originalStock = await read(before, 'StockItem');
    const originalCategories = await read(before, 'CategoryConfig');
    const preparation = planPreparation(originalStock, originalCategories);
    assert.equal(preparation.blockers.length, 0, 'Plano original possui bloqueios.');
    const types = new Map(preparation.changes.map(change => [change.itemId, change.after]));
    const targetCategories = await read(after, 'CategoryConfig');
    const categoryById = new Map(targetCategories.map(category => [category.id, category]));
    const stockById = new Map((await read(after, 'StockItem')).map(item => [item.id, item]));
    assert.equal(stockById.size, originalStock.length, 'Contagem de estoque mudou.');
    for (const item of originalStock) {
      const migrated = stockById.get(item.id);
      assert.ok(migrated, `Item ausente: ${item.id}`);
      const category = categoryById.get(migrated.categoryId);
      assert.ok(category && category.factoryUnitId === item.factoryUnitId, `Categoria inválida: ${item.id}`);
      const expected = { ...item, type: types.get(item.id) ?? item.type,
        componentType: category.componentType ?? item.componentType };
      const existing = Object.fromEntries(Object.keys(item).map(key => [key, migrated[key]]));
      assert.ok(serial(existing) === serial(expected), `Campos antigos do item ${item.id} divergiram.`);
      assert.ok(String(migrated.type).trim().toUpperCase() === category.name.trim().toUpperCase(), `Classificação/categoria divergiu: ${item.id}`);
    }
    const tables = (await before.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema='sobra_corte' AND table_type='BASE TABLE' ORDER BY table_name`)).rows;
    const results = [{ table: 'StockItem', before: originalStock.length, after: stockById.size, preserved: true }];
    for (const { table_name: table } of tables) {
      if (['StockItem', '_prisma_migrations'].includes(table)) continue;
      const original = table === 'CategoryConfig' ? originalCategories : await read(before, table);
      const current = table === 'CategoryConfig' ? targetCategories : await read(after, table);
      const allowedAdditions = ['CategoryConfig', 'LocationCategory', 'OriginConfig'].includes(table);
      if (!allowedAdditions) assert.equal(current.length, original.length, `Contagem divergiu: ${table}`);
      if (table === 'CategoryConfig') {
        const byId = new Map(current.map(row => [row.id, row]));
        for (const row of original) {
          const migrated = byId.get(row.id);
          assert.ok(migrated, `Categoria ausente: ${row.id}`);
          for (const key of Object.keys(row).filter(key => !['defaultUnitCode', 'unitLocked'].includes(key))) {
            assert.ok(serial(migrated[key]) === serial(row[key]), `Categoria ${row.id}: ${key} divergiu.`);
          }
        }
      } else if (original.length) {
        const keys = Object.keys(original[0]);
        const projected = new Set(current.map(row => serial(Object.fromEntries(keys.map(key => [key, row[key]])))));
        for (const row of original) assert.ok(projected.has(serial(row)), `Registro antigo divergente em ${table}`);
      }
      results.push({ table, before: original.length, after: current.length, preserved: true });
    }
    const history = await read(before, '_prisma_migrations');
    const checksumDifferences = [];
    for (const entry of history.filter(row => row.finished_at != null && row.rolled_back_at == null)) {
      const file = path.join(__dirname, '../prisma/migrations', entry.migration_name, 'migration.sql');
      assert.ok(fs.existsSync(file), `Migration aplicada ausente: ${entry.migration_name}`);
      const localChecksum = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (localChecksum !== entry.checksum) checksumDifferences.push({ migration: entry.migration_name,
        databaseChecksum: entry.checksum, localChecksum });
    }
    const targetHistory = await read(after, '_prisma_migrations');
    const preservedHistory = new Set(targetHistory.map(serial));
    for (const entry of history) assert.ok(preservedHistory.has(serial(entry)), `Histórico antigo alterado: ${entry.migration_name}`);
    assert.equal(targetHistory.filter(row => row.finished_at == null && row.rolled_back_at == null).length, 0);
    const migrationDirectories = fs.readdirSync(path.join(__dirname, '../prisma/migrations'), { withFileTypes: true }).filter(entry => entry.isDirectory());
    for (const entry of migrationDirectories) {
      assert.ok(targetHistory.some(row => row.migration_name === entry.name && row.finished_at != null && row.rolled_back_at == null), `Migration pendente: ${entry.name}`);
      if (!history.some(row => row.migration_name === entry.name && row.finished_at != null && row.rolled_back_at == null)) {
        const checksum = createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../prisma/migrations', entry.name, 'migration.sql'))).digest('hex');
        assert.ok(targetHistory.some(row => row.migration_name === entry.name && row.finished_at != null && row.checksum === checksum), `Checksum da migration nova divergiu: ${entry.name}`);
      }
    }
    console.log(JSON.stringify({ source, target, preparation: { newCategories: preparation.additions.length,
      changedTypes: preparation.changes.length }, checksumsMatch: checksumDifferences.length === 0,
      checksumDifferences, migrationsComplete: true, results }, null, 2));
    if (checksumDifferences.length) process.exitCode = 2;
  } finally {
    await before.query('ROLLBACK');
    await before.end();
    if (after) { await after.query('ROLLBACK'); await after.end(); }
  }
}
main().catch(error => {
  // Mensagens de assert usam apenas nomes/IDs, nunca conexão ou dados pessoais.
  console.error(error instanceof assert.AssertionError ? error.message : `Comparação interrompida (${error.code || error.name}).`);
  process.exitCode = 1;
});
