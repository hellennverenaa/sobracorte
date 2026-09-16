-- Expansion only. Legacy stock tables remain intact until Cycle 8.
ALTER TABLE "sobra_corte"."StockItem" ADD COLUMN "legacyMaterialId" INTEGER;
ALTER TABLE "sobra_corte"."StockMovement" ADD COLUMN "legacyMovementId" INTEGER;

CREATE UNIQUE INDEX "StockItem_factoryUnitId_legacyMaterialId_key"
  ON "sobra_corte"."StockItem"("factoryUnitId", "legacyMaterialId");
CREATE UNIQUE INDEX "StockMovement_factoryUnitId_legacyMovementId_key"
  ON "sobra_corte"."StockMovement"("factoryUnitId", "legacyMovementId");
