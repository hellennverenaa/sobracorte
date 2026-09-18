-- Upgrade after the production history through 20260913000000.
-- Alinha detalhes que permaneceram divergentes entre o histórico de migrations
-- e o schema Prisma após a reconciliação estrutural.
BEGIN;

ALTER TABLE "sobra_corte"."StockItem"
    ALTER COLUMN "quantity" SET DEFAULT 0;

ALTER TABLE "sobra_corte"."MaterialRequisition"
    ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "sobra_corte"."StockItem"
    ALTER COLUMN "updatedAt" DROP DEFAULT;

DROP INDEX IF EXISTS "sobra_corte"."StockItem_factoryUnitId_sector_sku_sizeGrade_footSide_idx";

CREATE INDEX IF NOT EXISTS "StockItem_factoryUnitId_sector_sku_sizeGrade_color_footSide_idx"
    ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "sku", "sizeGrade", "color", "footSide");

-- Production followed a parallel migration line where the stock item used relations
-- to CategoryConfig and UnitConfig. Preserve their values in the textual
-- columns consumed by the current application before removing the legacy
-- relation columns.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'sobra_corte'
          AND table_name = 'StockItem'
          AND column_name = 'categoryId'
    ) THEN
        ALTER TABLE "sobra_corte"."StockItem"
            ADD COLUMN IF NOT EXISTS "type" TEXT,
            ADD COLUMN IF NOT EXISTS "unit" TEXT;

        UPDATE "sobra_corte"."StockItem" material
        SET "type" = category."name",
            "unit" = unit_config."symbol"
        FROM "sobra_corte"."CategoryConfig" category,
             "sobra_corte"."UnitConfig" unit_config
        WHERE category."id" = material."categoryId"
          AND category."factoryUnitId" = material."factoryUnitId"
          AND unit_config."id" = material."unitId"
          AND unit_config."factoryUnitId" = material."factoryUnitId";

        IF EXISTS (
            SELECT 1 FROM "sobra_corte"."StockItem"
            WHERE "type" IS NULL OR "unit" IS NULL
        ) THEN
            RAISE EXCEPTION 'Não foi possível converter categoryId/unitId de todos os materiais';
        END IF;

        ALTER TABLE "sobra_corte"."StockItem"
            ALTER COLUMN "type" DROP NOT NULL,
            ALTER COLUMN "unit" DROP NOT NULL,
            DROP COLUMN "categoryId",
            DROP COLUMN "unitId";
    END IF;
END $$;

-- Preserve the textual movement origin used by the current API before
-- removing the obsolete relational origin/location fields.
ALTER TABLE "sobra_corte"."StockMovement"
    ADD COLUMN IF NOT EXISTS "origem" TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'sobra_corte'
          AND table_name = 'StockMovement'
          AND column_name = 'originId'
    ) THEN
        UPDATE "sobra_corte"."StockMovement" movement
        SET "origem" = COALESCE(
            movement."origem",
            movement."originName",
            origin_config."name"
        )
        FROM "sobra_corte"."OriginConfig" origin_config
        WHERE origin_config."id" = movement."originId"
          AND origin_config."factoryUnitId" = movement."factoryUnitId";

        UPDATE "sobra_corte"."StockMovement"
        SET "origem" = COALESCE("origem", "originName")
        WHERE "origem" IS NULL;

        ALTER TABLE "sobra_corte"."StockMovement"
            DROP COLUMN "locationId",
            DROP COLUMN "originId",
            DROP COLUMN "originName";
    END IF;
END $$;

ALTER TABLE "sobra_corte"."StockMovement"
    ALTER COLUMN "itemCode" DROP NOT NULL,
    ALTER COLUMN "itemName" DROP NOT NULL,
    ALTER COLUMN "itemCategory" DROP NOT NULL,
    ALTER COLUMN "itemUnit" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "StockItem_factoryUnitId_type_idx"
    ON "sobra_corte"."StockItem"("factoryUnitId", "type");
CREATE INDEX IF NOT EXISTS "StockMovement_factoryUnitId_origem_createdAt_idx"
    ON "sobra_corte"."StockMovement"("factoryUnitId", "origem", "createdAt");

DROP INDEX IF EXISTS "sobra_corte"."CategoryConfig_name_key";
DROP INDEX IF EXISTS "sobra_corte"."OriginConfig_name_key";
DROP INDEX IF EXISTS "sobra_corte"."CategoryConfig_name_idx";
DROP INDEX IF EXISTS "sobra_corte"."OriginConfig_name_idx";

CREATE INDEX IF NOT EXISTS "Location_factoryUnitId_categoryId_idx"
    ON "sobra_corte"."Location"("factoryUnitId", "categoryId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Location_categoryId_factoryUnitId_fkey'
          AND connamespace = 'sobra_corte'::regnamespace
    ) THEN
        ALTER TABLE "sobra_corte"."Location"
            ADD CONSTRAINT "Location_categoryId_factoryUnitId_fkey"
            FOREIGN KEY ("categoryId", "factoryUnitId")
            REFERENCES "sobra_corte"."CategoryConfig"("id", "factoryUnitId")
            ON DELETE NO ACTION ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'LocationCategory_factoryUnitId_fkey'
          AND connamespace = 'sobra_corte'::regnamespace
    ) THEN
        ALTER TABLE "sobra_corte"."LocationCategory"
            ADD CONSTRAINT "LocationCategory_factoryUnitId_fkey"
            FOREIGN KEY ("factoryUnitId")
            REFERENCES "sobra_corte"."FactoryUnit"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "sobra_corte"."StockItemLocation"
    ALTER COLUMN "quantity" SET NOT NULL;

ALTER TABLE "sobra_corte"."StockItemLocation"
    DROP CONSTRAINT IF EXISTS "StockItemLocation_locationId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockItemLocation"
    ADD CONSTRAINT "StockItemLocation_locationId_factoryUnitId_fkey"
    FOREIGN KEY ("locationId", "factoryUnitId")
    REFERENCES "sobra_corte"."Location"("id", "factoryUnitId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."MaterialDeletionAudit"
    ALTER COLUMN "materialId" SET NOT NULL,
    ALTER COLUMN "categoryName" DROP NOT NULL,
    ALTER COLUMN "locations" DROP NOT NULL,
    ALTER COLUMN "deletedByName" SET NOT NULL;
DROP INDEX IF EXISTS "sobra_corte"."MaterialDeletionAudit_factoryUnitId_materialId_idx";

ALTER TABLE "sobra_corte"."RoleChangeAudit"
    ADD COLUMN IF NOT EXISTS "previousSector" "sobra_corte"."SectorType",
    ADD COLUMN IF NOT EXISTS "newSector" "sobra_corte"."SectorType";
UPDATE "sobra_corte"."RoleChangeAudit"
SET "changedByName" = 'NÃO IDENTIFICADO'
WHERE "changedByName" IS NULL;
ALTER TABLE "sobra_corte"."RoleChangeAudit"
    ALTER COLUMN "changedByName" SET NOT NULL;
DROP INDEX IF EXISTS "sobra_corte"."RoleChangeAudit_factoryUnitId_changedAt_idx";
DROP INDEX IF EXISTS "sobra_corte"."RoleChangeAudit_factoryUnitId_userId_changedAt_idx";
CREATE INDEX IF NOT EXISTS "RoleChangeAudit_factoryUnitId_userId_idx"
    ON "sobra_corte"."RoleChangeAudit"("factoryUnitId", "userId");
CREATE INDEX IF NOT EXISTS "RoleChangeAudit_factoryUnitId_changedAt_idx"
    ON "sobra_corte"."RoleChangeAudit"("factoryUnitId", "changedAt" DESC);

ALTER TABLE "sobra_corte"."User"
    ADD COLUMN IF NOT EXISTS "authOrigin" TEXT,
    ADD COLUMN IF NOT EXISTS "authUserId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_factoryUnitId_authOrigin_authUserId_key"
    ON "sobra_corte"."User"("factoryUnitId", "authOrigin", "authUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_factoryUnitId_matriculaDass_key"
    ON "sobra_corte"."User"("factoryUnitId", "matriculaDass");

COMMIT;
