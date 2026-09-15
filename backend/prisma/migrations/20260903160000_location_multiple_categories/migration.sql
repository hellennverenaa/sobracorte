CREATE TABLE "sobra_corte"."LocationCategory" (
    "locationId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "factoryUnitId" INTEGER NOT NULL,
    CONSTRAINT "LocationCategory_pkey" PRIMARY KEY ("locationId", "categoryId")
);

INSERT INTO "sobra_corte"."LocationCategory" ("locationId", "categoryId", "factoryUnitId")
SELECT "id", "categoryId", "factoryUnitId"
FROM "sobra_corte"."Location"
WHERE "categoryId" IS NOT NULL;

CREATE INDEX "LocationCategory_factoryUnitId_categoryId_idx"
    ON "sobra_corte"."LocationCategory"("factoryUnitId", "categoryId");

ALTER TABLE "sobra_corte"."LocationCategory"
    ADD CONSTRAINT "LocationCategory_locationId_factoryUnitId_fkey"
    FOREIGN KEY ("locationId", "factoryUnitId")
    REFERENCES "sobra_corte"."Location"("id", "factoryUnitId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."LocationCategory"
    ADD CONSTRAINT "LocationCategory_categoryId_factoryUnitId_fkey"
    FOREIGN KEY ("categoryId", "factoryUnitId")
    REFERENCES "sobra_corte"."CategoryConfig"("id", "factoryUnitId")
    ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "sobra_corte"."Location_factoryUnitId_categoryId_idx";
ALTER TABLE "sobra_corte"."Location" DROP CONSTRAINT IF EXISTS "Location_categoryId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Location" DROP COLUMN "categoryId";
