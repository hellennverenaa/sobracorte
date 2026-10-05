-- Estrutura aditiva para subsetores: nenhum registro existente recebe vínculo
-- automático. Todas as novas relações operacionais permanecem opcionais.

CREATE TYPE "sobra_corte"."SubsectorCategoryMode" AS ENUM ('ALL', 'SELECTED');

CREATE TABLE "sobra_corte"."SubsectorConfig" (
  "id" SERIAL NOT NULL,
  "factoryUnitId" INTEGER NOT NULL,
  "sector" "sobra_corte"."SectorType" NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "categoryMode" "sobra_corte"."SubsectorCategoryMode" NOT NULL DEFAULT 'ALL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubsectorConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubsectorConfig_name_not_empty_check"
    CHECK (length(btrim("name")) > 0),
  CONSTRAINT "SubsectorConfig_normalized_name_check"
    CHECK (
      "normalizedName" <> ''
      AND "normalizedName" = upper(
        regexp_replace(
          regexp_replace("name", '^[[:space:]]+|[[:space:]]+$', '', 'g'),
          '[[:space:]-]+', '_', 'g'
        )
      )
    ),
  CONSTRAINT "SubsectorConfig_factoryUnitId_fkey"
    FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SubsectorConfig_factoryUnitId_sector_normalizedName_key"
  ON "sobra_corte"."SubsectorConfig"("factoryUnitId", "sector", "normalizedName");
CREATE UNIQUE INDEX "SubsectorConfig_id_factoryUnitId_key"
  ON "sobra_corte"."SubsectorConfig"("id", "factoryUnitId");
CREATE INDEX "SubsectorConfig_factoryUnitId_sector_active_idx"
  ON "sobra_corte"."SubsectorConfig"("factoryUnitId", "sector", "active");

CREATE TABLE "sobra_corte"."UserSubsectorAccess" (
  "bindingId" INTEGER NOT NULL,
  "subsectorId" INTEGER NOT NULL,
  "factoryUnitId" INTEGER NOT NULL,
  CONSTRAINT "UserSubsectorAccess_pkey"
    PRIMARY KEY ("bindingId", "subsectorId", "factoryUnitId"),
  CONSTRAINT "UserSubsectorAccess_factoryUnitId_fkey"
    FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserSubsectorAccess_bindingId_factoryUnitId_fkey"
    FOREIGN KEY ("bindingId", "factoryUnitId")
    REFERENCES "sobra_corte"."UserRoleBinding"("id", "factoryUnitId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserSubsectorAccess_subsectorId_factoryUnitId_fkey"
    FOREIGN KEY ("subsectorId", "factoryUnitId")
    REFERENCES "sobra_corte"."SubsectorConfig"("id", "factoryUnitId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserSubsectorAccess_factoryUnitId_subsectorId_idx"
  ON "sobra_corte"."UserSubsectorAccess"("factoryUnitId", "subsectorId");
CREATE INDEX "UserSubsectorAccess_factoryUnitId_bindingId_idx"
  ON "sobra_corte"."UserSubsectorAccess"("factoryUnitId", "bindingId");

CREATE TABLE "sobra_corte"."SubsectorCategory" (
  "subsectorId" INTEGER NOT NULL,
  "categoryConfigId" INTEGER NOT NULL,
  "factoryUnitId" INTEGER NOT NULL,
  CONSTRAINT "SubsectorCategory_pkey"
    PRIMARY KEY ("subsectorId", "categoryConfigId", "factoryUnitId"),
  CONSTRAINT "SubsectorCategory_factoryUnitId_fkey"
    FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubsectorCategory_subsectorId_factoryUnitId_fkey"
    FOREIGN KEY ("subsectorId", "factoryUnitId")
    REFERENCES "sobra_corte"."SubsectorConfig"("id", "factoryUnitId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubsectorCategory_categoryConfigId_factoryUnitId_fkey"
    FOREIGN KEY ("categoryConfigId", "factoryUnitId")
    REFERENCES "sobra_corte"."CategoryConfig"("id", "factoryUnitId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SubsectorCategory_factoryUnitId_categoryConfigId_idx"
  ON "sobra_corte"."SubsectorCategory"("factoryUnitId", "categoryConfigId");

ALTER TABLE "sobra_corte"."Location"
  ADD COLUMN "subsectorId" INTEGER;
ALTER TABLE "sobra_corte"."StockItem"
  ADD COLUMN "subsectorId" INTEGER;
ALTER TABLE "sobra_corte"."StockMovement"
  ADD COLUMN "subsectorId" INTEGER;

CREATE INDEX "Location_factoryUnitId_subsectorId_idx"
  ON "sobra_corte"."Location"("factoryUnitId", "subsectorId");
CREATE INDEX "StockItem_factoryUnitId_subsectorId_createdAt_idx"
  ON "sobra_corte"."StockItem"("factoryUnitId", "subsectorId", "createdAt" DESC);
CREATE INDEX "StockMovement_factoryUnitId_subsectorId_createdAt_idx"
  ON "sobra_corte"."StockMovement"("factoryUnitId", "subsectorId", "createdAt" DESC);

ALTER TABLE "sobra_corte"."Location"
  ADD CONSTRAINT "Location_subsectorId_factoryUnitId_fkey"
  FOREIGN KEY ("subsectorId", "factoryUnitId")
  REFERENCES "sobra_corte"."SubsectorConfig"("id", "factoryUnitId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."StockItem"
  ADD CONSTRAINT "StockItem_subsectorId_factoryUnitId_fkey"
  FOREIGN KEY ("subsectorId", "factoryUnitId")
  REFERENCES "sobra_corte"."SubsectorConfig"("id", "factoryUnitId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."StockMovement"
  ADD CONSTRAINT "StockMovement_subsectorId_factoryUnitId_fkey"
  FOREIGN KEY ("subsectorId", "factoryUnitId")
  REFERENCES "sobra_corte"."SubsectorConfig"("id", "factoryUnitId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
