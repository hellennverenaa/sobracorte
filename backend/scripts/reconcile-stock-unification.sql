-- Pré-cutover: executar pelo runner, que reprova qualquer divergência.
CREATE OR REPLACE TEMP VIEW stock_history_violations AS
SELECT COALESCE(m."factoryUnitId", s."factoryUnitId") AS unit_id, 'historical_movements'::text AS check_name
FROM sobra_corte."Movement" m
FULL JOIN (SELECT * FROM sobra_corte."StockMovement" WHERE "legacyMovementId" IS NOT NULL) s
  ON s."legacyMovementId" = m.id AND s."factoryUnitId" = m."factoryUnitId"
WHERE m.id IS NULL OR s.id IS NULL OR
  ROW(s.type::text, s.quantity, s."itemCode", s."itemName", s."itemCategory", s."itemUnit",
      s."destinationLocationName", s.origem, s.reason, s."operatorId", s."operatorName", s."createdAt", s.sector::text)
  IS DISTINCT FROM
  ROW(upper(m.type), m.quantity, m."materialCode", m."materialName", m."materialCategory", m."materialUnit",
      m."locationName", m.origem, m.reason, m."operatorId", m."operatorName", m."createdAt", 'CORTE'::text);

CREATE OR REPLACE TEMP VIEW stock_migration_violations AS
SELECT * FROM stock_history_violations
UNION ALL
SELECT COALESCE(m."factoryUnitId", s."factoryUnitId"), 'item_mapping_and_metadata'
FROM sobra_corte."Material" m
FULL JOIN (SELECT * FROM sobra_corte."StockItem" WHERE "legacyMaterialId" IS NOT NULL) s
  ON s."legacyMaterialId" = m.id AND s."factoryUnitId" = m."factoryUnitId"
WHERE m.id IS NULL OR s.id IS NULL OR
  ROW(s.code, s.name, s.unit, s.type, s.observation, s."minStock", s."createdAt", s."updatedAt", s.sector::text, s."componentType"::text)
  IS DISTINCT FROM
  ROW(m.code, m.name, m.unit, m.type, m.observation, m."minStock", m."createdAt", m."updatedAt", 'CORTE'::text, 'MATERIA_PRIMA'::text)
UNION ALL
SELECT m."factoryUnitId", 'total_balance'
FROM sobra_corte."Material" m
JOIN sobra_corte."StockItem" s ON s."legacyMaterialId" = m.id AND s."factoryUnitId" = m."factoryUnitId"
WHERE s.quantity IS DISTINCT FROM m.quantity
UNION ALL
SELECT s."factoryUnitId", 'unmapped_corte'
FROM sobra_corte."StockItem" s WHERE sector = 'CORTE' AND "legacyMaterialId" IS NULL
UNION ALL
SELECT COALESCE(l.unit_id, c.unit_id), 'location_mapping_and_balance'
FROM (
  SELECT m.id AS material_id, ml."locationId" AS location_id, ml."factoryUnitId" AS unit_id, COALESCE(ml.quantity, 0) AS quantity
  FROM sobra_corte."MaterialLocation" ml
  JOIN sobra_corte."Material" m ON m.id = ml."materialId" AND m."factoryUnitId" = ml."factoryUnitId"
) l
FULL JOIN (
  SELECT s."legacyMaterialId" AS material_id, sl."locationId" AS location_id, sl."factoryUnitId" AS unit_id, sl.quantity
  FROM sobra_corte."StockItemLocation" sl
  JOIN sobra_corte."StockItem" s ON s.id = sl."stockItemId" AND s."factoryUnitId" = sl."factoryUnitId"
  WHERE s."legacyMaterialId" IS NOT NULL
) c ON c.material_id = l.material_id AND c.location_id = l.location_id AND c.unit_id = l.unit_id
WHERE l.material_id IS NULL OR c.material_id IS NULL OR l.quantity IS DISTINCT FROM c.quantity
UNION ALL
SELECT m."factoryUnitId", 'movement_item_reference'
FROM sobra_corte."Movement" m
JOIN sobra_corte."StockMovement" sm ON sm."legacyMovementId" = m.id AND sm."factoryUnitId" = m."factoryUnitId"
LEFT JOIN sobra_corte."StockItem" s ON s."legacyMaterialId" = m."materialId" AND s."factoryUnitId" = m."factoryUnitId"
WHERE sm."stockItemId" IS DISTINCT FROM s.id
UNION ALL
SELECT m."factoryUnitId", 'canonical_corte_activity'
FROM sobra_corte."StockMovement" m WHERE sector = 'CORTE' AND "legacyMovementId" IS NULL
UNION ALL
SELECT l."factoryUnitId", 'legacy_location_reference'
FROM sobra_corte."MaterialLocation" l
LEFT JOIN sobra_corte."Material" m ON m.id = l."materialId"
LEFT JOIN sobra_corte."Location" loc ON loc.id = l."locationId"
WHERE m.id IS NULL OR loc.id IS NULL OR m."factoryUnitId" <> l."factoryUnitId"
  OR loc."factoryUnitId" <> l."factoryUnitId"
UNION ALL
SELECT mv."factoryUnitId", 'legacy_movement_reference'
FROM sobra_corte."Movement" mv
LEFT JOIN sobra_corte."Material" m ON m.id = mv."materialId"
WHERE mv."materialId" IS NOT NULL AND (m.id IS NULL OR m."factoryUnitId" <> mv."factoryUnitId");
