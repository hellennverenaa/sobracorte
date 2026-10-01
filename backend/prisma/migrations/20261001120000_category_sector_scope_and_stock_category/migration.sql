-- Permite reutilizar uma categoria nos setores que ela realmente atende.
ALTER TABLE "sobra_corte"."CategoryConfig"
  ADD COLUMN IF NOT EXISTS "sectors" "sobra_corte"."SectorType"[] NOT NULL DEFAULT ARRAY[]::"sobra_corte"."SectorType"[];

UPDATE "sobra_corte"."CategoryConfig"
SET "sectors" = ARRAY["sector"]::"sobra_corte"."SectorType"[]
WHERE "sector" IS NOT NULL AND cardinality("sectors") = 0;

ALTER TABLE "sobra_corte"."CategoryConfig"
  ADD COLUMN IF NOT EXISTS "componentType" "sobra_corte"."ComponentType";

-- Preserva o comportamento conhecido das categorias já cadastradas e identifica
-- Cabedal nas unidades que já o possuem configurado em Apoio ou Distribuição.
UPDATE "sobra_corte"."CategoryConfig"
SET "componentType" = CASE
  WHEN "sector" = 'CORTE' THEN 'MATERIA_PRIMA'::"sobra_corte"."ComponentType"
  WHEN "sector" = 'APOIO' AND upper("name") LIKE '%CABEDAL%' THEN 'CABEDAL'::"sobra_corte"."ComponentType"
  WHEN "sector" = 'APOIO' THEN 'PECA_CORTADA'::"sobra_corte"."ComponentType"
  WHEN "sector" = 'PRE_FABRICADO' THEN 'SOLADO'::"sobra_corte"."ComponentType"
  WHEN "sector" IN ('DISTRIBUICAO', 'EXPEDICAO') AND upper("name") LIKE '%SOLA%' THEN 'SOLADO'::"sobra_corte"."ComponentType"
  WHEN "sector" IN ('DISTRIBUICAO', 'EXPEDICAO') THEN 'CABEDAL'::"sobra_corte"."ComponentType"
  WHEN "sector" = 'MONTAGEM' THEN 'PE_PRONTO'::"sobra_corte"."ComponentType"
  ELSE NULL
END
WHERE "componentType" IS NULL;

-- Guarda o vínculo opcional do material à categoria usada para filtrar locais.
ALTER TABLE "sobra_corte"."StockItem"
  ADD COLUMN IF NOT EXISTS "categoryId" INTEGER;

-- Vincula os itens cujo tipo já correspondia, sem ambiguidade, a uma categoria
-- do mesmo setor. Itens sem tipo confiável permanecem sem categoria.
UPDATE "sobra_corte"."StockItem" AS item
SET "categoryId" = category."id"
FROM "sobra_corte"."CategoryConfig" AS category
WHERE item."categoryId" IS NULL
  AND item."type" IS NOT NULL
  AND upper(btrim(item."type")) = upper(btrim(category."name"))
  AND item."factoryUnitId" = category."factoryUnitId"
  AND (
    item."sector" = ANY(category."sectors")
    OR (item."sector" IN ('DISTRIBUICAO', 'EXPEDICAO') AND category."sectors" && ARRAY['DISTRIBUICAO', 'EXPEDICAO']::"sobra_corte"."SectorType"[])
    OR (cardinality(category."sectors") = 0 AND category."sector" IS NULL)
    OR (cardinality(category."sectors") = 0 AND item."sector" = category."sector")
    OR (cardinality(category."sectors") = 0 AND item."sector" IN ('DISTRIBUICAO', 'EXPEDICAO') AND category."sector" IN ('DISTRIBUICAO', 'EXPEDICAO'))
  );

UPDATE "sobra_corte"."StockItem" AS item
SET "componentType" = category."componentType"
FROM "sobra_corte"."CategoryConfig" AS category
WHERE item."categoryId" = category."id"
  AND item."factoryUnitId" = category."factoryUnitId"
  AND category."componentType" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "StockItem_factoryUnitId_categoryId_idx"
  ON "sobra_corte"."StockItem"("factoryUnitId", "categoryId");

ALTER TABLE "sobra_corte"."StockItem"
  ADD CONSTRAINT "StockItem_categoryId_factoryUnitId_fkey"
  FOREIGN KEY ("categoryId", "factoryUnitId")
  REFERENCES "sobra_corte"."CategoryConfig"("id", "factoryUnitId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Mantém válidos os vínculos físicos existentes dos itens categorizados.
INSERT INTO "sobra_corte"."LocationCategory" ("locationId", "categoryId", "factoryUnitId")
SELECT DISTINCT allocation."locationId", item."categoryId", item."factoryUnitId"
FROM "sobra_corte"."StockItemLocation" AS allocation
JOIN "sobra_corte"."StockItem" AS item
  ON item."id" = allocation."stockItemId"
 AND item."factoryUnitId" = allocation."factoryUnitId"
JOIN "sobra_corte"."Location" AS location
  ON location."id" = allocation."locationId"
 AND location."factoryUnitId" = allocation."factoryUnitId"
WHERE item."categoryId" IS NOT NULL
  AND (location."sector" IS NULL OR location."sector" = item."sector"
    OR (location."sector" IN ('DISTRIBUICAO', 'EXPEDICAO') AND item."sector" IN ('DISTRIBUICAO', 'EXPEDICAO')))
ON CONFLICT ("locationId", "categoryId") DO NOTHING;
