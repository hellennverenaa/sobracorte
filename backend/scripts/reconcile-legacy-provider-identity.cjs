const { readFileSync } = require('node:fs');
const { join } = require('node:path');

async function reconcileLegacyProviderIdentity(client, unitId, migratedBindingId, providerBindingId, apply = false) {
  for (const id of [unitId, migratedBindingId, providerBindingId]) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('IDs devem ser inteiros positivos.');
  }
  if (migratedBindingId === providerBindingId) throw new Error('Os vínculos devem ser diferentes.');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query(`CREATE TEMP TABLE legacy_identity_reconciliation_input (
      unit_id integer, migrated_binding_id integer, provider_binding_id integer
    ) ON COMMIT DROP`);
    await client.query('INSERT INTO legacy_identity_reconciliation_input VALUES ($1, $2, $3)',
      [unitId, migratedBindingId, providerBindingId]);
    await client.query(readFileSync(join(__dirname, 'reconcile-legacy-provider-identity.sql'), 'utf8'));
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

module.exports = { reconcileLegacyProviderIdentity };

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  const { Client } = require('pg');
  const args = process.argv.slice(2);
  async function main() {
    if (args.length < 3 || args.length > 4 || (args[3] && args[3] !== '--apply')) {
      throw new Error('Uso: node scripts/reconcile-legacy-provider-identity.cjs <unidade> <vínculo migrado> <vínculo do provedor> [--apply]');
    }
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      await reconcileLegacyProviderIdentity(client, ...args.slice(0, 3).map(Number), args[3] === '--apply');
      console.log(args[3] ? 'Reconciliação aplicada.' : 'Simulação aprovada. Alterações revertidas.');
    } finally {
      await client.end();
    }
  }
  main().catch(error => {
    console.error(error.code ? `Reconciliação recusada (${error.code}): ${error.message}` : error.message);
    process.exitCode = 1;
  });
}
