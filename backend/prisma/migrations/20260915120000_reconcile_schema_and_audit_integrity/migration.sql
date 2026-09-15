-- ============================================================================
-- Migration: 20260915120000_reconcile_schema_and_audit_integrity
-- Reconciliação do Schema Prisma, Migrações e Integridade Relacional (Ponto 02)
-- ============================================================================

-- 1. Expansão Idempotente de Enums
ALTER TYPE "sobra_corte"."SectorType" ADD VALUE IF NOT EXISTS 'CONSUMO';
ALTER TYPE "sobra_corte"."SectorType" ADD VALUE IF NOT EXISTS 'CONFIGURACOES';
ALTER TYPE "sobra_corte"."MovementType" ADD VALUE IF NOT EXISTS 'CRIACAO_CONFIGURACAO';
ALTER TYPE "sobra_corte"."MovementType" ADD VALUE IF NOT EXISTS 'EDICAO_CONFIGURACAO';
ALTER TYPE "sobra_corte"."MovementType" ADD VALUE IF NOT EXISTS 'EXCLUSAO_CONFIGURACAO';
ALTER TYPE "sobra_corte"."MovementType" ADD VALUE IF NOT EXISTS 'SAIDA_REQUISICAO';

-- 2. Adição de Colunas Faltantes em FactoryUnit
ALTER TABLE "sobra_corte"."FactoryUnit" ADD COLUMN IF NOT EXISTS "enableRequisitions" BOOLEAN NOT NULL DEFAULT true;

-- 3. Criação da Tabela RoleChangeAudit (Auditoria de Permissões RBAC)
CREATE TABLE IF NOT EXISTS "sobra_corte"."RoleChangeAudit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "usuario" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "previousRole" TEXT NOT NULL,
    "newRole" TEXT NOT NULL,
    "previousSector" "sobra_corte"."SectorType",
    "newSector" "sobra_corte"."SectorType",
    "changedById" TEXT,
    "changedByName" TEXT NOT NULL,
    "factoryUnitId" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleChangeAudit_pkey" PRIMARY KEY ("id")
);

-- Foreign Key para RoleChangeAudit
ALTER TABLE "sobra_corte"."RoleChangeAudit" DROP CONSTRAINT IF EXISTS "RoleChangeAudit_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."RoleChangeAudit" ADD CONSTRAINT "RoleChangeAudit_factoryUnitId_fkey" 
    FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índices para RoleChangeAudit
CREATE INDEX IF NOT EXISTS "RoleChangeAudit_factoryUnitId_userId_idx" ON "sobra_corte"."RoleChangeAudit"("factoryUnitId", "userId");
CREATE INDEX IF NOT EXISTS "RoleChangeAudit_factoryUnitId_changedAt_idx" ON "sobra_corte"."RoleChangeAudit"("factoryUnitId", "changedAt" DESC);

-- 4. Criação da Tabela MaterialDeletionAudit (Auditoria e Snapshots de Exclusão)
CREATE TABLE IF NOT EXISTS "sobra_corte"."MaterialDeletionAudit" (
    "id" SERIAL NOT NULL,
    "factoryUnitId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryName" TEXT,
    "unitSymbol" TEXT NOT NULL,
    "quantity" DECIMAL(18, 3) NOT NULL,
    "locations" JSONB,
    "deletedById" TEXT,
    "deletedByName" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialDeletionAudit_pkey" PRIMARY KEY ("id")
);

-- Foreign Key para MaterialDeletionAudit
ALTER TABLE "sobra_corte"."MaterialDeletionAudit" DROP CONSTRAINT IF EXISTS "MaterialDeletionAudit_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."MaterialDeletionAudit" ADD CONSTRAINT "MaterialDeletionAudit_factoryUnitId_fkey" 
    FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índices para MaterialDeletionAudit
CREATE INDEX IF NOT EXISTS "MaterialDeletionAudit_factoryUnitId_deletedAt_idx" ON "sobra_corte"."MaterialDeletionAudit"("factoryUnitId", "deletedAt");
CREATE INDEX IF NOT EXISTS "MaterialDeletionAudit_factoryUnitId_code_idx" ON "sobra_corte"."MaterialDeletionAudit"("factoryUnitId", "code");

-- 5. Coluna e Índice de Cor em MaterialRequisition
ALTER TABLE "sobra_corte"."MaterialRequisition" ADD COLUMN IF NOT EXISTS "color" TEXT;
CREATE INDEX IF NOT EXISTS "MaterialRequisition_factoryUnitId_sku_color_idx" ON "sobra_corte"."MaterialRequisition"("factoryUnitId", "sku", "color");

-- 6. Adição de Snapshots Imutáveis em Movement e StockMovement
ALTER TABLE "sobra_corte"."Movement" ADD COLUMN IF NOT EXISTS "materialCode" TEXT;
ALTER TABLE "sobra_corte"."Movement" ADD COLUMN IF NOT EXISTS "materialName" TEXT;
ALTER TABLE "sobra_corte"."Movement" ADD COLUMN IF NOT EXISTS "materialCategory" TEXT;
ALTER TABLE "sobra_corte"."Movement" ADD COLUMN IF NOT EXISTS "materialUnit" TEXT;
ALTER TABLE "sobra_corte"."Movement" ADD COLUMN IF NOT EXISTS "locationName" TEXT;

ALTER TABLE "sobra_corte"."StockMovement" ADD COLUMN IF NOT EXISTS "itemCode" TEXT;
ALTER TABLE "sobra_corte"."StockMovement" ADD COLUMN IF NOT EXISTS "itemName" TEXT;
ALTER TABLE "sobra_corte"."StockMovement" ADD COLUMN IF NOT EXISTS "itemCategory" TEXT;
ALTER TABLE "sobra_corte"."StockMovement" ADD COLUMN IF NOT EXISTS "itemUnit" TEXT;
ALTER TABLE "sobra_corte"."StockMovement" ADD COLUMN IF NOT EXISTS "sourceLocationName" TEXT;
ALTER TABLE "sobra_corte"."StockMovement" ADD COLUMN IF NOT EXISTS "destinationLocationName" TEXT;

-- 7. Conversão de Precisão Numérica para DECIMAL(18, 3)
ALTER TABLE "sobra_corte"."Material" ALTER COLUMN "quantity" TYPE DECIMAL(18, 3) USING "quantity"::DECIMAL(18, 3);
ALTER TABLE "sobra_corte"."Material" ALTER COLUMN "minStock" TYPE DECIMAL(18, 3) USING "minStock"::DECIMAL(18, 3);

ALTER TABLE "sobra_corte"."MaterialLocation" ALTER COLUMN "quantity" TYPE DECIMAL(18, 3) USING "quantity"::DECIMAL(18, 3);

ALTER TABLE "sobra_corte"."Movement" ALTER COLUMN "quantity" TYPE DECIMAL(18, 3) USING "quantity"::DECIMAL(18, 3);

ALTER TABLE "sobra_corte"."StockItem" ALTER COLUMN "quantity" TYPE DECIMAL(18, 3) USING "quantity"::DECIMAL(18, 3);
ALTER TABLE "sobra_corte"."StockItem" ALTER COLUMN "minStock" TYPE DECIMAL(18, 3) USING "minStock"::DECIMAL(18, 3);

ALTER TABLE "sobra_corte"."StockItemLocation" ALTER COLUMN "quantity" TYPE DECIMAL(18, 3) USING "quantity"::DECIMAL(18, 3);

ALTER TABLE "sobra_corte"."StockMovement" ALTER COLUMN "quantity" TYPE DECIMAL(18, 3) USING "quantity"::DECIMAL(18, 3);

ALTER TABLE "sobra_corte"."MaterialRequisition" ALTER COLUMN "quantityRequested" TYPE DECIMAL(18, 3) USING "quantityRequested"::DECIMAL(18, 3);
ALTER TABLE "sobra_corte"."MaterialRequisition" ALTER COLUMN "quantityFulfilled" TYPE DECIMAL(18, 3) USING "quantityFulfilled"::DECIMAL(18, 3);

-- 8. Preservação de Histórico de Auditoria (ON DELETE SET NULL)
-- Ajuste em Movement
ALTER TABLE "sobra_corte"."Movement" DROP CONSTRAINT IF EXISTS "Movement_materialId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."Movement" DROP CONSTRAINT IF EXISTS "Movement_materialId_fkey";
ALTER TABLE "sobra_corte"."Movement" ALTER COLUMN "materialId" DROP NOT NULL;
ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_materialId_fkey" 
    FOREIGN KEY ("materialId") REFERENCES "sobra_corte"."Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ajuste em StockMovement
ALTER TABLE "sobra_corte"."StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_stockItemId_factoryUnitId_fkey";
ALTER TABLE "sobra_corte"."StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_stockItemId_fkey";
ALTER TABLE "sobra_corte"."StockMovement" ALTER COLUMN "stockItemId" DROP NOT NULL;
ALTER TABLE "sobra_corte"."StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" 
    FOREIGN KEY ("stockItemId") REFERENCES "sobra_corte"."StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
