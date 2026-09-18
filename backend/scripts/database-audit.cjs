const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
require('dotenv').config({ quiet: true });

const command = process.argv[2];
if (!['integrity', 'identity'].includes(command)) {
  console.error('Use integrity ou identity.');
  process.exitCode = 1;
  return;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('BEGIN');
    if (command === 'integrity') {
      await client.query(readFileSync(join(__dirname, 'stock-integrity.sql'), 'utf8'));
      const { rows } = await client.query(`SELECT unit_id, check_name, count(*)::integer AS divergences
        FROM stock_integrity_violations GROUP BY unit_id, check_name ORDER BY unit_id, check_name`);
      if (rows.length) {
        console.error(JSON.stringify(rows));
        throw new Error('Integridade de estoque reprovada. Nenhum dado foi alterado.');
      }
    } else {
      const admins = (process.env.GLOBAL_ADMIN_IDENTITIES || '').split(',')
        .map(value => value.trim().toUpperCase()).filter(Boolean);
      const { rows } = await client.query(
        readFileSync(join(__dirname, 'identity-migration-audit.sql'), 'utf8'),
        [admins],
      );
      if (rows.length) {
        console.error(JSON.stringify(rows));
        throw new Error('Auditoria de identidade reprovada.');
      }
    }
    await client.query('ROLLBACK');
    console.log('Auditoria aprovada.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.code ? `Falha de banco (${error.code}).` : error.message);
  process.exitCode = 1;
});
