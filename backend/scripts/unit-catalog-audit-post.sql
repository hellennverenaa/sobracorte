BEGIN READ ONLY;
WITH unit_aliases(alias, code) AS (VALUES
  ('M2','M²'), ('M²','M²'), ('MT2','M²'), ('M^2','M²'),
  ('METRO QUADRADO','M²'), ('METROS QUADRADOS','M²'), ('METRO_QUADRADO','M²'), ('M2.','M²'),
  ('M','M'), ('MT','M'), ('METRO','M'), ('METROS','M'), ('M.','M'),
  ('KG','KG'), ('KGS','KG'), ('KILO','KG'), ('QUILOGRAMA','KG'), ('QUILO','KG'), ('QUILOGRAMAS','KG'), ('QUILOS','KG'), ('KG.','KG'),
  ('G','G'), ('GR','G'), ('GRAMA','G'), ('GRAMAS','G'), ('G.','G'),
  ('PAR','PAR'), ('PARES','PAR'), ('PR','PAR'), ('PAR.','PAR'),
  ('ROLO','ROLO'), ('ROLOS','ROLO'), ('RL','ROLO'), ('RL.','ROLO'),
  ('CX','CX'), ('CXS','CX'), ('CAIXA','CX'), ('CAIXAS','CX'), ('CX.','CX'),
  ('CM','CM'), ('CENTIMETRO','CM'), ('CENTÍMETRO','CM'), ('CENTIMETROS','CM'), ('CENTÍMETROS','CM'), ('CM.','CM'),
  ('L','L'), ('LT','L'), ('LTS','L'), ('LITRO','L'), ('LITROS','L'), ('L.','L'),
  ('UN','UN'), ('UND','UN'), ('UNIDADE','UN'), ('UNIDADES','UN'), ('PC','UN'), ('PÇ','UN'), ('PECA','UN'), ('PEÇA','UN'), ('PECAS','UN'), ('PEÇAS','UN'), ('UN.','UN')
), stock_violations AS (
  SELECT 'stock_unknown_unit' AS issue, s.id, coalesce(s.unit, '<NULL>') AS value
  FROM sobra_corte."StockItem" s
  LEFT JOIN unit_aliases a ON a.alias = upper(trim(s.unit))
  WHERE s.unit IS NULL OR a.code IS NULL
  UNION ALL
  SELECT 'stock_noncanonical_unit', s.id, s.unit
  FROM sobra_corte."StockItem" s
  JOIN unit_aliases a ON a.alias = upper(trim(s.unit))
  WHERE s.unit <> a.code
  UNION ALL
  SELECT 'stock_quantity', s.id, concat('quantity=', s.quantity, ', minStock=', coalesce(s."minStock"::text, '<NULL>'))
  FROM sobra_corte."StockItem" s
  WHERE s.quantity < 0
     OR coalesce(s."minStock", 0) < 0
     OR (
       (upper(trim(s.unit)) IN ('UN', 'UND', 'PC', 'PAR', 'CX', 'ROLO')
         OR s.sector::text IN ('APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'))
       AND (s.quantity <> trunc(s.quantity) OR coalesce(s."minStock", 0) <> trunc(coalesce(s."minStock", 0)))
     )
  UNION ALL
  SELECT 'location_quantity', l."stockItemId", l.quantity::text
  FROM sobra_corte."StockItemLocation" l
  JOIN sobra_corte."StockItem" s ON s.id = l."stockItemId" AND s."factoryUnitId" = l."factoryUnitId"
  WHERE l.quantity < 0
     OR (
       (upper(trim(s.unit)) IN ('UN', 'UND', 'PC', 'PAR', 'CX', 'ROLO')
         OR s.sector::text IN ('APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'))
       AND l.quantity <> trunc(l.quantity)
     )
  UNION ALL
  SELECT 'category_unknown_default', c.id, coalesce(c."defaultUnitCode", '<NULL>')
  FROM sobra_corte."CategoryConfig" c
  LEFT JOIN unit_aliases a ON a.alias = upper(trim(c."defaultUnitCode"))
  WHERE c."defaultUnitCode" IS NOT NULL AND a.code IS NULL
  UNION ALL
  SELECT 'category_noncanonical_default', c.id, c."defaultUnitCode"
  FROM sobra_corte."CategoryConfig" c
  JOIN unit_aliases a ON a.alias = upper(trim(c."defaultUnitCode"))
  WHERE c."defaultUnitCode" <> a.code
  UNION ALL
  SELECT 'category_locked_without_default', c.id, '<NULL>'
  FROM sobra_corte."CategoryConfig" c
  WHERE c."unitLocked" AND (c."defaultUnitCode" IS NULL OR trim(c."defaultUnitCode") = '')
)
SELECT issue, id, value FROM stock_violations
ORDER BY issue, id;
ROLLBACK;
