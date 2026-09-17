const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
require('dotenv').config({ quiet: true });

const readSql = (name) => readFileSync(join(__dirname, name), 'utf8');

async function check(client, view) {
  // view é um nome interno, nunca entrada do usuário.
  const { rows } = await client.query(`SELECT unit_id, check_name, count(*)::integer AS divergences
    FROM ${view} GROUP BY unit_id, check_name ORDER BY unit_id, check_name`);
  if (rows.length) {
    console.error(JSON.stringify(rows));
    throw new Error('Gate reprovado: divergências encontradas. Nenhum dado foi corrigido.');
  }
}

async function checkpoint(client) {
  return (await client.query('SELECT * FROM sobra_corte."StockMigrationCheckpoint" WHERE id = 1')).rows[0];
}

async function verifyEvidence(client, state) {
  if (!state) throw new Error('Falta evidência de migração. Não certificar um cutover já realizado sem seu checkpoint original.');
  const { rows } = await client.query(`SELECT "legacyEvidence" IS NOT DISTINCT FROM
    (SELECT evidence FROM stock_legacy_evidence) AS matches FROM sobra_corte."StockMigrationCheckpoint" WHERE id = 1`);
  if (!rows[0].matches) throw new Error('O legado mudou desde a reconciliação. Evidência de migração inválida.');
}

async function run(client, command) {
  if (!['backfill', 'reconcile', 'integrity', 'status', 'identity-audit', 'fixture'].includes(command)) {
    throw new Error('Use backfill, reconcile, integrity, status, identity-audit ou fixture.');
  }
  if (command === 'fixture') {
    const url = new URL(process.env.DATABASE_URL);
    if (!/^\/sobracorte_cycle6_[a-z0-9_]+$/.test(url.pathname)
        || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        || process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL) {
      throw new Error('Fixture exige banco descartável sobracorte_cycle6_* e TEST_DATABASE_URL igual a DATABASE_URL.');
    }
    if (await checkpoint(client)) throw new Error('Fixture recusada: o banco já tem evidência de migração.');
    await client.query('BEGIN');
    try {
      await client.query(readSql('fixtures/stock-unification.sql'));
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    return;
  }
  // DDL exclusivamente temporário, antes do snapshot read-only dos gates.
  if (!['status', 'identity-audit'].includes(command)) {
    await client.query(readSql('stock-integrity.sql'));
    await client.query(readSql('reconcile-stock-unification.sql'));
  }
  await client.query(command === 'backfill' ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    if (command === 'identity-audit') {
      const admins = (process.env.GLOBAL_ADMIN_IDENTITIES || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean).map(value => {
        const match = /^([A-Z0-9_-]+):(\d+)$/.exec(value);
        if (!match || BigInt(match[2]) <= 0n) throw new Error('GLOBAL_ADMIN_IDENTITIES inválido para auditoria.');
        return `${match[1]}:${BigInt(match[2])}`;
      });
      const { rows } = await client.query(readSql('identity-migration-audit.sql'), [admins]);
      if (rows.length) {
        console.error(JSON.stringify(rows));
        throw new Error('Transição de identidade pendente: manter o fallback legado e impedir contração de User.');
      }
    } else {
      if (command === 'backfill') {
        // Mesmo ordenamento do runtime: unidade antes dos itens. Bloqueia writers,
        // inclusive scripts sem o lock de domínio, durante todo o gate/lote.
        await client.query(`LOCK TABLE sobra_corte."FactoryUnit", sobra_corte."StockMigrationCheckpoint",
          sobra_corte."Material", sobra_corte."MaterialLocation", sobra_corte."Movement",
          sobra_corte."StockItem", sobra_corte."StockItemLocation", sobra_corte."StockMovement",
          sobra_corte."MaterialRequisition", sobra_corte."Location" IN SHARE ROW EXCLUSIVE MODE`);
      }
      const state = await checkpoint(client);
      if (command === 'status') {
        console.log(JSON.stringify({ stage: !state ? 'unverified' : state.cutoverAt ? 'post-cutover' : 'pre-cutover',
          completedAt: state?.completedAt, cutoverAt: state?.cutoverAt }));
      } else {
        if (command === 'backfill') {
          if (state?.cutoverAt) throw new Error('Backfill recusado: houve gravações canônicas após a migração.');
          if (state) await verifyEvidence(client, state);
          const activity = await client.query(`SELECT EXISTS (
            SELECT 1 FROM sobra_corte."StockItem" WHERE sector = 'CORTE' AND "legacyMaterialId" IS NULL
            UNION ALL SELECT 1 FROM sobra_corte."StockMovement" WHERE sector = 'CORTE' AND "legacyMovementId" IS NULL
          ) AS active`);
          if (activity.rows[0].active) throw new Error('Backfill recusado: Corte já possui atividade canônica não migrada.');
          await client.query(readSql('backfill-stock-unification.sql'));
          await check(client, 'stock_migration_violations');
          await check(client, 'stock_integrity_violations');
          await client.query(`INSERT INTO sobra_corte."StockMigrationCheckpoint" (id, "legacyEvidence")
            SELECT 1, evidence FROM stock_legacy_evidence
            ON CONFLICT (id) DO NOTHING`);
          const summary = await client.query(`SELECT
            (SELECT count(*)::integer FROM sobra_corte."Material") AS legacy_items,
            (SELECT count(*)::integer FROM sobra_corte."Movement") AS legacy_movements`);
          console.log(JSON.stringify(summary.rows[0]));
        } else if (command === 'reconcile') {
          if (state?.cutoverAt) throw new Error('Reconciliação pré-cutover recusada: use stock:integrity após gravações canônicas.');
          await verifyEvidence(client, state);
          await check(client, 'stock_migration_violations');
          await check(client, 'stock_integrity_violations');
        } else {
          await verifyEvidence(client, state);
          await check(client, 'stock_integrity_violations');
          await check(client, 'stock_history_violations');
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await run(client, process.argv[2]);
    if (process.argv[2] === 'fixture') console.log('Fixture preparada.');
    else if (process.argv[2] !== 'status') console.log('Gate aprovado.');
  } finally { await client.end(); }
}

module.exports = { run };
if (require.main === module) main().catch(error => {
  // Erros de conexão podem conter valores da configuração; não imprimi-los.
  console.error(error.code ? `Falha de banco (${error.code}).` : error.message);
  process.exitCode = 1;
});
