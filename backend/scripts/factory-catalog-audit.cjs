const { Client } = require('pg');
require('dotenv').config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('schema');
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");

    const summary = await client.query(`
      SELECT fu.code, fu.name, fu.active, fu."enableRequisitions",
        (SELECT count(*)::int FROM sobra_corte."CategoryConfig" c WHERE c."factoryUnitId" = fu.id) AS categories,
        (SELECT count(*)::int FROM sobra_corte."OriginConfig" o WHERE o."factoryUnitId" = fu.id) AS origins,
        (SELECT count(*)::int FROM sobra_corte."Location" l WHERE l."factoryUnitId" = fu.id) AS locations,
        (SELECT count(*)::int FROM sobra_corte."CategoryConfig" c WHERE c."factoryUnitId" = fu.id AND c.name LIKE 'TESTE-SEST-%') AS test_categories,
        (SELECT count(*)::int FROM sobra_corte."OriginConfig" o WHERE o."factoryUnitId" = fu.id AND o.name LIKE 'TESTE-SEST-%') AS test_origins
      FROM sobra_corte."FactoryUnit" fu ORDER BY fu.code
    `);

    const categoryDifferences = await client.query(`
      WITH sest AS (
        SELECT upper(trim(name)) AS logical_name, sector, "defaultUnitCode", "unitLocked"
        FROM sobra_corte."CategoryConfig" c
        JOIN sobra_corte."FactoryUnit" fu ON fu.id = c."factoryUnitId" AND fu.code = 'SEST'
      )
      SELECT fu.code, c.name, c.sector, c."defaultUnitCode", c."unitLocked",
        sest.sector AS sest_sector, sest."defaultUnitCode" AS sest_default_unit,
        sest."unitLocked" AS sest_unit_locked
      FROM sobra_corte."CategoryConfig" c
      JOIN sobra_corte."FactoryUnit" fu ON fu.id = c."factoryUnitId"
      JOIN sest ON sest.logical_name = upper(trim(c.name))
      WHERE fu.code <> 'SEST'
        AND (c.sector IS DISTINCT FROM sest.sector
          OR c."defaultUnitCode" IS DISTINCT FROM sest."defaultUnitCode"
          OR c."unitLocked" IS DISTINCT FROM sest."unitLocked")
      ORDER BY fu.code, c.name
    `);

    const originDifferences = await client.query(`
      WITH sest AS (
        SELECT upper(trim(name)) AS logical_name, sector
        FROM sobra_corte."OriginConfig" o
        JOIN sobra_corte."FactoryUnit" fu ON fu.id = o."factoryUnitId" AND fu.code = 'SEST'
      )
      SELECT fu.code, o.name, o.sector, sest.sector AS sest_sector
      FROM sobra_corte."OriginConfig" o
      JOIN sobra_corte."FactoryUnit" fu ON fu.id = o."factoryUnitId"
      JOIN sest ON sest.logical_name = upper(trim(o.name))
      WHERE fu.code <> 'SEST' AND o.sector IS DISTINCT FROM sest.sector
      ORDER BY fu.code, o.name
    `);

    const logicalDuplicates = await client.query(`
      SELECT 'CATEGORY' AS kind, fu.code, normalized.name_key, count(*)::int AS records,
        array_agg(c.name ORDER BY c.id) AS names
      FROM sobra_corte."CategoryConfig" c
      JOIN sobra_corte."FactoryUnit" fu ON fu.id = c."factoryUnitId"
      CROSS JOIN LATERAL (SELECT upper(regexp_replace(trim(c.name), '\\s+', ' ', 'g')) AS name_key) normalized
      GROUP BY fu.code, normalized.name_key
      HAVING count(*) > 1
      UNION ALL
      SELECT 'ORIGIN' AS kind, fu.code, normalized.name_key, count(*)::int AS records,
        array_agg(o.name ORDER BY o.id) AS names
      FROM sobra_corte."OriginConfig" o
      JOIN sobra_corte."FactoryUnit" fu ON fu.id = o."factoryUnitId"
      CROSS JOIN LATERAL (SELECT upper(regexp_replace(trim(o.name), '\\s+', ' ', 'g')) AS name_key) normalized
      GROUP BY fu.code, normalized.name_key
      HAVING count(*) > 1
      ORDER BY kind, code, name_key
    `);

    const massUnitUsage = await client.query(`
      SELECT fu.code, si.sector, coalesce(si.type, '<SEM CATEGORIA>') AS category,
        si.unit, count(*)::int AS stock_items,
        sum(CASE WHEN si.quantity > 0 THEN 1 ELSE 0 END)::int AS items_with_balance,
        coalesce(sum(si.quantity), 0)::text AS total_quantity
      FROM sobra_corte."StockItem" si
      JOIN sobra_corte."FactoryUnit" fu ON fu.id = si."factoryUnitId"
      WHERE si.unit IN ('KG', 'G')
      GROUP BY fu.code, si.sector, coalesce(si.type, '<SEM CATEGORIA>'), si.unit
      ORDER BY fu.code, si.sector, category, si.unit
    `);

    const massMovementUsage = await client.query(`
      SELECT fu.code, sm.sector, coalesce(sm."itemCategory", '<SEM CATEGORIA>') AS category,
        sm."itemUnit" AS unit, count(*)::int AS movements,
        coalesce(sum(sm.quantity), 0)::text AS gross_quantity
      FROM sobra_corte."StockMovement" sm
      JOIN sobra_corte."FactoryUnit" fu ON fu.id = sm."factoryUnitId"
      WHERE sm."itemUnit" IN ('KG', 'G')
      GROUP BY fu.code, sm.sector, coalesce(sm."itemCategory", '<SEM CATEGORIA>'), sm."itemUnit"
      ORDER BY fu.code, sm.sector, category, unit
    `);

    await client.query('COMMIT');
    console.log(JSON.stringify({
      summary: summary.rows,
      categoryDifferences: categoryDifferences.rows,
      originDifferences: originDifferences.rows,
      logicalDuplicates: logicalDuplicates.rows,
      massUnitUsage: massUnitUsage.rows,
      massMovementUsage: massMovementUsage.rows,
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Falha na auditoria do catálogo.');
  process.exitCode = 1;
});
