-- Disponibiliza motivos de sobra específicos nos setores sem repetir valores
-- já cadastrados em cada unidade fabril.
INSERT INTO "sobra_corte"."OriginConfig" ("name", "sector", "factoryUnitId")
SELECT defaults."name", defaults."sector", factory."id"
FROM "sobra_corte"."FactoryUnit" AS factory
CROSS JOIN (
  VALUES
    ('SOBRA DE PEÇA CORTADA', 'APOIO'::"sobra_corte"."SectorType"),
    ('SOBRA DE EVA', 'PRE_FABRICADO'::"sobra_corte"."SectorType"),
    ('SOBRA DE BORRACHA', 'PRE_FABRICADO'::"sobra_corte"."SectorType"),
    ('SOBRA DE CABEDAL', 'DISTRIBUICAO'::"sobra_corte"."SectorType"),
    ('SOBRA DE SOLA PROCESSADA', 'DISTRIBUICAO'::"sobra_corte"."SectorType"),
    ('SOBRA DE PÉ PRONTO', 'MONTAGEM'::"sobra_corte"."SectorType")
) AS defaults("name", "sector")
ON CONFLICT ("factoryUnitId", "name") DO NOTHING;
