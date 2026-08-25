-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE "sobra_corte"."SectorType" AS ENUM ('CORTE', 'APOIO', 'PRE_FABRICADO', 'EXPEDICAO', 'MONTAGEM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "sobra_corte"."ComponentType" AS ENUM ('MATERIA_PRIMA', 'PECA_CORTADA', 'SOLADO', 'CABEDAL', 'PE_PRONTO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "sobra_corte"."FootSide" AS ENUM ('E', 'D');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "sobra_corte"."MovementType" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'REFUGO', 'CASAMENTO_PAR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Table StockItem (Unified 5 Industrial Sectors)
CREATE TABLE IF NOT EXISTS "sobra_corte"."StockItem" (
    "id" SERIAL NOT NULL,
    "factoryUnitId" INTEGER NOT NULL,
    "sector" "sobra_corte"."SectorType" NOT NULL DEFAULT 'CORTE',
    "componentType" "sobra_corte"."ComponentType",
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observation" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT,
    "name" TEXT,
    "unit" TEXT,
    "type" TEXT,
    "minStock" DOUBLE PRECISION DEFAULT 0,
    "pieceCode" TEXT,
    "description" TEXT,
    "materialColor" TEXT,
    "productName" TEXT,
    "sku" TEXT,
    "color" TEXT,
    "sizeGrade" TEXT,
    "footSide" "sobra_corte"."FootSide",

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- 3. Create Table StockItemLocation
CREATE TABLE IF NOT EXISTS "sobra_corte"."StockItemLocation" (
    "stockItemId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "factoryUnitId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "StockItemLocation_pkey" PRIMARY KEY ("stockItemId","locationId")
);

-- 4. Create Table StockMovement (Audit & Traceability)
CREATE TABLE IF NOT EXISTS "sobra_corte"."StockMovement" (
    "id" SERIAL NOT NULL,
    "factoryUnitId" INTEGER NOT NULL,
    "stockItemId" INTEGER NOT NULL,
    "sector" "sobra_corte"."SectorType" NOT NULL,
    "type" "sobra_corte"."MovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "sourceLocationId" INTEGER,
    "destinationLocationId" INTEGER,
    "origem" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT,
    "operatorName" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- 5. Indexes for StockItem
CREATE UNIQUE INDEX IF NOT EXISTS "StockItem_id_factoryUnitId_key" ON "sobra_corte"."StockItem"("id", "factoryUnitId");
CREATE INDEX IF NOT EXISTS "StockItem_factoryUnitId_sector_createdAt_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "StockItem_factoryUnitId_sector_productName_sizeGrade_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "productName", "sizeGrade");
CREATE INDEX IF NOT EXISTS "StockItem_factoryUnitId_sector_sku_sizeGrade_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "sku", "sizeGrade");
CREATE INDEX IF NOT EXISTS "StockItem_factoryUnitId_sector_sku_sizeGrade_footSide_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "sku", "sizeGrade", "footSide");
CREATE INDEX IF NOT EXISTS "StockItem_factoryUnitId_sector_pieceCode_idx" ON "sobra_corte"."StockItem"("factoryUnitId", "sector", "pieceCode");

-- 6. Indexes for StockItemLocation
CREATE UNIQUE INDEX IF NOT EXISTS "StockItemLocation_stockItemId_locationId_factoryUnitId_key" ON "sobra_corte"."StockItemLocation"("stockItemId", "locationId", "factoryUnitId");
CREATE INDEX IF NOT EXISTS "StockItemLocation_factoryUnitId_locationId_idx" ON "sobra_corte"."StockItemLocation"("factoryUnitId", "locationId");

-- 7. Indexes for StockMovement
CREATE INDEX IF NOT EXISTS "StockMovement_factoryUnitId_stockItemId_idx" ON "sobra_corte"."StockMovement"("factoryUnitId", "stockItemId");
CREATE INDEX IF NOT EXISTS "StockMovement_factoryUnitId_sector_createdAt_idx" ON "sobra_corte"."StockMovement"("factoryUnitId", "sector", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "StockMovement_factoryUnitId_operatorId_createdAt_idx" ON "sobra_corte"."StockMovement"("factoryUnitId", "operatorId", "createdAt");

-- 8. Foreign Key Constraints
ALTER TABLE "sobra_corte"."StockItem" DROP CONSTRAINT IF EXISTS "StockItem_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockItem" ADD CONSTRAINT "StockItem_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."StockItemLocation" DROP CONSTRAINT IF EXISTS "StockItemLocation_stockItemId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockItemLocation" ADD CONSTRAINT "StockItemLocation_stockItemId_factoryUnitId_fkey" FOREIGN KEY ("stockItemId", "factoryUnitId") REFERENCES "sobra_corte"."StockItem"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."StockItemLocation" DROP CONSTRAINT IF EXISTS "StockItemLocation_locationId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockItemLocation" ADD CONSTRAINT "StockItemLocation_locationId_factoryUnitId_fkey" FOREIGN KEY ("locationId", "factoryUnitId") REFERENCES "sobra_corte"."Location"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."StockItemLocation" DROP CONSTRAINT IF EXISTS "StockItemLocation_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockItemLocation" ADD CONSTRAINT "StockItemLocation_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockMovement" ADD CONSTRAINT "StockMovement_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_stockItemId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_factoryUnitId_fkey" FOREIGN KEY ("stockItemId", "factoryUnitId") REFERENCES "sobra_corte"."StockItem"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Idempotent Unit Seeding (SEST, STJ, ITB, VDC, ITP)
INSERT INTO "sobra_corte"."FactoryUnit" ("code", "name", "active") VALUES
    ('SEST', 'Santo Estêvão', true),
    ('STJ',  'Santo Antônio de Jesus', true),
    ('ITB',  'Itaberaba', true),
    ('VDC',  'Vitória da Conquista', true),
    ('ITP',  'Itapipoca', true)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "active" = EXCLUDED."active";

-- 10. Replicate Default Configuration from SEST to other units
DO $$
DECLARE
    u_code TEXT;
    target_unit_id INT;
    sest_unit_id INT;
BEGIN
    SELECT "id" INTO sest_unit_id FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST';

    IF sest_unit_id IS NOT NULL THEN
        FOR u_code IN SELECT unnest(ARRAY['ITB', 'VDC', 'ITP', 'STJ']) LOOP
            SELECT "id" INTO target_unit_id FROM "sobra_corte"."FactoryUnit" WHERE "code" = u_code;

            IF target_unit_id IS NOT NULL THEN
                -- A. UnitConfig
                INSERT INTO "sobra_corte"."UnitConfig" ("name", "symbol", "active", "factoryUnitId")
                SELECT u."name", u."symbol", u."active", target_unit_id
                FROM "sobra_corte"."UnitConfig" u
                WHERE u."factoryUnitId" = sest_unit_id
                  AND NOT EXISTS (
                    SELECT 1 FROM "sobra_corte"."UnitConfig" ex
                    WHERE ex."factoryUnitId" = target_unit_id AND ex."symbol" = u."symbol"
                  );

                -- B. CategoryConfig
                INSERT INTO "sobra_corte"."CategoryConfig" ("name", "unitLock", "unitLocked", "defaultUnitId", "factoryUnitId")
                SELECT c."name", c."unitLock", c."unitLocked", tu."id", target_unit_id
                FROM "sobra_corte"."CategoryConfig" c
                LEFT JOIN "sobra_corte"."UnitConfig" su ON su."id" = c."defaultUnitId"
                LEFT JOIN "sobra_corte"."UnitConfig" tu ON tu."factoryUnitId" = target_unit_id AND tu."symbol" = su."symbol"
                WHERE c."factoryUnitId" = sest_unit_id
                  AND NOT EXISTS (
                    SELECT 1 FROM "sobra_corte"."CategoryConfig" ex
                    WHERE ex."factoryUnitId" = target_unit_id AND ex."name" = c."name"
                  );

                -- C. Location
                INSERT INTO "sobra_corte"."Location" ("name", "categoryId", "factoryUnitId")
                SELECT l."name", tc."id", target_unit_id
                FROM "sobra_corte"."Location" l
                LEFT JOIN "sobra_corte"."CategoryConfig" sc ON sc."id" = l."categoryId"
                LEFT JOIN "sobra_corte"."CategoryConfig" tc ON tc."factoryUnitId" = target_unit_id AND tc."name" = sc."name"
                WHERE l."factoryUnitId" = sest_unit_id
                  AND NOT EXISTS (
                    SELECT 1 FROM "sobra_corte"."Location" ex
                    WHERE ex."factoryUnitId" = target_unit_id AND ex."name" = l."name"
                  );

                -- D. OriginConfig
                INSERT INTO "sobra_corte"."OriginConfig" ("name", "factoryUnitId")
                SELECT o."name", target_unit_id
                FROM "sobra_corte"."OriginConfig" o
                WHERE o."factoryUnitId" = sest_unit_id
                  AND NOT EXISTS (
                    SELECT 1 FROM "sobra_corte"."OriginConfig" ex
                    WHERE ex."factoryUnitId" = target_unit_id AND ex."name" = o."name"
                  );
            END IF;
        END LOOP;
    END IF;
END $$;
