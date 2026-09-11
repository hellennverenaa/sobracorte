-- Rename the historical STJ tenant without changing its identity or operational data.
-- Local SobraCorte users are intentionally removed so that SAJ starts with no
-- legacy permissions. Authentication-domain users are owned by another service
-- and are not touched by this migration.
DO $$
DECLARE
  stj_id INTEGER;
  saj_id INTEGER;
BEGIN
  SELECT "id"
  INTO stj_id
  FROM "sobra_corte"."FactoryUnit"
  WHERE "code" = 'STJ';

  SELECT "id"
  INTO saj_id
  FROM "sobra_corte"."FactoryUnit"
  WHERE "code" = 'SAJ';

  -- A second execution after a successful migration is a no-op.
  IF stj_id IS NULL THEN
    IF saj_id IS NULL THEN
      RAISE EXCEPTION 'Unidade STJ não encontrada e unidade SAJ não está provisionada';
    END IF;
    RETURN;
  END IF;

  -- Having both codes would make the intended tenant identity ambiguous.
  IF saj_id IS NOT NULL THEN
    RAISE EXCEPTION 'Conflito: unidade SAJ já existe (id %); STJ não foi renomeada', saj_id;
  END IF;

  DELETE FROM "sobra_corte"."User"
  WHERE "factoryUnitId" = stj_id;

  UPDATE "sobra_corte"."FactoryUnit"
  SET "code" = 'SAJ',
      "name" = 'Santo Antônio de Jesus'
  WHERE "id" = stj_id;
END
$$;
