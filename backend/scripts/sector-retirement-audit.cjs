const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
require('dotenv').config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const results = await client.query(readFileSync(join(__dirname, 'sector-retirement-audit.sql'), 'utf8'));
    const [occurrences, dependencies] = results.map(result => result.rows);
    console.log(JSON.stringify({ occurrences, dependencies }, null, 2));
    if (occurrences.length) throw new Error('Retirada bloqueada: há registros classificados como CONSUMO.');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
