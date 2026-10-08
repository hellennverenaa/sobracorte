-- Diagnóstico somente de leitura, compatível com o estoque da versão 2.0.
-- Executar com psql -X -v ON_ERROR_STOP=1 -f validation/upgrade-diagnosis.sql
-- O relatório contém dados operacionais; guardar fora do repositório.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';

SELECT current_database() AS database, current_setting('server_version') AS version;

SELECT migration_name, checksum, started_at, finished_at, rolled_back_at,
       applied_steps_count
FROM sobra_corte._prisma_migrations
ORDER BY started_at, migration_name;

SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'sobra_corte'
ORDER BY table_name, ordinal_position;

SELECT f.code AS factory, s.sector, s.unit, count(*) AS items,
       sum(s.quantity) AS quantity, sum(s."minStock") AS minimum_stock
FROM sobra_corte."StockItem" s
JOIN sobra_corte."FactoryUnit" f ON f.id = s."factoryUnitId"
GROUP BY f.code, s.sector, s.unit ORDER BY f.code, s.sector, s.unit;

SELECT 'StockItem' AS entity, count(*) AS records FROM sobra_corte."StockItem"
UNION ALL SELECT 'StockItemLocation', count(*) FROM sobra_corte."StockItemLocation"
UNION ALL SELECT 'StockMovement', count(*) FROM sobra_corte."StockMovement"
UNION ALL SELECT 'MaterialRequisition', count(*) FROM sobra_corte."MaterialRequisition"
UNION ALL SELECT 'CategoryConfig', count(*) FROM sobra_corte."CategoryConfig"
UNION ALL SELECT 'Location', count(*) FROM sobra_corte."Location"
UNION ALL SELECT 'LocationCategory', count(*) FROM sobra_corte."LocationCategory";

-- Prevê os candidatos por nome/setor mesmo antes de existir categoryId/sectors.
-- Candidatos não autorizam classificação automática: revisar os dados no clone.
WITH candidates AS (
  SELECT s.id, s."factoryUnitId", s.sector, s.type, s.unit, s."footSide",
         s."componentType", s.quantity,
         (to_jsonb(s)->>'categoryId')::integer AS current_category_id,
         count(c.id) AS matches,
         array_agg(c.id ORDER BY c.id) FILTER (WHERE c.id IS NOT NULL) AS category_ids
  FROM sobra_corte."StockItem" s
  LEFT JOIN sobra_corte."CategoryConfig" c
    ON c."factoryUnitId" = s."factoryUnitId"
    AND upper(btrim(c.name)) = upper(btrim(s.type))
    AND (
      CASE WHEN jsonb_array_length(COALESCE(to_jsonb(c)->'sectors', '[]'::jsonb)) > 0
      THEN (to_jsonb(c)->'sectors') ? s.sector::text
        OR (s.sector::text IN ('DISTRIBUICAO','EXPEDICAO')
          AND (to_jsonb(c)->'sectors') ?| ARRAY['DISTRIBUICAO','EXPEDICAO'])
      ELSE c.sector IS NULL OR c.sector = s.sector
        OR (s.sector::text IN ('DISTRIBUICAO','EXPEDICAO')
          AND c.sector::text IN ('DISTRIBUICAO','EXPEDICAO')) END
    )
  GROUP BY s.id
)
SELECT "factoryUnitId", sector, type, unit, "footSide", "componentType",
       matches, category_ids, count(*) AS items, sum(quantity) AS quantity,
       array_agg(id ORDER BY id) AS item_ids
FROM candidates
WHERE (current_category_id IS NULL AND matches <> 1) OR matches > 1
GROUP BY "factoryUnitId", sector, type, unit, "footSide", "componentType", matches, category_ids
ORDER BY "factoryUnitId", sector, type;

SELECT id, "factoryUnitId", unit, quantity, "minStock", "footSide"
FROM sobra_corte."StockItem"
WHERE (unit IN ('UN','PAR','CX','ROLO')
       AND (quantity <> trunc(quantity) OR "minStock" <> trunc("minStock")))
   OR "footSide"::text = 'PAR'
ORDER BY id;

SELECT "factoryUnitId", code, "footSide", array_agg(id ORDER BY id) AS item_ids
FROM sobra_corte."StockItem"
WHERE code IS NOT NULL
GROUP BY "factoryUnitId", code, "footSide" HAVING count(*) > 1;

ROLLBACK;
