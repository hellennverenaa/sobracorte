-- Upgrade after the production history through 20260913000000.
-- AlterEnum
ALTER TYPE sobra_corte."MovementType" ADD VALUE IF NOT EXISTS 'CRIACAO_CONFIGURACAO';
