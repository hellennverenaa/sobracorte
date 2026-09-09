-- ============================================================================
-- Migration: 20260909160000_official_sectors_and_category_sector
-- Oficialização dos 5 Setores (Distribuição) e Setorização de Categorias
-- ============================================================================

-- 1. Expansão de Enum SectorType
ALTER TYPE "sobra_corte"."SectorType" ADD VALUE IF NOT EXISTS 'DISTRIBUICAO';

-- 2. Adição da Coluna sector na tabela CategoryConfig
ALTER TABLE "sobra_corte"."CategoryConfig" ADD COLUMN IF NOT EXISTS "sector" "sobra_corte"."SectorType";
CREATE INDEX IF NOT EXISTS "CategoryConfig_factoryUnitId_sector_idx" ON "sobra_corte"."CategoryConfig"("factoryUnitId", "sector");

-- 3. Categorias pré-existentes são atribuídas ao setor CORTE
UPDATE "sobra_corte"."CategoryConfig" SET "sector" = 'CORTE' WHERE "sector" IS NULL;

-- 4. Migração de registros legados de EXPEDICAO para DISTRIBUICAO
UPDATE "sobra_corte"."StockItem" SET "sector" = 'DISTRIBUICAO' WHERE "sector" = 'EXPEDICAO';
UPDATE "sobra_corte"."StockMovement" SET "sector" = 'DISTRIBUICAO' WHERE "sector" = 'EXPEDICAO';
UPDATE "sobra_corte"."Location" SET "sector" = 'DISTRIBUICAO' WHERE "sector" = 'EXPEDICAO';
UPDATE "sobra_corte"."OriginConfig" SET "sector" = 'DISTRIBUICAO' WHERE "sector" = 'EXPEDICAO';
UPDATE "sobra_corte"."User" SET "assignedSector" = 'DISTRIBUICAO' WHERE "assignedSector" = 'EXPEDICAO';
UPDATE "sobra_corte"."MaterialRequisition" SET "requestSector" = 'DISTRIBUICAO' WHERE "requestSector" = 'EXPEDICAO';
