BEGIN READ ONLY;
WITH unit_aliases(alias, code) AS (VALUES
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
('UN.','UN')), unit_violations AS (
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
 OR (c."unitLocked" AND c."defaultUnitId" IS NULL AND c."unitLock" = 'livre'))
SELECT * FROM unit_violations
UNION ALL SELECT 'stock_alias', s.id, s.unit FROM sobra_corte."StockItem" s JOIN unit_aliases a ON a.alias = upper(trim(s.unit)) WHERE s.unit <> a.code
UNION ALL SELECT 'category_default', c.id, coalesce(a.code, c."unitLock") FROM sobra_corte."CategoryConfig" c LEFT JOIN sobra_corte."UnitConfig" u ON u.id = c."defaultUnitId" LEFT JOIN unit_aliases a ON a.alias = upper(trim(u.symbol))
ORDER BY issue, id;
ROLLBACK;
