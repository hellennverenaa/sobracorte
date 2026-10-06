-- Localizações antigas continuam exigindo vínculo explícito de categoria.
-- O modo ALL é atribuído somente a localizações novas que o usuário configurar assim.
ALTER TABLE "sobra_corte"."Location"
  ADD COLUMN "categoryMode" "sobra_corte"."SubsectorCategoryMode" NOT NULL DEFAULT 'SELECTED';
