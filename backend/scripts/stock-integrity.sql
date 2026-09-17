-- Integridade atual: não compara saldos operacionais com o legado congelado.
CREATE OR REPLACE TEMP VIEW stock_integrity_violations AS
SELECT s."factoryUnitId" AS unit_id, 'item_location_balance'::text AS check_name
FROM sobra_corte."StockItem" s
LEFT JOIN sobra_corte."StockItemLocation" l ON l."stockItemId" = s.id
GROUP BY s.id, s."factoryUnitId", s.quantity, s."minStock"
HAVING s.quantity < 0 OR s."minStock" < 0 OR s.quantity <> COALESCE(sum(l.quantity), 0)
UNION ALL
SELECT l."factoryUnitId", 'location_tenant_and_sector'
FROM sobra_corte."StockItemLocation" l
LEFT JOIN sobra_corte."StockItem" s ON s.id = l."stockItemId"
LEFT JOIN sobra_corte."Location" loc ON loc.id = l."locationId"
WHERE s.id IS NULL OR loc.id IS NULL OR l.quantity < 0
  OR l."factoryUnitId" <> s."factoryUnitId" OR l."factoryUnitId" <> loc."factoryUnitId"
  OR (loc.sector IS NOT NULL AND
      CASE WHEN loc.sector = 'EXPEDICAO' THEN 'DISTRIBUICAO' ELSE loc.sector::text END <>
      CASE WHEN s.sector = 'EXPEDICAO' THEN 'DISTRIBUICAO' ELSE s.sector::text END)
UNION ALL
SELECT m."factoryUnitId", 'movement_tenant_and_quantity'
FROM sobra_corte."StockMovement" m
LEFT JOIN sobra_corte."StockItem" s ON s.id = m."stockItemId"
WHERE (m."stockItemId" IS NOT NULL AND (s.id IS NULL OR s."factoryUnitId" <> m."factoryUnitId"))
  OR m.quantity < 0 OR (m.quantity = 0 AND m.type NOT IN ('EDICAO_CONFIGURACAO', 'EXCLUSAO_CONFIGURACAO', 'CRIACAO_CONFIGURACAO'))
UNION ALL
SELECT m."factoryUnitId", 'movement_endpoint_tenant'
FROM sobra_corte."StockMovement" m
LEFT JOIN sobra_corte."StockItem" source_item ON source_item.id = m."sourceStockItemId"
LEFT JOIN sobra_corte."StockItem" destination_item ON destination_item.id = m."destinationStockItemId"
LEFT JOIN sobra_corte."Location" source_location ON source_location.id = m."sourceLocationId"
LEFT JOIN sobra_corte."Location" destination_location ON destination_location.id = m."destinationLocationId"
WHERE (source_item.id IS NOT NULL AND source_item."factoryUnitId" <> m."factoryUnitId")
  OR (destination_item.id IS NOT NULL AND destination_item."factoryUnitId" <> m."factoryUnitId")
  OR (source_location.id IS NOT NULL AND source_location."factoryUnitId" <> m."factoryUnitId")
  OR (destination_location.id IS NOT NULL AND destination_location."factoryUnitId" <> m."factoryUnitId")
UNION ALL
SELECT r."factoryUnitId", 'requisition_bounds'
FROM sobra_corte."MaterialRequisition" r
WHERE r."quantityRequested" <= 0 OR r."quantityFulfilled" < 0 OR r."quantityFulfilled" > r."quantityRequested"
  OR (r.status = 'ATENDIDA_TOTAL' AND r."quantityFulfilled" <> r."quantityRequested")
  OR (r.status IN ('PENDENTE', 'CANCELADA') AND r."quantityFulfilled" <> 0)
  OR (r.status = 'ATENDIDA_PARCIAL' AND (r."quantityFulfilled" <= 0 OR r."quantityFulfilled" >= r."quantityRequested"));

CREATE OR REPLACE TEMP VIEW stock_legacy_evidence AS
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'unit', u.id,
  'materials', (SELECT COALESCE(md5(string_agg(md5(to_jsonb(m)::text), '' ORDER BY m.id)), md5(''))
    FROM sobra_corte."Material" m WHERE m."factoryUnitId" = u.id),
  'locations', (SELECT COALESCE(md5(string_agg(md5(to_jsonb(l)::text), '' ORDER BY l."materialId", l."locationId")), md5(''))
    FROM sobra_corte."MaterialLocation" l WHERE l."factoryUnitId" = u.id),
  'movements', (SELECT COALESCE(md5(string_agg(md5(to_jsonb(m)::text), '' ORDER BY m.id)), md5(''))
    FROM sobra_corte."Movement" m WHERE m."factoryUnitId" = u.id)
) ORDER BY u.id), '[]'::jsonb) AS evidence
FROM sobra_corte."FactoryUnit" u
WHERE EXISTS (SELECT 1 FROM sobra_corte."Material" m WHERE m."factoryUnitId" = u.id)
   OR EXISTS (SELECT 1 FROM sobra_corte."MaterialLocation" l WHERE l."factoryUnitId" = u.id)
   OR EXISTS (SELECT 1 FROM sobra_corte."Movement" m WHERE m."factoryUnitId" = u.id);
