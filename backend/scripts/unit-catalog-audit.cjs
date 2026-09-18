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
    const results = await client.query(readFileSync(join(__dirname, 'unit-catalog-audit.sql'), 'utf8'));
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
