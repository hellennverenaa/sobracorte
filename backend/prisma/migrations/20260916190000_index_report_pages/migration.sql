-- EXPLAIN on 10k synthetic rows showed tenant-wide scans and top-N sorts.
-- Match the deterministic ordering of report pages across all sectors.
CREATE INDEX "StockItem_factoryUnitId_createdAt_id_idx"
  ON "sobra_corte"."StockItem" ("factoryUnitId", "createdAt" DESC, "id" DESC);
CREATE INDEX "StockMovement_factoryUnitId_createdAt_id_idx"
  ON "sobra_corte"."StockMovement" ("factoryUnitId", "createdAt" DESC, "id" DESC);
