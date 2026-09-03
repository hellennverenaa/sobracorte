-- Inventory integrity: decimal balances, domain foreign keys and immutable
-- movement snapshots. This migration is intentionally additive until all
-- existing values have been validated and backfilled.
BEGIN;

ALTER TABLE "sobra_corte"."Material"
  ADD COLUMN IF NOT EXISTS "categoryId" INTEGER,
  ADD COLUMN IF NOT EXISTS "unitId" INTEGER;

-- Normalize existing configuration names before resolving material references.
UPDATE "sobra_corte"."CategoryConfig"
SET "name" = CASE WHEN upper(trim("name")) = 'OUTRO' THEN 'OUTROS' ELSE upper(trim("name")) END;
UPDATE "sobra_corte"."UnitConfig"
SET "symbol" = CASE lower(trim("symbol"))
  WHEN 'm2' THEN 'm²' WHEN 'mt2' THEN 'm²' WHEN 'm²' THEN 'm²'
  WHEN 'un' THEN 'un' WHEN 'und' THEN 'un'
  ELSE lower(trim("symbol")) END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "sobra_corte"."CategoryConfig"
    GROUP BY "factoryUnitId", "name" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Categorias duplicadas após normalização; resolva antes do deploy';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "sobra_corte"."UnitConfig"
    GROUP BY "factoryUnitId", "symbol" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Unidades duplicadas após normalização; resolva antes do deploy';
  END IF;
END $$;

-- Material.type/unit were the previous textual domain fields. Create missing
-- domain rows, preserving every existing material during the transition.
INSERT INTO "sobra_corte"."CategoryConfig" ("name", "factoryUnitId")
SELECT DISTINCT CASE WHEN upper(trim(m."type")) = 'OUTRO' THEN 'OUTROS' ELSE upper(trim(m."type")) END, m."factoryUnitId"
FROM "sobra_corte"."Material" m
WHERE nullif(trim(m."type"), '') IS NOT NULL
ON CONFLICT ("factoryUnitId", "name") DO NOTHING;

INSERT INTO "sobra_corte"."CategoryConfig" ("name", "factoryUnitId")
SELECT defaults."name", f."id"
FROM "sobra_corte"."FactoryUnit" f
CROSS JOIN (VALUES ('QUIMICO'), ('EMBALAGEM'), ('PALMILHA'), ('OUTROS')) AS defaults("name")
ON CONFLICT ("factoryUnitId", "name") DO NOTHING;

INSERT INTO "sobra_corte"."UnitConfig" ("name", "symbol", "factoryUnitId")
SELECT DISTINCT
  CASE lower(trim(m."unit")) WHEN 'm2' THEN 'Metro Quadrado' WHEN 'mt2' THEN 'Metro Quadrado'
    WHEN 'm²' THEN 'Metro Quadrado' WHEN 'kg' THEN 'Quilograma' WHEN 'g' THEN 'Grama'
    WHEN 'm' THEN 'Metro' WHEN 'un' THEN 'Unidade' WHEN 'und' THEN 'Unidade'
    ELSE upper(trim(m."unit")) END,
  CASE lower(trim(m."unit")) WHEN 'm2' THEN 'm²' WHEN 'mt2' THEN 'm²' WHEN 'm²' THEN 'm²'
    WHEN 'und' THEN 'un' ELSE lower(trim(m."unit")) END,
  m."factoryUnitId"
FROM "sobra_corte"."Material" m
WHERE nullif(trim(m."unit"), '') IS NOT NULL
ON CONFLICT ("factoryUnitId", "symbol") DO NOTHING;

-- Empty textual values are mapped to the configured UN unit. Fail closed if
-- a tenant has no usable unit configuration rather than creating bad FKs.
INSERT INTO "sobra_corte"."UnitConfig" ("name", "symbol", "factoryUnitId")
SELECT 'Unidade', 'un', f."id"
FROM "sobra_corte"."FactoryUnit" f
WHERE NOT EXISTS (
  SELECT 1 FROM "sobra_corte"."UnitConfig" u WHERE u."factoryUnitId" = f."id" AND u."symbol" = 'un'
)
ON CONFLICT ("factoryUnitId", "symbol") DO NOTHING;

UPDATE "sobra_corte"."Material" m
SET "categoryId" = c."id"
FROM "sobra_corte"."CategoryConfig" c
WHERE c."factoryUnitId" = m."factoryUnitId"
  AND c."name" = CASE WHEN upper(trim(m."type")) = 'OUTRO' THEN 'OUTROS' ELSE upper(trim(m."type")) END;

UPDATE "sobra_corte"."Material" m
SET "unitId" = u."id"
FROM "sobra_corte"."UnitConfig" u
WHERE u."factoryUnitId" = m."factoryUnitId"
  AND u."symbol" = CASE lower(trim(m."unit"))
    WHEN 'm2' THEN 'm²' WHEN 'mt2' THEN 'm²' WHEN 'm²' THEN 'm²'
    WHEN 'und' THEN 'un' WHEN '' THEN 'un' ELSE lower(trim(m."unit")) END;

UPDATE "sobra_corte"."Material" SET "categoryId" = (
  SELECT c."id" FROM "sobra_corte"."CategoryConfig" c
  WHERE c."factoryUnitId" = "Material"."factoryUnitId" AND c."name" = 'OUTROS'
) WHERE "categoryId" IS NULL;
INSERT INTO "sobra_corte"."CategoryConfig" ("name", "factoryUnitId")
SELECT 'OUTROS', f."id" FROM "sobra_corte"."FactoryUnit" f
WHERE NOT EXISTS (SELECT 1 FROM "sobra_corte"."CategoryConfig" c WHERE c."factoryUnitId" = f."id" AND c."name" = 'OUTROS')
ON CONFLICT ("factoryUnitId", "name") DO NOTHING;
UPDATE "sobra_corte"."Material" m SET "categoryId" = c."id"
FROM "sobra_corte"."CategoryConfig" c
WHERE m."categoryId" IS NULL AND c."factoryUnitId" = m."factoryUnitId" AND c."name" = 'OUTROS';
UPDATE "sobra_corte"."Material" m SET "unitId" = u."id"
FROM "sobra_corte"."UnitConfig" u
WHERE m."unitId" IS NULL AND u."factoryUnitId" = m."factoryUnitId" AND u."symbol" = 'un';

-- Existing stock locations are authoritative for compatibility: ensure every
-- category already present at a location is represented in the domain join.
INSERT INTO "sobra_corte"."LocationCategory" ("locationId", "categoryId", "factoryUnitId")
SELECT DISTINCT ml."locationId", m."categoryId", ml."factoryUnitId"
FROM "sobra_corte"."MaterialLocation" ml
JOIN "sobra_corte"."Material" m ON m."id" = ml."materialId"
WHERE m."factoryUnitId" = ml."factoryUnitId"
ON CONFLICT ("locationId", "categoryId") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sobra_corte"."Material" WHERE "categoryId" IS NULL OR "unitId" IS NULL) THEN
    RAISE EXCEPTION 'Não foi possível resolver categoria/unidade de algum material';
  END IF;
  IF EXISTS (SELECT 1 FROM "sobra_corte"."Material" WHERE "quantity" < 0 OR "minStock" < 0) THEN
    RAISE EXCEPTION 'Saldos negativos encontrados; corrija os dados antes do deploy';
  END IF;
  IF EXISTS (SELECT 1 FROM "sobra_corte"."MaterialLocation" WHERE coalesce("quantity", 0) < 0) THEN
    RAISE EXCEPTION 'Saldos negativos encontrados em localizações';
  END IF;
  IF EXISTS (SELECT 1 FROM "sobra_corte"."Movement" WHERE lower(trim("type")) NOT IN ('entrada', 'saida')) THEN
    RAISE EXCEPTION 'Tipos de movimentação inválidos encontrados';
  END IF;
  IF EXISTS (SELECT 1 FROM "sobra_corte"."Material" WHERE abs("quantity"::numeric - round("quantity"::numeric, 3)) > 0.000000001 OR abs("minStock"::numeric - round("minStock"::numeric, 3)) > 0.000000001)
     OR EXISTS (SELECT 1 FROM "sobra_corte"."MaterialLocation" WHERE abs(coalesce("quantity", 0)::numeric - round(coalesce("quantity", 0)::numeric, 3)) > 0.000000001)
     OR EXISTS (SELECT 1 FROM "sobra_corte"."Movement" WHERE abs("quantity"::numeric - round("quantity"::numeric, 3)) > 0.000000001) THEN
    RAISE EXCEPTION 'Valores com mais de três casas decimais encontrados; corrija os dados antes do deploy';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "sobra_corte"."Material" m
    LEFT JOIN (
      SELECT "materialId", sum(coalesce("quantity", 0)) AS total
      FROM "sobra_corte"."MaterialLocation" GROUP BY "materialId"
    ) ml ON ml."materialId" = m."id"
    WHERE abs(m."quantity"::numeric - coalesce(ml.total, 0)) > 0.0005
  ) THEN
    RAISE EXCEPTION 'Saldo total divergente da soma das localizações; reconcilie os dados antes do deploy';
  END IF;
END $$;

UPDATE "sobra_corte"."MaterialLocation" SET "quantity" = coalesce("quantity", 0);
ALTER TABLE "sobra_corte"."MaterialLocation" ALTER COLUMN "quantity" SET NOT NULL;

ALTER TABLE "sobra_corte"."Material"
  ALTER COLUMN "quantity" TYPE DECIMAL(18,3) USING round("quantity"::numeric, 3),
  ALTER COLUMN "minStock" TYPE DECIMAL(18,3) USING round("minStock"::numeric, 3),
  ALTER COLUMN "categoryId" SET NOT NULL,
  ALTER COLUMN "unitId" SET NOT NULL;
ALTER TABLE "sobra_corte"."MaterialLocation"
  ALTER COLUMN "quantity" TYPE DECIMAL(18,3) USING round("quantity"::numeric, 3);
ALTER TABLE "sobra_corte"."Movement"
  ALTER COLUMN "quantity" TYPE DECIMAL(18,3) USING round("quantity"::numeric, 3);
UPDATE "sobra_corte"."Movement" SET "type" = lower(trim("type"));

-- Immutable context allows history to remain meaningful after material deletion.
ALTER TABLE "sobra_corte"."Movement"
  ADD COLUMN IF NOT EXISTS "materialCode" TEXT,
  ADD COLUMN IF NOT EXISTS "materialName" TEXT,
  ADD COLUMN IF NOT EXISTS "materialCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "materialUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "locationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "locationName" TEXT,
  ADD COLUMN IF NOT EXISTS "originId" INTEGER,
  ADD COLUMN IF NOT EXISTS "originName" TEXT;
UPDATE "sobra_corte"."Movement" mv
SET "materialCode" = m."code", "materialName" = m."name",
    "materialCategory" = c."name", "materialUnit" = u."symbol"
FROM "sobra_corte"."Material" m
JOIN "sobra_corte"."CategoryConfig" c ON c."id" = m."categoryId"
JOIN "sobra_corte"."UnitConfig" u ON u."id" = m."unitId"
WHERE mv."materialId" = m."id";
UPDATE "sobra_corte"."Movement" mv SET "originName" = mv."origem"
WHERE mv."origem" IS NOT NULL AND mv."originName" IS NULL;
UPDATE "sobra_corte"."Movement" mv SET "originId" = o."id"
FROM "sobra_corte"."OriginConfig" o
WHERE mv."originName" = o."name" AND mv."factoryUnitId" = o."factoryUnitId";
ALTER TABLE "sobra_corte"."Movement"
  ALTER COLUMN "materialCode" SET NOT NULL,
  ALTER COLUMN "materialName" SET NOT NULL,
  ALTER COLUMN "materialCategory" SET NOT NULL,
  ALTER COLUMN "materialUnit" SET NOT NULL;

-- Replace the old composite/cascading material FK with SetNull history FK.
ALTER TABLE "sobra_corte"."Movement" ALTER COLUMN "materialId" DROP NOT NULL;
ALTER TABLE "sobra_corte"."MaterialLocation" DROP CONSTRAINT IF EXISTS "MaterialLocation_materialId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Movement" DROP CONSTRAINT IF EXISTS "Movement_materialId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "sobra_corte"."Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "sobra_corte"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_originId_fkey"
  FOREIGN KEY ("originId") REFERENCES "sobra_corte"."OriginConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."MaterialLocation" ADD CONSTRAINT "MaterialLocation_materialId_factoryUnitId_fkey"
  FOREIGN KEY ("materialId", "factoryUnitId") REFERENCES "sobra_corte"."Material"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."MaterialLocation" DROP CONSTRAINT IF EXISTS "MaterialLocation_locationId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."MaterialLocation" ADD CONSTRAINT "MaterialLocation_locationId_factoryUnitId_fkey"
  FOREIGN KEY ("locationId", "factoryUnitId") REFERENCES "sobra_corte"."Location"("id", "factoryUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "sobra_corte"."Material_factoryUnitId_type_idx";
DROP INDEX IF EXISTS "sobra_corte"."Material_type_idx";
ALTER TABLE "sobra_corte"."Material" DROP COLUMN "unit", DROP COLUMN "type";
ALTER TABLE "sobra_corte"."CategoryConfig" DROP COLUMN IF EXISTS "unitLock";
DROP INDEX IF EXISTS "sobra_corte"."Movement_factoryUnitId_origem_createdAt_idx";
ALTER TABLE "sobra_corte"."Movement" DROP COLUMN "origem";
ALTER TABLE "sobra_corte"."MaterialLocation" ADD CONSTRAINT "MaterialLocation_quantity_nonnegative"
  CHECK ("quantity" >= 0);
ALTER TABLE "sobra_corte"."Material" ADD CONSTRAINT "Material_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "sobra_corte"."Material" ADD CONSTRAINT "Material_minStock_nonnegative" CHECK ("minStock" >= 0);
ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_type_valid" CHECK ("type" IN ('entrada', 'saida'));

ALTER TABLE "sobra_corte"."Material" ADD CONSTRAINT "Material_categoryId_factoryUnitId_fkey"
  FOREIGN KEY ("categoryId", "factoryUnitId") REFERENCES "sobra_corte"."CategoryConfig"("id", "factoryUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."Material" ADD CONSTRAINT "Material_unitId_factoryUnitId_fkey"
  FOREIGN KEY ("unitId", "factoryUnitId") REFERENCES "sobra_corte"."UnitConfig"("id", "factoryUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sobra_corte"."MaterialDeletionAudit" (
  "id" SERIAL NOT NULL,
  "materialId" INTEGER,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "categoryName" TEXT NOT NULL,
  "unitSymbol" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "locations" JSONB NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedById" TEXT,
  "deletedByName" TEXT,
  "factoryUnitId" INTEGER NOT NULL,
  CONSTRAINT "MaterialDeletionAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaterialDeletionAudit_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  -- materialId is an immutable historical identifier, intentionally not a FK
  -- because the referenced material is deleted after this audit is written.
);
CREATE INDEX "MaterialDeletionAudit_factoryUnitId_deletedAt_idx" ON "sobra_corte"."MaterialDeletionAudit" ("factoryUnitId", "deletedAt");
CREATE INDEX "MaterialDeletionAudit_factoryUnitId_materialId_idx" ON "sobra_corte"."MaterialDeletionAudit" ("factoryUnitId", "materialId");
CREATE INDEX "Movement_factoryUnitId_locationId_createdAt_idx" ON "sobra_corte"."Movement" ("factoryUnitId", "locationId", "createdAt");
CREATE INDEX "Movement_factoryUnitId_originId_createdAt_idx" ON "sobra_corte"."Movement" ("factoryUnitId", "originId", "createdAt");

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Material_name_trgm_idx" ON "sobra_corte"."Material" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Material_code_trgm_idx" ON "sobra_corte"."Material" USING GIN ("code" gin_trgm_ops);

COMMIT;
