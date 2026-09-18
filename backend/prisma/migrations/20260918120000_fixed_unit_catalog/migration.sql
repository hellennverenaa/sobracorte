BEGIN;
LOCK TABLE sobra_corte."StockItem", sobra_corte."StockItemLocation", sobra_corte."CategoryConfig", sobra_corte."UnitConfig" IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE unit_aliases (alias text PRIMARY KEY, code text NOT NULL) ON COMMIT DROP;
INSERT INTO unit_aliases VALUES
('M2','M²'),
('M²','M²'),
('MT2','M²'),
('M^2','M²'),
('METRO QUADRADO','M²'),
('METROS QUADRADOS','M²'),
('METRO_QUADRADO','M²'),
('M2.','M²'),
('M','M'),
('MT','M'),
('METRO','M'),
('METROS','M'),
('M.','M'),
('KG','KG'),
('KGS','KG'),
('KILO','KG'),
('QUILOGRAMA','KG'),
('QUILO','KG'),
('QUILOGRAMAS','KG'),
('QUILOS','KG'),
('KG.','KG'),
('G','G'),
('GR','G'),
('GRAMA','G'),
('GRAMAS','G'),
('G.','G'),
('PAR','PAR'),
('PARES','PAR'),
('PR','PAR'),
('PAR.','PAR'),
('ROLO','ROLO'),
('ROLOS','ROLO'),
('RL','ROLO'),
('RL.','ROLO'),
('CX','CX'),
('CXS','CX'),
('CAIXA','CX'),
('CAIXAS','CX'),
('CX.','CX'),
('CM','CM'),
('CENTIMETRO','CM'),
('CENTÍMETRO','CM'),
('CENTIMETROS','CM'),
('CENTÍMETROS','CM'),
('CM.','CM'),
('L','L'),
('LT','L'),
('LTS','L'),
('LITRO','L'),
('LITROS','L'),
('L.','L'),
('UN','UN'),
('UND','UN'),
('UNIDADE','UN'),
('UNIDADES','UN'),
('PC','UN'),
('PÇ','UN'),
('PECA','UN'),
('PEÇA','UN'),
('PECAS','UN'),
('PEÇAS','UN'),
('UN.','UN');
CREATE TEMP VIEW unit_violations AS
SELECT 'configured_unit' AS issue, u.id, u.symbol AS value FROM sobra_corte."UnitConfig" u
LEFT JOIN unit_aliases a ON a.alias = upper(trim(u.symbol)) WHERE a.code IS NULL
UNION ALL
SELECT 'stock_unit' AS issue, s.id, s.unit AS value FROM sobra_corte."StockItem" s
LEFT JOIN unit_aliases a ON a.alias = upper(trim(s.unit)) WHERE a.code IS NULL
UNION ALL
SELECT 'stock_quantity', s.id, s.quantity::text FROM sobra_corte."StockItem" s
JOIN unit_aliases a ON a.alias = upper(trim(s.unit))
WHERE s.quantity < 0 OR s."minStock" < 0 OR ((a.code IN ('UN','PAR','CX','ROLO') OR s.sector::text IN ('APOIO','PRE_FABRICADO','DISTRIBUICAO','EXPEDICAO','MONTAGEM')) AND (s.quantity <> trunc(s.quantity) OR s."minStock" <> trunc(s."minStock")))
UNION ALL
SELECT 'location_quantity', s.id, l.quantity::text FROM sobra_corte."StockItemLocation" l
JOIN sobra_corte."StockItem" s ON s.id = l."stockItemId"
JOIN unit_aliases a ON a.alias = upper(trim(s.unit))
WHERE l.quantity < 0 OR ((a.code IN ('UN','PAR','CX','ROLO') OR s.sector::text IN ('APOIO','PRE_FABRICADO','DISTRIBUICAO','EXPEDICAO','MONTAGEM')) AND l.quantity <> trunc(l.quantity))
UNION ALL
SELECT 'category_reference', c.id, coalesce(u.symbol, c."unitLock") FROM sobra_corte."CategoryConfig" c
LEFT JOIN sobra_corte."UnitConfig" u ON u.id = c."defaultUnitId" AND u."factoryUnitId" = c."factoryUnitId"
LEFT JOIN unit_aliases a ON a.alias = upper(trim(u.symbol))
WHERE (c."defaultUnitId" IS NOT NULL AND a.code IS NULL)
 OR c."unitLock" NOT IN ('livre','m2','m')
 OR (c."unitLock" IN ('m2','m') AND a.code IS NOT NULL AND a.code <> CASE c."unitLock" WHEN 'm2' THEN 'M²' ELSE 'M' END)
 OR (c."unitLocked" AND c."defaultUnitId" IS NULL AND c."unitLock" = 'livre');

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM unit_violations) THEN RAISE EXCEPTION 'Catálogo de unidades: inconsistências detectadas. Execute unit-catalog-audit.sql e revise cada ocorrência.'; END IF;
END $$;
ALTER TABLE sobra_corte."CategoryConfig" ADD COLUMN "defaultUnitCode" text;
UPDATE sobra_corte."CategoryConfig" c SET "defaultUnitCode" = a.code
FROM sobra_corte."UnitConfig" u, unit_aliases a
WHERE c."defaultUnitId" = u.id AND c."factoryUnitId" = u."factoryUnitId" AND a.alias = upper(trim(u.symbol));
UPDATE sobra_corte."CategoryConfig" SET "defaultUnitCode" = CASE "unitLock" WHEN 'm2' THEN 'M²' ELSE 'M' END, "unitLocked" = true WHERE "unitLock" IN ('m2','m');
UPDATE sobra_corte."StockItem" s SET unit = a.code FROM unit_aliases a WHERE a.alias = upper(trim(s.unit));
DROP VIEW unit_violations;
ALTER TABLE sobra_corte."CategoryConfig" DROP COLUMN "defaultUnitId", DROP COLUMN "unitLock";
DROP TABLE sobra_corte."UnitConfig";
ALTER TABLE sobra_corte."CategoryConfig" ADD CONSTRAINT "CategoryConfig_unit_catalog" CHECK (("defaultUnitCode" IS NULL OR "defaultUnitCode" IN ('UN','PAR','CX','ROLO','M','M²','CM','L','G','KG')) AND (NOT "unitLocked" OR "defaultUnitCode" IS NOT NULL));
ALTER TABLE sobra_corte."StockItem" ADD CONSTRAINT "StockItem_unit_catalog" CHECK (unit IS NOT NULL AND unit IN ('UN','PAR','CX','ROLO','M','M²','CM','L','G','KG')),
 ADD CONSTRAINT "StockItem_unit_quantities" CHECK (NOT (unit IN ('UN','PAR','CX','ROLO') OR sector::text IN ('APOIO','PRE_FABRICADO','DISTRIBUICAO','EXPEDICAO','MONTAGEM')) OR (quantity = trunc(quantity) AND "minStock" = trunc("minStock")));
COMMIT;
