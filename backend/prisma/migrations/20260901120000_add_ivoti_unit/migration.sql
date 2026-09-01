-- Inserção oficial e idempotente da Unidade Ivoti (IVT)
INSERT INTO "sobra_corte"."FactoryUnit" ("code", "name", "active") VALUES
    ('IVT', 'Ivoti', true)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "active" = EXCLUDED."active";

-- Replicar configurações padrão (UnitConfig, CategoryConfig, OriginConfig) de SEST para IVT
DO $$
DECLARE
    sest_unit_id INT;
    ivt_unit_id INT;
BEGIN
    SELECT "id" INTO sest_unit_id FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'SEST';
    SELECT "id" INTO ivt_unit_id FROM "sobra_corte"."FactoryUnit" WHERE "code" = 'IVT';

    IF sest_unit_id IS NOT NULL AND ivt_unit_id IS NOT NULL THEN
        -- A. UnitConfig
        INSERT INTO "sobra_corte"."UnitConfig" ("name", "symbol", "active", "factoryUnitId")
        SELECT u."name", u."symbol", u."active", ivt_unit_id
        FROM "sobra_corte"."UnitConfig" u
        WHERE u."factoryUnitId" = sest_unit_id
          AND NOT EXISTS (
            SELECT 1 FROM "sobra_corte"."UnitConfig" ex
            WHERE ex."factoryUnitId" = ivt_unit_id AND ex."symbol" = u."symbol"
          );

        -- B. CategoryConfig
        INSERT INTO "sobra_corte"."CategoryConfig" ("name", "unitLock", "unitLocked", "defaultUnitId", "factoryUnitId")
        SELECT c."name", c."unitLock", c."unitLocked", tu."id", ivt_unit_id
        FROM "sobra_corte"."CategoryConfig" c
        LEFT JOIN "sobra_corte"."UnitConfig" su ON su."id" = c."defaultUnitId"
        LEFT JOIN "sobra_corte"."UnitConfig" tu ON tu."factoryUnitId" = ivt_unit_id AND tu."symbol" = su."symbol"
        WHERE c."factoryUnitId" = sest_unit_id
          AND NOT EXISTS (
            SELECT 1 FROM "sobra_corte"."CategoryConfig" ex
            WHERE ex."factoryUnitId" = ivt_unit_id AND ex."name" = c."name"
          );

        -- C. OriginConfig
        INSERT INTO "sobra_corte"."OriginConfig" ("name", "sector", "factoryUnitId")
        SELECT o."name", o."sector", ivt_unit_id
        FROM "sobra_corte"."OriginConfig" o
        WHERE o."factoryUnitId" = sest_unit_id
          AND NOT EXISTS (
            SELECT 1 FROM "sobra_corte"."OriginConfig" ex
            WHERE ex."factoryUnitId" = ivt_unit_id AND ex."name" = o."name"
          );
    END IF;
END $$;
