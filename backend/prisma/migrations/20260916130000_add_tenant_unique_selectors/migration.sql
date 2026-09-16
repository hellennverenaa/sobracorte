-- Supports tenant-scoped singular operations without relying on a global id.
CREATE UNIQUE INDEX "User_id_factoryUnitId_key"
ON "sobra_corte"."User"("id", "factoryUnitId");

CREATE UNIQUE INDEX "MaterialRequisition_id_factoryUnitId_key"
ON "sobra_corte"."MaterialRequisition"("id", "factoryUnitId");

CREATE UNIQUE INDEX "MaterialLocation_materialId_locationId_factoryUnitId_key"
ON "sobra_corte"."MaterialLocation"("materialId", "locationId", "factoryUnitId");
