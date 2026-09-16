-- Gate do cutover: toda linha retornada deve ter divergences = 0.
WITH legacy_movement_totals AS (
  SELECT "factoryUnitId",
    CASE lower(type)
      WHEN 'entrada' THEN 'ENTRADA' WHEN 'saida' THEN 'SAIDA'
      WHEN 'transferencia' THEN 'TRANSFERENCIA' WHEN 'refugo' THEN 'REFUGO'
    END AS normalized_type,
    count(*) AS row_count, sum(quantity) AS volume
  FROM sobra_corte."Movement"
  WHERE lower(type) IN ('entrada', 'saida', 'transferencia', 'refugo')
  GROUP BY 1, 2
), canonical_movement_totals AS (
  SELECT "factoryUnitId", type::text AS normalized_type,
    count(*) AS row_count, sum(quantity) AS volume
  FROM sobra_corte."StockMovement"
  WHERE "legacyMovementId" IS NOT NULL
  GROUP BY 1, 2
), checks AS (
  SELECT m."factoryUnitId", 'items' AS check_name,
    abs(count(*) - count(si.id))::numeric AS divergences
  FROM sobra_corte."Material" m
  LEFT JOIN sobra_corte."StockItem" si
    ON si."factoryUnitId" = m."factoryUnitId" AND si."legacyMaterialId" = m.id
  GROUP BY m."factoryUnitId"
  UNION ALL
  SELECT m."factoryUnitId", 'total_balance',
    COALESCE(sum(abs(m.quantity - si.quantity)), 0)
  FROM sobra_corte."Material" m
  JOIN sobra_corte."StockItem" si
    ON si."factoryUnitId" = m."factoryUnitId" AND si."legacyMaterialId" = m.id
  GROUP BY m."factoryUnitId"
  UNION ALL
  SELECT si."factoryUnitId", 'unmapped_canonical_items', count(*)::numeric
  FROM sobra_corte."StockItem" si
  WHERE si.sector = 'CORTE' AND si."legacyMaterialId" IS NULL
  GROUP BY si."factoryUnitId"
  UNION ALL
  SELECT ml."factoryUnitId", 'location_balance',
    COALESCE(sum(abs(COALESCE(ml.quantity, 0) - COALESCE(sil.quantity, 0))), 0)
  FROM sobra_corte."MaterialLocation" ml
  JOIN sobra_corte."StockItem" si
    ON si."factoryUnitId" = ml."factoryUnitId" AND si."legacyMaterialId" = ml."materialId"
  LEFT JOIN sobra_corte."StockItemLocation" sil
    ON sil."stockItemId" = si.id AND sil."locationId" = ml."locationId"
  GROUP BY ml."factoryUnitId"
  UNION ALL
  SELECT mv."factoryUnitId", 'movements',
    count(*) FILTER (WHERE sm.id IS NULL OR sm.quantity <> mv.quantity)::numeric
  FROM sobra_corte."Movement" mv
  LEFT JOIN sobra_corte."StockMovement" sm
    ON sm."factoryUnitId" = mv."factoryUnitId" AND sm."legacyMovementId" = mv.id
  GROUP BY mv."factoryUnitId"
  UNION ALL
  SELECT COALESCE(l."factoryUnitId", c."factoryUnitId"), 'movement_type_volume',
    abs(COALESCE(l.row_count, 0) - COALESCE(c.row_count, 0))
      + abs(COALESCE(l.volume, 0) - COALESCE(c.volume, 0))
  FROM legacy_movement_totals l
  FULL JOIN canonical_movement_totals c
    ON c."factoryUnitId" = l."factoryUnitId" AND c.normalized_type = l.normalized_type
  UNION ALL
  SELECT fu.id, 'orphans', count(si.id) FILTER (
    WHERE si.sector = 'CORTE' AND si.quantity <> 0 AND NOT EXISTS (
      SELECT 1 FROM sobra_corte."StockItemLocation" sil WHERE sil."stockItemId" = si.id
    )
  )::numeric
  FROM sobra_corte."FactoryUnit" fu
  LEFT JOIN sobra_corte."StockItem" si ON si."factoryUnitId" = fu.id
  GROUP BY fu.id
)
SELECT * FROM checks ORDER BY "factoryUnitId", check_name;
