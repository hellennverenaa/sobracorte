-- Reexecutável. Deve rodar durante janela sem gravações, antes do cutover.
INSERT INTO sobra_corte."StockItem" (
  "factoryUnitId", "legacyMaterialId", "sector", "componentType", "code", "name",
  "quantity", "unit", "type", "observation", "minStock", "createdAt", "updatedAt"
)
SELECT m."factoryUnitId", m.id, 'CORTE', 'MATERIA_PRIMA', m.code, m.name,
       m.quantity, m.unit, m.type, m.observation, m."minStock", m."createdAt", m."updatedAt"
FROM sobra_corte."Material" m
ON CONFLICT ("factoryUnitId", "legacyMaterialId") DO UPDATE SET
  code = EXCLUDED.code, name = EXCLUDED.name, quantity = EXCLUDED.quantity,
  unit = EXCLUDED.unit, type = EXCLUDED.type, observation = EXCLUDED.observation,
  "minStock" = EXCLUDED."minStock", "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO sobra_corte."StockItemLocation" ("stockItemId", "locationId", "factoryUnitId", quantity)
SELECT si.id, ml."locationId", ml."factoryUnitId", COALESCE(ml.quantity, 0)
FROM sobra_corte."MaterialLocation" ml
JOIN sobra_corte."StockItem" si
  ON si."factoryUnitId" = ml."factoryUnitId" AND si."legacyMaterialId" = ml."materialId"
ON CONFLICT ("stockItemId", "locationId") DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO sobra_corte."StockMovement" (
  "factoryUnitId", "legacyMovementId", "stockItemId", sector, type, quantity,
  "destinationLocationName", "itemCode", "itemName", "itemCategory", "itemUnit",
  origem, reason, "createdAt", "operatorId", "operatorName"
)
SELECT mv."factoryUnitId", mv.id, si.id, 'CORTE',
       CASE lower(mv.type)
         WHEN 'entrada' THEN 'ENTRADA'::sobra_corte."MovementType"
         WHEN 'saida' THEN 'SAIDA'::sobra_corte."MovementType"
         WHEN 'transferencia' THEN 'TRANSFERENCIA'::sobra_corte."MovementType"
         WHEN 'refugo' THEN 'REFUGO'::sobra_corte."MovementType"
         ELSE NULL
       END,
       mv.quantity, mv."locationName", mv."materialCode", mv."materialName",
       mv."materialCategory", mv."materialUnit", mv.origem, mv.reason, mv."createdAt",
       mv."operatorId", mv."operatorName"
FROM sobra_corte."Movement" mv
LEFT JOIN sobra_corte."StockItem" si
  ON si."factoryUnitId" = mv."factoryUnitId" AND si."legacyMaterialId" = mv."materialId"
WHERE lower(mv.type) IN ('entrada', 'saida', 'transferencia', 'refugo')
ON CONFLICT ("factoryUnitId", "legacyMovementId") DO UPDATE SET
  "stockItemId" = EXCLUDED."stockItemId", type = EXCLUDED.type, quantity = EXCLUDED.quantity,
  "destinationLocationName" = EXCLUDED."destinationLocationName",
  "itemCode" = EXCLUDED."itemCode", "itemName" = EXCLUDED."itemName",
  "itemCategory" = EXCLUDED."itemCategory", "itemUnit" = EXCLUDED."itemUnit",
  origem = EXCLUDED.origem, reason = EXCLUDED.reason, "operatorId" = EXCLUDED."operatorId",
  "operatorName" = EXCLUDED."operatorName";
