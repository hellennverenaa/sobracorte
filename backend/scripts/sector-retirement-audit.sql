WITH occurrences AS (
  SELECT 'StockItem.sector' AS source, "factoryUnitId"::text AS unit, id::text AS record FROM sobra_corte."StockItem" WHERE sector::text = 'CONSUMO'
  UNION ALL SELECT 'StockMovement.sector', "factoryUnitId"::text, id::text FROM sobra_corte."StockMovement" WHERE sector::text = 'CONSUMO'
  UNION ALL SELECT 'StockMovement.sourceSector', "factoryUnitId"::text, id::text FROM sobra_corte."StockMovement" WHERE "sourceSector"::text = 'CONSUMO'
  UNION ALL SELECT 'StockMovement.destinationSector', "factoryUnitId"::text, id::text FROM sobra_corte."StockMovement" WHERE "destinationSector"::text = 'CONSUMO'
  UNION ALL SELECT 'CategoryConfig.sector', "factoryUnitId"::text, id::text FROM sobra_corte."CategoryConfig" WHERE sector::text = 'CONSUMO'
  UNION ALL SELECT 'OriginConfig.sector', "factoryUnitId"::text, id::text FROM sobra_corte."OriginConfig" WHERE sector::text = 'CONSUMO'
  UNION ALL SELECT 'Location.sector', "factoryUnitId"::text, id::text FROM sobra_corte."Location" WHERE sector::text = 'CONSUMO'
  UNION ALL SELECT 'User.assignedSector', "factoryUnitId"::text, id::text FROM sobra_corte."User" WHERE "assignedSector"::text = 'CONSUMO'
  UNION ALL SELECT 'UserRoleBinding.assignedSector', "factoryUnitId"::text, id::text FROM sobra_corte."UserRoleBinding" WHERE "assignedSector"::text = 'CONSUMO'
  UNION ALL SELECT 'MaterialRequisition.requestSector', "factoryUnitId"::text, id::text FROM sobra_corte."MaterialRequisition" WHERE "requestSector"::text = 'CONSUMO'
  UNION ALL SELECT 'RoleChangeAudit.previousSector', "factoryUnitId"::text, id::text FROM sobra_corte."RoleChangeAudit" WHERE "previousSector"::text = 'CONSUMO'
  UNION ALL SELECT 'RoleChangeAudit.newSector', "factoryUnitId"::text, id::text FROM sobra_corte."RoleChangeAudit" WHERE "newSector"::text = 'CONSUMO'
)
SELECT source, unit, record FROM occurrences ORDER BY source, unit, record;

SELECT n.nspname AS schema_name, c.relname AS relation_name, a.attname AS column_name
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
WHERE t.typname = 'SectorType' AND n.nspname = 'sobra_corte' AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY relation_name, column_name;
