const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { parse } = require('dotenv');

async function main() {
  const backendRoot = path.resolve(__dirname, '..');
  const env = parse(fs.readFileSync(path.join(backendRoot, '.env')));
  const url = new URL(env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
    throw new Error('Este fixture só pode ser executado no PostgreSQL local de desenvolvimento.');
  }
  url.searchParams.delete('schema');
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '20s'");
    await client.query(fs.readFileSync(path.join(__dirname, 'fixtures/sest-functional.sql'), 'utf8'));
    const verification = await client.query(`
      WITH items AS (
        SELECT si.* FROM sobra_corte."StockItem" si JOIN sobra_corte."FactoryUnit" fu ON fu.id = si."factoryUnitId"
        WHERE fu.code = 'SEST' AND si.id IN (SELECT id FROM pg_temp.sest_functional_added_items)
      ), locations AS (
        SELECT sil."stockItemId", sum(sil.quantity) AS balance, bool_or(sil.quantity < 0 OR sil."factoryUnitId" <> si."factoryUnitId" OR loc."factoryUnitId" <> si."factoryUnitId") AS invalid
        FROM items si JOIN sobra_corte."StockItemLocation" sil ON sil."stockItemId" = si.id
        JOIN sobra_corte."Location" loc ON loc.id = sil."locationId" GROUP BY sil."stockItemId"
      ), movements AS (
        SELECT sm."stockItemId", sum(CASE WHEN sm.type = 'ENTRADA' THEN sm.quantity
          WHEN sm.type IN ('SAIDA', 'REFUGO', 'SAIDA_REQUISICAO') THEN -sm.quantity ELSE 0 END) AS balance
        FROM items si JOIN sobra_corte."StockMovement" sm ON sm."stockItemId" = si.id GROUP BY sm."stockItemId"
      )
      SELECT count(*)::integer AS checked_items, count(*) FILTER (WHERE si.quantity < 0 OR l.invalid OR l.balance IS NULL OR m.balance IS NULL
        OR si.quantity <> l.balance OR si.quantity <> m.balance) AS divergences
      FROM items si LEFT JOIN locations l ON l."stockItemId" = si.id LEFT JOIN movements m ON m."stockItemId" = si.id
    `);
    if (Number(verification.rows[0].divergences)) throw new Error('Reconciliação de saldos, locais e histórico falhou; dados revertidos.');
    const summary = await client.query(`
      SELECT si.sector, count(*)::integer AS items,
        count(*) FILTER (WHERE si.quantity = 0)::integer AS zero_balance
      FROM sobra_corte."StockItem" si JOIN sobra_corte."FactoryUnit" fu ON fu.id = si."factoryUnitId"
      WHERE fu.code = 'SEST' AND si.code LIKE 'TESTE-SEST-%' GROUP BY si.sector ORDER BY si.sector
    `);
    const totals = await client.query(`
      SELECT (SELECT count(*) FROM sobra_corte."StockMovement" sm JOIN sobra_corte."FactoryUnit" fu ON fu.id = sm."factoryUnitId" WHERE fu.code = 'SEST' AND sm.reason LIKE 'TESTE-SEST-FUNCIONAL:%')::integer AS movements,
        (SELECT count(*) FROM sobra_corte."MaterialRequisition" r JOIN sobra_corte."FactoryUnit" fu ON fu.id = r."factoryUnitId" WHERE fu.code = 'SEST' AND r.code LIKE 'TESTE-SEST-REQ-%')::integer AS requisitions
    `);
    await client.query('COMMIT');
    console.log(JSON.stringify({ unit: 'SEST', reconciled: true, added_items: verification.rows[0].checked_items, sectors: summary.rows, ...totals.rows[0] }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  // Não imprimir configurações, credenciais ou objetos de conexão.
  console.error(error.message);
  process.exitCode = 1;
});
