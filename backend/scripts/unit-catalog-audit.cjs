const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
require('dotenv').config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('schema');
  const client = new Client({ connectionString: url.toString() });
  try {
    await client.connect();
    const { rows: tables } = await client.query(`
      SELECT to_regclass('sobra_corte."UnitConfig"') AS unit_config,
             to_regclass('sobra_corte."CategoryConfig"') AS category_config,
             to_regclass('sobra_corte."StockItem"') AS stock_item
    `);
    if (!tables[0].category_config || !tables[0].stock_item) {
      throw new Error('Schema de estoque/configurações não encontrado.');
    }
    const auditFile = tables[0].unit_config
      ? 'unit-catalog-audit.sql'
      : 'unit-catalog-audit-post.sql';
    const results = await client.query(readFileSync(join(__dirname, auditFile), 'utf8'));
    const rows = results.find(result => result.command === 'SELECT').rows;
    const counts = {};
    for (const row of rows) counts[row.issue] = (counts[row.issue] || 0) + 1;
    console.log(JSON.stringify(counts));
    const violations = rows.filter(row => !['stock_alias', 'category_default'].includes(row.issue));
    if (violations.length) {
      console.error(JSON.stringify(violations));
      throw new Error('Unidades incompatíveis: revisar explicitamente antes de migrar.');
    }
    console.log('Auditoria aprovada. Nenhum dado foi alterado.');
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}
main().catch(error => {
  console.error(error.code ? `Falha de banco (${error.code}).` : error.message);
  process.exitCode = 1;
});
