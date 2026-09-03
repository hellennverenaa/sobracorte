-- ============================================================================
-- Migration: 20260903000000_v3_schema_alignment
-- Alinhamento Estrutural do SobraCorte v3.0 (Multi-Setor & Requisições Digitais)
-- ============================================================================

-- 1. Expansão de Enums Existentes
ALTER TYPE "sobra_corte"."FootSide" ADD VALUE IF NOT EXISTS 'PAR';
ALTER TYPE "sobra_corte"."MovementType" ADD VALUE IF NOT EXISTS 'SAIDA_REQUISICAO';

-- 2. Criação do Enum RequisitionStatus
DO $$ BEGIN
    CREATE TYPE "sobra_corte"."RequisitionStatus" AS ENUM ('PENDENTE', 'ATENDIDA_TOTAL', 'ATENDIDA_PARCIAL', 'CANCELADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Adição de Colunas Setoriais e Índices de Performance
ALTER TABLE "sobra_corte"."Location" ADD COLUMN IF NOT EXISTS "sector" "sobra_corte"."SectorType";
CREATE INDEX IF NOT EXISTS "Location_factoryUnitId_sector_idx" ON "sobra_corte"."Location"("factoryUnitId", "sector");

ALTER TABLE "sobra_corte"."User" ADD COLUMN IF NOT EXISTS "assignedSector" "sobra_corte"."SectorType";

ALTER TABLE "sobra_corte"."OriginConfig" ADD COLUMN IF NOT EXISTS "sector" "sobra_corte"."SectorType";
CREATE INDEX IF NOT EXISTS "OriginConfig_factoryUnitId_sector_idx" ON "sobra_corte"."OriginConfig"("factoryUnitId", "sector");

-- 4. Criação da Tabela de Requisições Digitais (MaterialRequisition)
CREATE TABLE IF NOT EXISTS "sobra_corte"."MaterialRequisition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requestSector" "sobra_corte"."SectorType" NOT NULL,
    "sku" TEXT,
    "modelName" TEXT,
    "description" TEXT NOT NULL,
    "sizeGrade" TEXT,
    "footSide" "sobra_corte"."FootSide",
    "quantityRequested" DOUBLE PRECISION NOT NULL,
    "quantityFulfilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" "sobra_corte"."RequisitionStatus" NOT NULL DEFAULT 'PENDENTE',
    "requesterId" TEXT,
    "requesterName" TEXT,
    "factoryUnitId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRequisition_pkey" PRIMARY KEY ("id")
);

-- Chave Estrangeira de Unidade Fabril (Multi-Tenancy)
ALTER TABLE "sobra_corte"."MaterialRequisition" DROP CONSTRAINT IF EXISTS "MaterialRequisition_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_factoryUnitId_fkey" 
    FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índices Estratégicos para Consultas de Requisições
CREATE INDEX IF NOT EXISTS "MaterialRequisition_factoryUnitId_code_idx" ON "sobra_corte"."MaterialRequisition"("factoryUnitId", "code");
CREATE INDEX IF NOT EXISTS "MaterialRequisition_factoryUnitId_status_createdAt_idx" ON "sobra_corte"."MaterialRequisition"("factoryUnitId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MaterialRequisition_factoryUnitId_requestSector_status_idx" ON "sobra_corte"."MaterialRequisition"("factoryUnitId", "requestSector", "status");
CREATE INDEX IF NOT EXISTS "MaterialRequisition_factoryUnitId_sku_idx" ON "sobra_corte"."MaterialRequisition"("factoryUnitId", "sku");

-- 5. Eliminação Idempotente de Chave Estrangeira com Schemas Externos
ALTER TABLE "sobra_corte"."User" DROP CONSTRAINT IF EXISTS "User_matriculaDass_fkey";
