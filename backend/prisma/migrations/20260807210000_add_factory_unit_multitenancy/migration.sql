-- Introduce row-level multi-tenancy. Existing application data belongs to SEST.
CREATE TABLE IF NOT EXISTS "sobra_corte"."FactoryUnit" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FactoryUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FactoryUnit_code_key" ON "sobra_corte"."FactoryUnit"("code");

INSERT INTO "sobra_corte"."FactoryUnit" ("code", "name", "active") VALUES
    ('SEST', 'Santo Estêvão', true),
    ('STJ', 'Santo Antônio de Jesus', true)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "active" = EXCLUDED."active";

ALTER TABLE "sobra_corte"."Material" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;
ALTER TABLE "sobra_corte"."Location" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;
ALTER TABLE "sobra_corte"."MaterialLocation" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;
ALTER TABLE "sobra_corte"."Movement" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;
ALTER TABLE "sobra_corte"."User" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;
ALTER TABLE "sobra_corte"."UnitConfig" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;
ALTER TABLE "sobra_corte"."CategoryConfig" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;
ALTER TABLE "sobra_corte"."OriginConfig" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;

UPDATE "sobra_corte"."Material" SET "factoryUnitId" = (SELECT "id" FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST') WHERE "factoryUnitId" IS NULL;
UPDATE "sobra_corte"."Location" SET "factoryUnitId" = (SELECT "id" FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST') WHERE "factoryUnitId" IS NULL;
UPDATE "sobra_corte"."Movement" SET "factoryUnitId" = (SELECT "id" FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST') WHERE "factoryUnitId" IS NULL;
UPDATE "sobra_corte"."User" SET "factoryUnitId" = (SELECT "id" FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST') WHERE "factoryUnitId" IS NULL;
UPDATE "sobra_corte"."UnitConfig" SET "factoryUnitId" = (SELECT "id" FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST') WHERE "factoryUnitId" IS NULL;
UPDATE "sobra_corte"."CategoryConfig" SET "factoryUnitId" = (SELECT "id" FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST') WHERE "factoryUnitId" IS NULL;
UPDATE "sobra_corte"."OriginConfig" SET "factoryUnitId" = (SELECT "id" FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST') WHERE "factoryUnitId" IS NULL;
UPDATE "sobra_corte"."MaterialLocation" ml
SET "factoryUnitId" = m."factoryUnitId"
FROM "sobra_corte"."Material" m
WHERE m."id" = ml."materialId" AND ml."factoryUnitId" IS NULL;

-- Remove global uniqueness before inserting equivalent STJ configuration.
-- The replacement tenant-scoped unique indexes are created after validation.
DROP INDEX IF EXISTS "sobra_corte"."Material_code_key";
DROP INDEX IF EXISTS "sobra_corte"."Location_name_key";
DROP INDEX IF EXISTS "sobra_corte"."User_usuario_key";
DROP INDEX IF EXISTS "sobra_corte"."User_email_key";
DROP INDEX IF EXISTS "sobra_corte"."User_matriculaDass_key";
DROP INDEX IF EXISTS "sobra_corte"."UnitConfig_symbol_key";
DROP INDEX IF EXISTS "sobra_corte"."CategoryConfig_name_key";
DROP INDEX IF EXISTS "sobra_corte"."OriginConfig_name_key";

-- Clone only tenant configuration from SEST to STJ.
INSERT INTO "sobra_corte"."UnitConfig" ("name", "symbol", "active", "factoryUnitId")
SELECT u."name", u."symbol", u."active", stj."id"
FROM "sobra_corte"."UnitConfig" u
JOIN "sobra_corte"."FactoryUnit" sest ON sest."id" = u."factoryUnitId" AND sest."code" = 'SEST'
CROSS JOIN "sobra_corte"."FactoryUnit" stj
WHERE stj."code" = 'STJ'
  AND NOT EXISTS (
    SELECT 1 FROM "sobra_corte"."UnitConfig" existing
    WHERE existing."factoryUnitId" = stj."id" AND existing."symbol" = u."symbol"
  );

INSERT INTO "sobra_corte"."CategoryConfig" ("name", "unitLock", "unitLocked", "defaultUnitId", "factoryUnitId")
SELECT c."name", c."unitLock", c."unitLocked", stj_unit."id", stj."id"
FROM "sobra_corte"."CategoryConfig" c
JOIN "sobra_corte"."FactoryUnit" sest ON sest."id" = c."factoryUnitId" AND sest."code" = 'SEST'
CROSS JOIN "sobra_corte"."FactoryUnit" stj
LEFT JOIN "sobra_corte"."UnitConfig" sest_unit ON sest_unit."id" = c."defaultUnitId"
LEFT JOIN "sobra_corte"."UnitConfig" stj_unit
  ON stj_unit."factoryUnitId" = stj."id" AND stj_unit."symbol" = sest_unit."symbol"
WHERE stj."code" = 'STJ'
  AND NOT EXISTS (
    SELECT 1 FROM "sobra_corte"."CategoryConfig" existing
    WHERE existing."factoryUnitId" = stj."id" AND existing."name" = c."name"
  );

INSERT INTO "sobra_corte"."Location" ("name", "categoryId", "factoryUnitId")
SELECT l."name", stj_category."id", stj."id"
FROM "sobra_corte"."Location" l
JOIN "sobra_corte"."FactoryUnit" sest ON sest."id" = l."factoryUnitId" AND sest."code" = 'SEST'
CROSS JOIN "sobra_corte"."FactoryUnit" stj
LEFT JOIN "sobra_corte"."CategoryConfig" sest_category ON sest_category."id" = l."categoryId"
LEFT JOIN "sobra_corte"."CategoryConfig" stj_category
  ON stj_category."factoryUnitId" = stj."id" AND stj_category."name" = sest_category."name"
WHERE stj."code" = 'STJ'
  AND NOT EXISTS (
    SELECT 1 FROM "sobra_corte"."Location" existing
    WHERE existing."factoryUnitId" = stj."id" AND existing."name" = l."name"
  );

INSERT INTO "sobra_corte"."OriginConfig" ("name", "factoryUnitId")
SELECT o."name", stj."id"
FROM "sobra_corte"."OriginConfig" o
JOIN "sobra_corte"."FactoryUnit" sest ON sest."id" = o."factoryUnitId" AND sest."code" = 'SEST'
CROSS JOIN "sobra_corte"."FactoryUnit" stj
WHERE stj."code" = 'STJ'
  AND NOT EXISTS (
    SELECT 1 FROM "sobra_corte"."OriginConfig" existing
    WHERE existing."factoryUnitId" = stj."id" AND existing."name" = o."name"
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "sobra_corte"."MaterialLocation" ml
    JOIN "sobra_corte"."Location" l ON l."id" = ml."locationId"
    WHERE ml."factoryUnitId" IS NULL OR ml."factoryUnitId" <> l."factoryUnitId"
  ) THEN
    RAISE EXCEPTION 'Backfill produziu relações MaterialLocation entre unidades diferentes';
  END IF;
END $$;

ALTER TABLE "sobra_corte"."Material" ALTER COLUMN "factoryUnitId" SET NOT NULL;
ALTER TABLE "sobra_corte"."Location" ALTER COLUMN "factoryUnitId" SET NOT NULL;
ALTER TABLE "sobra_corte"."MaterialLocation" ALTER COLUMN "factoryUnitId" SET NOT NULL;
ALTER TABLE "sobra_corte"."Movement" ALTER COLUMN "factoryUnitId" SET NOT NULL;
ALTER TABLE "sobra_corte"."User" ALTER COLUMN "factoryUnitId" SET NOT NULL;
ALTER TABLE "sobra_corte"."UnitConfig" ALTER COLUMN "factoryUnitId" SET NOT NULL;
ALTER TABLE "sobra_corte"."CategoryConfig" ALTER COLUMN "factoryUnitId" SET NOT NULL;
ALTER TABLE "sobra_corte"."OriginConfig" ALTER COLUMN "factoryUnitId" SET NOT NULL;

DROP INDEX IF EXISTS "sobra_corte"."Material_name_idx";
DROP INDEX IF EXISTS "sobra_corte"."Material_type_idx";
DROP INDEX IF EXISTS "sobra_corte"."Material_quantity_idx";
DROP INDEX IF EXISTS "sobra_corte"."Location_categoryId_idx";
DROP INDEX IF EXISTS "sobra_corte"."MaterialLocation_locationId_idx";
DROP INDEX IF EXISTS "sobra_corte"."Movement_materialId_idx";
DROP INDEX IF EXISTS "sobra_corte"."Movement_createdAt_idx";
DROP INDEX IF EXISTS "sobra_corte"."Movement_origem_createdAt_idx";
DROP INDEX IF EXISTS "sobra_corte"."CategoryConfig_defaultUnitId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "Material_factoryUnitId_code_key" ON "sobra_corte"."Material"("factoryUnitId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "Material_id_factoryUnitId_key" ON "sobra_corte"."Material"("id", "factoryUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "Location_factoryUnitId_name_key" ON "sobra_corte"."Location"("factoryUnitId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Location_id_factoryUnitId_key" ON "sobra_corte"."Location"("id", "factoryUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_factoryUnitId_usuario_key" ON "sobra_corte"."User"("factoryUnitId", "usuario");
CREATE UNIQUE INDEX IF NOT EXISTS "User_factoryUnitId_email_key" ON "sobra_corte"."User"("factoryUnitId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_factoryUnitId_matriculaDass_key" ON "sobra_corte"."User"("factoryUnitId", "matriculaDass");
CREATE UNIQUE INDEX IF NOT EXISTS "UnitConfig_factoryUnitId_symbol_key" ON "sobra_corte"."UnitConfig"("factoryUnitId", "symbol");
CREATE UNIQUE INDEX IF NOT EXISTS "UnitConfig_id_factoryUnitId_key" ON "sobra_corte"."UnitConfig"("id", "factoryUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryConfig_factoryUnitId_name_key" ON "sobra_corte"."CategoryConfig"("factoryUnitId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryConfig_id_factoryUnitId_key" ON "sobra_corte"."CategoryConfig"("id", "factoryUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "OriginConfig_factoryUnitId_name_key" ON "sobra_corte"."OriginConfig"("factoryUnitId", "name");

CREATE INDEX IF NOT EXISTS "Material_factoryUnitId_name_idx" ON "sobra_corte"."Material"("factoryUnitId", "name");
CREATE INDEX IF NOT EXISTS "Material_factoryUnitId_type_idx" ON "sobra_corte"."Material"("factoryUnitId", "type");
CREATE INDEX IF NOT EXISTS "Material_factoryUnitId_quantity_idx" ON "sobra_corte"."Material"("factoryUnitId", "quantity" DESC);
CREATE INDEX IF NOT EXISTS "Location_factoryUnitId_categoryId_idx" ON "sobra_corte"."Location"("factoryUnitId", "categoryId");
CREATE INDEX IF NOT EXISTS "MaterialLocation_factoryUnitId_locationId_idx" ON "sobra_corte"."MaterialLocation"("factoryUnitId", "locationId");
CREATE INDEX IF NOT EXISTS "Movement_factoryUnitId_materialId_idx" ON "sobra_corte"."Movement"("factoryUnitId", "materialId");
CREATE INDEX IF NOT EXISTS "Movement_factoryUnitId_createdAt_idx" ON "sobra_corte"."Movement"("factoryUnitId", "createdAt");
CREATE INDEX IF NOT EXISTS "Movement_factoryUnitId_origem_createdAt_idx" ON "sobra_corte"."Movement"("factoryUnitId", "origem", "createdAt");
CREATE INDEX IF NOT EXISTS "CategoryConfig_factoryUnitId_defaultUnitId_idx" ON "sobra_corte"."CategoryConfig"("factoryUnitId", "defaultUnitId");

ALTER TABLE "sobra_corte"."MaterialLocation" DROP CONSTRAINT IF EXISTS "MaterialLocation_materialId_fkey";
ALTER TABLE "sobra_corte"."MaterialLocation" DROP CONSTRAINT IF EXISTS "MaterialLocation_locationId_fkey";
ALTER TABLE "sobra_corte"."Movement" DROP CONSTRAINT IF EXISTS "Movement_materialId_fkey";
ALTER TABLE "sobra_corte"."CategoryConfig" DROP CONSTRAINT IF EXISTS "CategoryConfig_defaultUnitId_fkey";
ALTER TABLE "sobra_corte"."Location" DROP CONSTRAINT IF EXISTS "Location_categoryId_fkey";

ALTER TABLE "sobra_corte"."MaterialLocation" DROP CONSTRAINT IF EXISTS "MaterialLocation_materialId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."MaterialLocation" DROP CONSTRAINT IF EXISTS "MaterialLocation_locationId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Movement" DROP CONSTRAINT IF EXISTS "Movement_materialId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."CategoryConfig" DROP CONSTRAINT IF EXISTS "CategoryConfig_defaultUnitId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Location" DROP CONSTRAINT IF EXISTS "Location_categoryId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Material" DROP CONSTRAINT IF EXISTS "Material_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Location" DROP CONSTRAINT IF EXISTS "Location_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."MaterialLocation" DROP CONSTRAINT IF EXISTS "MaterialLocation_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Movement" DROP CONSTRAINT IF EXISTS "Movement_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."User" DROP CONSTRAINT IF EXISTS "User_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."UnitConfig" DROP CONSTRAINT IF EXISTS "UnitConfig_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."CategoryConfig" DROP CONSTRAINT IF EXISTS "CategoryConfig_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."OriginConfig" DROP CONSTRAINT IF EXISTS "OriginConfig_factoryUnitId_fkey";

ALTER TABLE "sobra_corte"."MaterialLocation" ADD CONSTRAINT "MaterialLocation_materialId_factoryUnitId_fkey" FOREIGN KEY ("materialId", "factoryUnitId") REFERENCES "sobra_corte"."Material"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."MaterialLocation" ADD CONSTRAINT "MaterialLocation_locationId_factoryUnitId_fkey" FOREIGN KEY ("locationId", "factoryUnitId") REFERENCES "sobra_corte"."Location"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_materialId_factoryUnitId_fkey" FOREIGN KEY ("materialId", "factoryUnitId") REFERENCES "sobra_corte"."Material"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."CategoryConfig" ADD CONSTRAINT "CategoryConfig_defaultUnitId_factoryUnitId_fkey" FOREIGN KEY ("defaultUnitId", "factoryUnitId") REFERENCES "sobra_corte"."UnitConfig"("id", "factoryUnitId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."Location" ADD CONSTRAINT "Location_categoryId_factoryUnitId_fkey" FOREIGN KEY ("categoryId", "factoryUnitId") REFERENCES "sobra_corte"."CategoryConfig"("id", "factoryUnitId") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."Material" ADD CONSTRAINT "Material_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."Location" ADD CONSTRAINT "Location_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."MaterialLocation" ADD CONSTRAINT "MaterialLocation_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."User" ADD CONSTRAINT "User_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."UnitConfig" ADD CONSTRAINT "UnitConfig_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."CategoryConfig" ADD CONSTRAINT "CategoryConfig_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."OriginConfig" ADD CONSTRAINT "OriginConfig_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
