-- Aligns the versioned migrations with the current Prisma schema.
-- Additive and idempotent so it is safe for databases that received these
-- structures before migrations were consolidated.

CREATE TABLE IF NOT EXISTS "sobra_corte"."UnitConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UnitConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sobra_corte"."CategoryConfig"
    ADD COLUMN IF NOT EXISTS "unitLocked" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "defaultUnitId" INTEGER;

ALTER TABLE "sobra_corte"."Location"
    ADD COLUMN IF NOT EXISTS "categoryId" INTEGER;

ALTER TABLE "sobra_corte"."Movement"
    ADD COLUMN IF NOT EXISTS "origem" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "UnitConfig_symbol_key"
    ON "sobra_corte"."UnitConfig"("symbol");
CREATE INDEX IF NOT EXISTS "UnitConfig_symbol_idx"
    ON "sobra_corte"."UnitConfig"("symbol");
CREATE INDEX IF NOT EXISTS "CategoryConfig_defaultUnitId_idx"
    ON "sobra_corte"."CategoryConfig"("defaultUnitId");
CREATE INDEX IF NOT EXISTS "Location_categoryId_idx"
    ON "sobra_corte"."Location"("categoryId");
CREATE INDEX IF NOT EXISTS "Movement_origem_createdAt_idx"
    ON "sobra_corte"."Movement"("origem", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CategoryConfig_defaultUnitId_fkey'
          AND connamespace = 'sobra_corte'::regnamespace
    ) THEN
        ALTER TABLE "sobra_corte"."CategoryConfig"
            ADD CONSTRAINT "CategoryConfig_defaultUnitId_fkey"
            FOREIGN KEY ("defaultUnitId") REFERENCES "sobra_corte"."UnitConfig"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Location_categoryId_fkey'
          AND connamespace = 'sobra_corte'::regnamespace
    ) THEN
        ALTER TABLE "sobra_corte"."Location"
            ADD CONSTRAINT "Location_categoryId_fkey"
            FOREIGN KEY ("categoryId") REFERENCES "sobra_corte"."CategoryConfig"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
