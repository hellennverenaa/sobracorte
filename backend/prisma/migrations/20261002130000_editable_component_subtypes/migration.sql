CREATE TABLE "sobra_corte"."ComponentSubtypeConfig" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "sectors" "sobra_corte"."SectorType"[] NOT NULL DEFAULT ARRAY[]::"sobra_corte"."SectorType"[],
  "componentType" "sobra_corte"."ComponentType",
  "factoryUnitId" INTEGER NOT NULL,
  CONSTRAINT "ComponentSubtypeConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComponentSubtypeConfig_factoryUnitId_name_key"
  ON "sobra_corte"."ComponentSubtypeConfig"("factoryUnitId", "name");
CREATE UNIQUE INDEX "ComponentSubtypeConfig_id_factoryUnitId_key"
  ON "sobra_corte"."ComponentSubtypeConfig"("id", "factoryUnitId");
ALTER TABLE "sobra_corte"."ComponentSubtypeConfig"
  ADD CONSTRAINT "ComponentSubtypeConfig_factoryUnitId_fkey"
  FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sobra_corte"."CategoryConfig"
  ADD COLUMN "subtypeId" INTEGER;

-- Cria o catálogo editável inicial preservando os perfis internos atuais.
INSERT INTO "sobra_corte"."ComponentSubtypeConfig" ("name", "sectors", "componentType", "factoryUnitId")
SELECT defaults."name", defaults."sectors", defaults."componentType", factory."id"
FROM "sobra_corte"."FactoryUnit" AS factory
CROSS JOIN (
  VALUES
    ('Matéria-prima', ARRAY['CORTE']::"sobra_corte"."SectorType"[], 'MATERIA_PRIMA'::"sobra_corte"."ComponentType"),
    ('Peça cortada', ARRAY['APOIO']::"sobra_corte"."SectorType"[], 'PECA_CORTADA'::"sobra_corte"."ComponentType"),
    ('Cabedal', ARRAY['APOIO', 'DISTRIBUICAO']::"sobra_corte"."SectorType"[], 'CABEDAL'::"sobra_corte"."ComponentType"),
    ('Solado', ARRAY['PRE_FABRICADO', 'DISTRIBUICAO']::"sobra_corte"."SectorType"[], 'SOLADO'::"sobra_corte"."ComponentType"),
    ('Pé pronto', ARRAY['MONTAGEM']::"sobra_corte"."SectorType"[], 'PE_PRONTO'::"sobra_corte"."ComponentType")
) AS defaults("name", "sectors", "componentType");

-- Relaciona cada categoria ao subtipo equivalente sem alterar seu componentType.
UPDATE "sobra_corte"."CategoryConfig" AS category
SET "subtypeId" = subtype."id"
FROM "sobra_corte"."ComponentSubtypeConfig" AS subtype
WHERE category."componentType" = subtype."componentType"
  AND category."factoryUnitId" = subtype."factoryUnitId";

CREATE INDEX "CategoryConfig_factoryUnitId_subtypeId_idx"
  ON "sobra_corte"."CategoryConfig"("factoryUnitId", "subtypeId");

ALTER TABLE "sobra_corte"."CategoryConfig"
  ADD CONSTRAINT "CategoryConfig_subtypeId_factoryUnitId_fkey"
  FOREIGN KEY ("subtypeId", "factoryUnitId")
  REFERENCES "sobra_corte"."ComponentSubtypeConfig"("id", "factoryUnitId")
  ON DELETE NO ACTION ON UPDATE CASCADE;
