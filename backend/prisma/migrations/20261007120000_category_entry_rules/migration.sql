BEGIN;

ALTER TABLE sobra_corte."MaterialRequisition" ADD COLUMN "categoryId" INTEGER;
ALTER TABLE sobra_corte."StockItem" ALTER COLUMN "componentType" DROP DEFAULT;

-- Conserve os metadados de subtipo como arquivo legado; não são mais usados
-- no cadastro. Esta migração não altera saldos, identificadores ou movimentos.
CREATE TYPE sobra_corte."CategoryEntryMode" AS ENUM ('QUANTITY', 'SIDE_PAIR');
ALTER TABLE sobra_corte."CategoryConfig"
  ADD COLUMN "entryMode" sobra_corte."CategoryEntryMode" NOT NULL DEFAULT 'QUANTITY';

CREATE FUNCTION pg_temp.category_unit(raw_unit text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE UPPER(TRIM(raw_unit))
    WHEN 'UND' THEN 'UN' WHEN 'PC' THEN 'UN' WHEN 'UNIDADE' THEN 'UN'
    WHEN 'M2' THEN 'M²' WHEN 'MT2' THEN 'M²' WHEN 'M^2' THEN 'M²'
    WHEN 'MT' THEN 'M' WHEN 'KGS' THEN 'KG' WHEN 'GR' THEN 'G'
    WHEN 'PR' THEN 'PAR' WHEN 'PARES' THEN 'PAR'
    ELSE NULLIF(UPPER(TRIM(raw_unit)), '') END
$$;

-- Só associe estoque sem categoria quando nome e setor apontam para uma
-- única categoria existente. Nunca invente classificações para dados antigos.
CREATE TEMP TABLE category_assignments ON COMMIT DROP AS
SELECT s.id AS stock_id, MIN(c.id) AS category_id, COUNT(c.id) AS matches
FROM sobra_corte."StockItem" s
LEFT JOIN sobra_corte."CategoryConfig" c
  ON c."factoryUnitId" = s."factoryUnitId"
  AND UPPER(TRIM(c.name)) = UPPER(TRIM(s.type))
  AND (c.sector IS NULL AND cardinality(c.sectors) = 0
    OR s.sector = ANY(c.sectors)
    OR cardinality(c.sectors) = 0 AND c.sector = s.sector
    OR s.sector::text = 'EXPEDICAO' AND ('DISTRIBUICAO' = ANY(c.sectors)
      OR cardinality(c.sectors) = 0 AND c.sector::text = 'DISTRIBUICAO'))
WHERE s."categoryId" IS NULL
GROUP BY s.id;

DO $$
DECLARE incompatible text;
BEGIN
  SELECT string_agg(stock_id::text, ', ' ORDER BY stock_id) INTO incompatible
  FROM category_assignments WHERE matches <> 1;
  IF incompatible IS NOT NULL THEN
    RAISE EXCEPTION 'Estoque sem categoria inequívoca (IDs: %). Associe os itens às categorias antes de aplicar a migração.', incompatible;
  END IF;
END $$;

UPDATE sobra_corte."StockItem" s SET "categoryId" = a.category_id
FROM category_assignments a WHERE s.id = a.stock_id;

CREATE TEMP TABLE observed_category_rules ON COMMIT DROP AS
SELECT c.id,
  COUNT(s.id) AS items,
  COUNT(DISTINCT pg_temp.category_unit(s.unit)) AS units,
  MIN(pg_temp.category_unit(s.unit)) AS stock_unit,
  BOOL_OR(s.id IS NOT NULL AND (pg_temp.category_unit(s.unit) IS NULL
    OR pg_temp.category_unit(s.unit) NOT IN ('UN','PAR','CX','ROLO','M','M²','CM','L','G','KG'))) AS invalid_unit,
  BOOL_OR(s."footSide" IS NOT NULL) AS has_sides,
  BOOL_OR(s.id IS NOT NULL AND s."footSide" IS NULL) AS has_unsided,
  BOOL_OR(s."footSide"::text = 'PAR') AS stored_pair
FROM sobra_corte."CategoryConfig" c
LEFT JOIN sobra_corte."StockItem" s ON s."categoryId" = c.id AND s."factoryUnitId" = c."factoryUnitId"
GROUP BY c.id;

DO $$
DECLARE incompatible text;
BEGIN
  SELECT string_agg(c."factoryUnitId"::text || ':' || c.id::text || ' ' || c.name, '; ' ORDER BY c.id)
  INTO incompatible FROM observed_category_rules r
  JOIN sobra_corte."CategoryConfig" c ON c.id = r.id
  WHERE r.units > 1 OR r.invalid_unit OR r.has_sides AND r.has_unsided
    OR r.has_sides AND r.stock_unit <> 'UN' OR r.stored_pair;
  IF incompatible IS NOT NULL THEN
    RAISE EXCEPTION 'Categorias com unidade/modo ambíguos: %. Separe ou regularize as categorias antes de aplicar a migração.', incompatible;
  END IF;
END $$;

UPDATE sobra_corte."CategoryConfig" c
SET "defaultUnitCode" = COALESCE(r.stock_unit, pg_temp.category_unit(c."defaultUnitCode"),
    CASE WHEN c.sector::text = 'CORTE' OR c.sectors = ARRAY['CORTE']::sobra_corte."SectorType"[] THEN 'M²' ELSE 'UN' END),
  "unitLocked" = true,
  "entryMode" = CASE WHEN r.items > 0 THEN
    CASE WHEN r.has_sides THEN 'SIDE_PAIR' ELSE 'QUANTITY' END
    ELSE CASE WHEN c."componentType"::text IN ('CABEDAL','SOLADO','PE_PRONTO')
      OR c."componentType" IS NULL AND (c.sector::text IN ('PRE_FABRICADO','DISTRIBUICAO','EXPEDICAO','MONTAGEM')
        OR c.sectors && ARRAY['PRE_FABRICADO','DISTRIBUICAO','EXPEDICAO','MONTAGEM']::sobra_corte."SectorType"[])
      THEN 'SIDE_PAIR' ELSE 'QUANTITY' END END::sobra_corte."CategoryEntryMode"
FROM observed_category_rules r WHERE r.id = c.id;

DO $$
DECLARE incompatible text;
BEGIN
  SELECT string_agg(id::text || ' ' || name, '; ') INTO incompatible
  FROM sobra_corte."CategoryConfig"
  WHERE "defaultUnitCode" NOT IN ('UN','PAR','CX','ROLO','M','M²','CM','L','G','KG')
    OR "entryMode" = 'SIDE_PAIR' AND "defaultUnitCode" <> 'UN';
  IF incompatible IS NOT NULL THEN
    RAISE EXCEPTION 'Configuração de categorias inválida: %. Revise a unidade antes de aplicar a migração.', incompatible;
  END IF;
END $$;

ALTER TABLE sobra_corte."CategoryConfig"
  ADD CONSTRAINT "CategoryConfig_entry_unit_check" CHECK (
    "defaultUnitCode" IS NOT NULL
    AND "defaultUnitCode" IN ('UN','PAR','CX','ROLO','M','M²','CM','L','G','KG')
    AND ("entryMode" <> 'SIDE_PAIR' OR "defaultUnitCode" = 'UN'));

-- Quantidades inteiras passam a depender da unidade, em todos os setores.
ALTER TABLE sobra_corte."StockItem" DROP CONSTRAINT IF EXISTS "StockItem_unit_quantities";
ALTER TABLE sobra_corte."StockItem" ADD CONSTRAINT "StockItem_unit_quantities"
  CHECK (unit NOT IN ('UN','PAR','CX','ROLO') OR (quantity = trunc(quantity) AND "minStock" = trunc("minStock")));

-- O código de Corte passa a admitir E e D distintos, mantendo unicidade
-- para materiais sem lado. Nenhum código existente é alterado.
DROP INDEX sobra_corte."StockItem_factoryUnitId_code_key";
CREATE UNIQUE INDEX "StockItem_factoryUnitId_code_footSide_key"
  ON sobra_corte."StockItem" ("factoryUnitId", code, "footSide");
CREATE UNIQUE INDEX "StockItem_unsided_code_key"
  ON sobra_corte."StockItem" ("factoryUnitId", code) WHERE "footSide" IS NULL;

COMMIT;
