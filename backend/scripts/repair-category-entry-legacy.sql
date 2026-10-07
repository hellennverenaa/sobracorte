-- Correção pontual preparada para os itens 4581, 4582 e 4583.
-- Executar somente após aprovação dos vínculos abaixo e antes da migração.
-- Preserva quantidades, lados, locais, movimentos e requisições.
BEGIN;

SELECT id FROM sobra_corte."FactoryUnit" WHERE id IN (1,2) ORDER BY id FOR NO KEY UPDATE;
SELECT id FROM sobra_corte."StockItem" WHERE id IN (4581,4582,4583) ORDER BY id FOR UPDATE;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM sobra_corte."StockItem"
    WHERE "categoryId" IS NULL AND unit = 'UN' AND (
      id = 4581 AND "factoryUnitId" = 2 AND sector::text = 'APOIO'
        AND "componentType"::text = 'PECA_CORTADA' AND "footSide" IS NULL
      OR id = 4582 AND "factoryUnitId" = 1 AND sector::text = 'MONTAGEM'
        AND "componentType"::text = 'PE_PRONTO' AND "footSide"::text = 'E'
      OR id = 4583 AND "factoryUnitId" = 1 AND sector::text = 'MONTAGEM'
        AND "componentType"::text = 'PE_PRONTO' AND "footSide"::text = 'D'
    )) <> 3 THEN
    RAISE EXCEPTION 'Os três itens não correspondem ao estado auditado. Revise antes de corrigir.';
  END IF;
  IF EXISTS (SELECT 1 FROM sobra_corte."CategoryConfig"
    WHERE "factoryUnitId" = 2 AND name = 'MOLDE / PEÇA'
       OR "factoryUnitId" = 1 AND name = 'PE PRONTO') THEN
    RAISE EXCEPTION 'Uma das categorias propostas já existe. Revise seus vínculos antes de corrigir.';
  END IF;
END $$;

INSERT INTO sobra_corte."CategoryConfig" (name, sector, sectors, "defaultUnitCode", "unitLocked", "factoryUnitId")
VALUES ('MOLDE / PEÇA', 'APOIO', ARRAY['APOIO']::sobra_corte."SectorType"[], 'UN', true, 2),
       ('PE PRONTO', 'MONTAGEM', ARRAY['MONTAGEM']::sobra_corte."SectorType"[], 'UN', true, 1);

UPDATE sobra_corte."StockItem" s SET "categoryId" = c.id, type = c.name
FROM sobra_corte."CategoryConfig" c
WHERE s."categoryId" IS NULL AND (
  s.id = 4581 AND c."factoryUnitId" = 2 AND c.name = 'MOLDE / PEÇA'
  OR s.id IN (4582,4583) AND c."factoryUnitId" = 1 AND c.name = 'PE PRONTO'
);

COMMIT;
