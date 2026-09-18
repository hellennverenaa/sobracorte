-- Supports tenant-scoped singular operations without relying on a global id.
CREATE UNIQUE INDEX "User_id_factoryUnitId_key"
ON "sobra_corte"."User"("id", "factoryUnitId");

CREATE UNIQUE INDEX "MaterialRequisition_id_factoryUnitId_key"
ON "sobra_corte"."MaterialRequisition"("id", "factoryUnitId");

-- O seletor composto de StockItemLocation já é criado na migration de
-- consolidação do estoque.
