-- Shared settings are explicit application defaults. Categories and locations
-- remain local configuration and therefore start empty outside SEST.
INSERT INTO "sobra_corte"."UnitConfig" ("name", "symbol", "active", "factoryUnitId")
SELECT defaults.name, defaults.symbol, true, factory."id"
FROM "sobra_corte"."FactoryUnit" factory
CROSS JOIN (VALUES
    ('Metro', 'm'),
    ('Metro Quadrado', 'm²'),
    ('Quilograma', 'kg'),
    ('Grama', 'g'),
    ('Unidade', 'un'),
    ('Par', 'par'),
    ('Rolo', 'rolo'),
    ('Centímetro', 'cm'),
    ('Litro', 'l'),
    ('Caixa', 'cx')
) AS defaults(name, symbol)
ON CONFLICT ("factoryUnitId", "symbol") DO NOTHING;

INSERT INTO "sobra_corte"."OriginConfig" ("name", "factoryUnitId")
SELECT defaults.name, factory."id"
FROM "sobra_corte"."FactoryUnit" factory
CROSS JOIN (VALUES
    ('Consumo'),
    ('Devolução de Produção'),
    ('Dublagem / Tirada'),
    ('Erro de Enfesto/Corte'),
    ('Ganho no Rolo do Material'),
    ('Outros'),
    ('Retalho Aproveitável'),
    ('Sobra de Requisição')
) AS defaults(name)
ON CONFLICT ("factoryUnitId", "name") DO NOTHING;

DO $$
DECLARE
    stj_id INTEGER;
BEGIN
    SELECT "id" INTO stj_id
    FROM "sobra_corte"."FactoryUnit"
    WHERE "code" = 'STJ';

    IF stj_id IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM "sobra_corte"."Material" WHERE "factoryUnitId" = stj_id)
       OR EXISTS (SELECT 1 FROM "sobra_corte"."Movement" WHERE "factoryUnitId" = stj_id)
       OR EXISTS (SELECT 1 FROM "sobra_corte"."MaterialLocation" WHERE "factoryUnitId" = stj_id) THEN
        RAISE EXCEPTION 'STJ possui dados operacionais; categorias e localizações não foram limpas';
    END IF;

    DELETE FROM "sobra_corte"."Location" WHERE "factoryUnitId" = stj_id;
    DELETE FROM "sobra_corte"."CategoryConfig" WHERE "factoryUnitId" = stj_id;
END $$;
