-- Retira CONSUMO somente quando não existir nenhuma referência persistida.
-- Não use CASCADE: dependências não mapeadas devem impedir a migration.
BEGIN;

LOCK TABLE sobra_corte."StockItem", sobra_corte."StockMovement", sobra_corte."CategoryConfig",
  sobra_corte."OriginConfig", sobra_corte."Location", sobra_corte."User", sobra_corte."UserRoleBinding",
  sobra_corte."MaterialRequisition", sobra_corte."RoleChangeAudit" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE occurrences integer;
BEGIN
  SELECT count(*) INTO occurrences FROM (
    SELECT 1 FROM sobra_corte."StockItem" WHERE sector::text = 'CONSUMO'
    UNION ALL SELECT 1 FROM sobra_corte."StockMovement" WHERE sector::text = 'CONSUMO' OR "sourceSector"::text = 'CONSUMO' OR "destinationSector"::text = 'CONSUMO'
    UNION ALL SELECT 1 FROM sobra_corte."CategoryConfig" WHERE sector::text = 'CONSUMO'
    UNION ALL SELECT 1 FROM sobra_corte."OriginConfig" WHERE sector::text = 'CONSUMO'
    UNION ALL SELECT 1 FROM sobra_corte."Location" WHERE sector::text = 'CONSUMO'
    UNION ALL SELECT 1 FROM sobra_corte."User" WHERE "assignedSector"::text = 'CONSUMO'
    UNION ALL SELECT 1 FROM sobra_corte."UserRoleBinding" WHERE "assignedSector"::text = 'CONSUMO'
    UNION ALL SELECT 1 FROM sobra_corte."MaterialRequisition" WHERE "requestSector"::text = 'CONSUMO'
    UNION ALL SELECT 1 FROM sobra_corte."RoleChangeAudit" WHERE "previousSector"::text = 'CONSUMO' OR "newSector"::text = 'CONSUMO'
  ) references_to_consumo;
  IF occurrences <> 0 THEN
    RAISE EXCEPTION 'Retirada de CONSUMO bloqueada: % referência(s) encontrada(s)', occurrences;
  END IF;
END $$;

DO $$
DECLARE dependency_count integer;
BEGIN
  SELECT count(*) INTO dependency_count
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'sobra_corte' AND c.relkind IN ('r', 'p') AND t.typname = 'SectorType'
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF dependency_count <> 12 THEN
    RAISE EXCEPTION 'Retirada de CONSUMO bloqueada: esperadas 12 colunas SectorType, encontradas %', dependency_count;
  END IF;
END $$;

ALTER TABLE sobra_corte."StockItem" ALTER COLUMN sector DROP DEFAULT;
ALTER TYPE sobra_corte."SectorType" RENAME TO "SectorType_retired";
CREATE TYPE sobra_corte."SectorType" AS ENUM ('CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM', 'CONFIGURACOES');

ALTER TABLE sobra_corte."StockItem" ALTER COLUMN sector TYPE sobra_corte."SectorType" USING sector::text::sobra_corte."SectorType";
ALTER TABLE sobra_corte."StockMovement" ALTER COLUMN sector TYPE sobra_corte."SectorType" USING sector::text::sobra_corte."SectorType", ALTER COLUMN "sourceSector" TYPE sobra_corte."SectorType" USING "sourceSector"::text::sobra_corte."SectorType", ALTER COLUMN "destinationSector" TYPE sobra_corte."SectorType" USING "destinationSector"::text::sobra_corte."SectorType";
ALTER TABLE sobra_corte."CategoryConfig" ALTER COLUMN sector TYPE sobra_corte."SectorType" USING sector::text::sobra_corte."SectorType";
ALTER TABLE sobra_corte."OriginConfig" ALTER COLUMN sector TYPE sobra_corte."SectorType" USING sector::text::sobra_corte."SectorType";
ALTER TABLE sobra_corte."Location" ALTER COLUMN sector TYPE sobra_corte."SectorType" USING sector::text::sobra_corte."SectorType";
ALTER TABLE sobra_corte."User" ALTER COLUMN "assignedSector" TYPE sobra_corte."SectorType" USING "assignedSector"::text::sobra_corte."SectorType";
ALTER TABLE sobra_corte."UserRoleBinding" ALTER COLUMN "assignedSector" TYPE sobra_corte."SectorType" USING "assignedSector"::text::sobra_corte."SectorType";
ALTER TABLE sobra_corte."MaterialRequisition" ALTER COLUMN "requestSector" TYPE sobra_corte."SectorType" USING "requestSector"::text::sobra_corte."SectorType";
ALTER TABLE sobra_corte."RoleChangeAudit" ALTER COLUMN "previousSector" TYPE sobra_corte."SectorType" USING "previousSector"::text::sobra_corte."SectorType", ALTER COLUMN "newSector" TYPE sobra_corte."SectorType" USING "newSector"::text::sobra_corte."SectorType";

DROP TYPE sobra_corte."SectorType_retired";
ALTER TABLE sobra_corte."StockItem" ALTER COLUMN sector SET DEFAULT 'CORTE'::sobra_corte."SectorType";
COMMIT;
