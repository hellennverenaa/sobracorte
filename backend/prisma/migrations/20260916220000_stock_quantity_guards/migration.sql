-- Expansão não destrutiva: valida os dados existentes, sem corrigi-los ou removê-los.
ALTER TABLE sobra_corte."StockItem"
  ADD CONSTRAINT "StockItem_quantity_nonnegative" CHECK (quantity >= 0),
  ADD CONSTRAINT "StockItem_minStock_nonnegative" CHECK ("minStock" >= 0);
ALTER TABLE sobra_corte."StockItemLocation"
  ADD CONSTRAINT "StockItemLocation_quantity_nonnegative" CHECK (quantity >= 0);
ALTER TABLE sobra_corte."StockMovement"
  DROP CONSTRAINT IF EXISTS "Movement_quantity_positive",
  ADD CONSTRAINT "StockMovement_quantity_positive"
  CHECK (quantity >= 0 AND (quantity > 0 OR type IN ('EDICAO_CONFIGURACAO', 'EXCLUSAO_CONFIGURACAO', 'CRIACAO_CONFIGURACAO')));
ALTER TABLE sobra_corte."MaterialRequisition"
  ADD CONSTRAINT "MaterialRequisition_quantity_bounds"
  CHECK ("quantityRequested" > 0 AND "quantityFulfilled" >= 0 AND "quantityFulfilled" <= "quantityRequested");
