-- Upgrade in-place after the production history through 20260913000000.
-- Existing stock rows keep their ids; no data is copied to parallel tables.
BEGIN;

ALTER TABLE "sobra_corte"."CategoryConfig"
  ADD COLUMN IF NOT EXISTS "unitLock" TEXT NOT NULL DEFAULT 'livre';
ALTER TABLE "sobra_corte"."Location"
  ADD COLUMN IF NOT EXISTS "categoryId" INTEGER;

DO $$ BEGIN
  CREATE TYPE "sobra_corte"."SectorType" AS ENUM ('CORTE', 'APOIO', 'PRE_FABRICADO', 'EXPEDICAO', 'MONTAGEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "sobra_corte"."ComponentType" AS ENUM ('MATERIA_PRIMA', 'PECA_CORTADA', 'SOLADO', 'CABEDAL', 'PE_PRONTO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "sobra_corte"."FootSide" AS ENUM ('E', 'D');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "sobra_corte"."MovementType" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'REFUGO', 'CASAMENTO_PAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fail before changing the schema if production contains an unknown legacy type.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "sobra_corte"."Movement"
    WHERE lower(trim("type")) NOT IN ('entrada', 'saida', 'transferencia', 'refugo')
  ) THEN
    RAISE EXCEPTION 'Movement contém tipo histórico incompatível com MovementType';
  END IF;
END $$;

-- Keep the original objects and rows, changing only their canonical names.
ALTER TABLE "sobra_corte"."Material" RENAME TO "StockItem";
ALTER TABLE "sobra_corte"."MaterialLocation" RENAME TO "StockItemLocation";
ALTER TABLE "sobra_corte"."Movement" RENAME TO "StockMovement";
ALTER TABLE "sobra_corte"."StockItemLocation" RENAME COLUMN "materialId" TO "stockItemId";
ALTER TABLE "sobra_corte"."StockMovement" RENAME COLUMN "materialId" TO "stockItemId";
ALTER TABLE "sobra_corte"."StockMovement" RENAME COLUMN "materialCode" TO "itemCode";
ALTER TABLE "sobra_corte"."StockMovement" RENAME COLUMN "materialName" TO "itemName";
ALTER TABLE "sobra_corte"."StockMovement" RENAME COLUMN "materialCategory" TO "itemCategory";
ALTER TABLE "sobra_corte"."StockMovement" RENAME COLUMN "materialUnit" TO "itemUnit";
ALTER TABLE "sobra_corte"."StockMovement" RENAME COLUMN "locationName" TO "destinationLocationName";

ALTER TABLE "sobra_corte"."StockItem"
  ADD COLUMN IF NOT EXISTS "unit" TEXT,
  ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "sobra_corte"."StockItem"
  ADD COLUMN "sector" "sobra_corte"."SectorType" NOT NULL DEFAULT 'CORTE',
  ADD COLUMN "componentType" "sobra_corte"."ComponentType" DEFAULT 'MATERIA_PRIMA',
  ADD COLUMN "pieceCode" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "materialColor" TEXT,
  ADD COLUMN "productName" TEXT,
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "color" TEXT,
  ADD COLUMN "sizeGrade" TEXT,
  ADD COLUMN "footSide" "sobra_corte"."FootSide",
  ALTER COLUMN "code" DROP NOT NULL,
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "unit" DROP NOT NULL,
  ALTER COLUMN "type" DROP NOT NULL,
  ALTER COLUMN "minStock" DROP NOT NULL;

UPDATE "sobra_corte"."StockItem"
SET "sector" = 'CORTE', "componentType" = 'MATERIA_PRIMA';

UPDATE "sobra_corte"."StockItemLocation" SET "quantity" = 0 WHERE "quantity" IS NULL;
ALTER TABLE "sobra_corte"."StockItemLocation" ALTER COLUMN "quantity" SET NOT NULL;

ALTER TABLE "sobra_corte"."StockMovement"
  ADD COLUMN "sector" "sobra_corte"."SectorType" NOT NULL DEFAULT 'CORTE',
  ADD COLUMN "sourceLocationId" INTEGER,
  ADD COLUMN "destinationLocationId" INTEGER,
  ADD COLUMN "sourceLocationName" TEXT;
ALTER TABLE "sobra_corte"."StockMovement" DROP CONSTRAINT IF EXISTS "Movement_type_valid";
ALTER TABLE "sobra_corte"."StockMovement"
  ALTER COLUMN "type" TYPE "sobra_corte"."MovementType"
  USING upper(trim("type"))::"sobra_corte"."MovementType";
ALTER TABLE "sobra_corte"."StockMovement" ALTER COLUMN "sector" DROP DEFAULT;

-- The legacy location is the destination for entries and the source for exits.
-- A single location cannot identify both endpoints of a historical transfer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "sobra_corte"."StockMovement"
    WHERE "type" = 'TRANSFERENCIA'
      AND ("locationId" IS NOT NULL OR "destinationLocationName" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Transferência histórica com localização sem direção definida; revise antes do deploy';
  END IF;
END $$;

UPDATE "sobra_corte"."StockMovement"
SET "destinationLocationId" = "locationId"
WHERE "type" = 'ENTRADA';

UPDATE "sobra_corte"."StockMovement"
SET "sourceLocationId" = "locationId",
    "sourceLocationName" = "destinationLocationName",
    "destinationLocationName" = NULL
WHERE "type" IN ('SAIDA', 'REFUGO');

ALTER TABLE "sobra_corte"."StockItem" RENAME CONSTRAINT "Material_pkey" TO "StockItem_pkey";
ALTER TABLE "sobra_corte"."StockItemLocation" RENAME CONSTRAINT "MaterialLocation_pkey" TO "StockItemLocation_pkey";
ALTER TABLE "sobra_corte"."StockMovement" RENAME CONSTRAINT "Movement_pkey" TO "StockMovement_pkey";

-- Replace legacy constraints with canonical tenant-safe constraints.
ALTER TABLE "sobra_corte"."StockItemLocation"
  DROP CONSTRAINT IF EXISTS "MaterialLocation_materialId_factoryUnitId_fkey",
  DROP CONSTRAINT IF EXISTS "MaterialLocation_locationId_factoryUnitId_fkey",
  DROP CONSTRAINT IF EXISTS "MaterialLocation_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockMovement"
  DROP CONSTRAINT IF EXISTS "Movement_materialId_factoryUnitId_fkey",
  DROP CONSTRAINT IF EXISTS "Movement_materialId_fkey",
  DROP CONSTRAINT IF EXISTS "Movement_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockItem"
  DROP CONSTRAINT IF EXISTS "Material_factoryUnitId_fkey";

ALTER TABLE "sobra_corte"."StockItem"
  ADD CONSTRAINT "StockItem_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."StockItemLocation"
  ADD CONSTRAINT "StockItemLocation_stockItemId_factoryUnitId_fkey" FOREIGN KEY ("stockItemId", "factoryUnitId") REFERENCES "sobra_corte"."StockItem"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StockItemLocation_locationId_factoryUnitId_fkey" FOREIGN KEY ("locationId", "factoryUnitId") REFERENCES "sobra_corte"."Location"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StockItemLocation_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."StockMovement"
  ADD CONSTRAINT "StockMovement_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "sobra_corte"."StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER INDEX "sobra_corte"."Material_factoryUnitId_code_key" RENAME TO "StockItem_factoryUnitId_code_key";
ALTER INDEX "sobra_corte"."Material_id_factoryUnitId_key" RENAME TO "StockItem_id_factoryUnitId_key";
ALTER INDEX "sobra_corte"."Material_factoryUnitId_name_idx" RENAME TO "StockItem_factoryUnitId_name_idx";
ALTER INDEX "sobra_corte"."Material_factoryUnitId_quantity_idx" RENAME TO "StockItem_factoryUnitId_quantity_idx";
ALTER INDEX "sobra_corte"."Material_code_trgm_idx" RENAME TO "StockItem_code_idx";
ALTER INDEX "sobra_corte"."Material_name_trgm_idx" RENAME TO "StockItem_name_idx";
CREATE UNIQUE INDEX "StockItemLocation_stockItemId_locationId_factoryUnitId_key" ON "sobra_corte"."StockItemLocation"("stockItemId", "locationId", "factoryUnitId");
CREATE INDEX "StockItem_factoryUnitId_sector_createdAt_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "createdAt" DESC);
CREATE INDEX "StockItem_factoryUnitId_sector_productName_sizeGrade_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "productName", "sizeGrade");
CREATE INDEX "StockItem_factoryUnitId_sector_sku_sizeGrade_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "sku", "sizeGrade");
CREATE INDEX "StockItem_factoryUnitId_sector_sku_sizeGrade_footSide_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "sku", "sizeGrade", "footSide");
CREATE INDEX "StockItem_factoryUnitId_sector_pieceCode_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "pieceCode");
CREATE INDEX "StockItemLocation_factoryUnitId_locationId_idx" ON "sobra_corte"."StockItemLocation"("factoryUnitId", "locationId");
CREATE INDEX "StockMovement_factoryUnitId_stockItemId_idx" ON "sobra_corte"."StockMovement"("factoryUnitId", "stockItemId");
CREATE INDEX "StockMovement_factoryUnitId_sector_createdAt_idx" ON "sobra_corte"."StockMovement"("factoryUnitId", "sector", "createdAt" DESC);
CREATE INDEX "StockMovement_factoryUnitId_operatorId_createdAt_idx" ON "sobra_corte"."StockMovement"("factoryUnitId", "operatorId", "createdAt");
DROP INDEX IF EXISTS "sobra_corte"."Movement_factoryUnitId_createdAt_idx";
DROP INDEX IF EXISTS "sobra_corte"."Movement_factoryUnitId_origem_createdAt_idx";

-- Preserve existing factories and provision only shared configuration.
INSERT INTO "sobra_corte"."FactoryUnit" ("code", "name", "active") VALUES
  ('SEST', 'Santo Estêvão', true), ('SAJ', 'Santo Antônio de Jesus', true),
  ('ITB', 'Itaberaba', true), ('VDC', 'Vitória da Conquista', true), ('ITP', 'Itapipoca', true)
ON CONFLICT ("code") DO NOTHING;

COMMIT;
