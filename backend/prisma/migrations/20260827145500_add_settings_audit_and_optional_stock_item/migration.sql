-- AlterEnum
ALTER TYPE sobra_corte."SectorType" ADD VALUE IF NOT EXISTS 'CONFIGURACOES';
ALTER TYPE sobra_corte."MovementType" ADD VALUE IF NOT EXISTS 'EXCLUSAO_CONFIGURACAO';
ALTER TYPE sobra_corte."MovementType" ADD VALUE IF NOT EXISTS 'EDICAO_CONFIGURACAO';

-- AlterTable: Tornar stockItemId opcional para auditoria de configurações
ALTER TABLE sobra_corte."StockMovement" ALTER COLUMN "stockItemId" DROP NOT NULL;
