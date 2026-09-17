-- Expansão sem reconstituir atributos históricos a partir do cadastro atual.
ALTER TABLE sobra_corte."StockMovement"
  ADD COLUMN "itemModelName" TEXT,
  ADD COLUMN "itemSizeGrade" TEXT,
  ADD COLUMN "itemFootSide" TEXT,
  ADD COLUMN "itemColor" TEXT,
  ADD COLUMN "sourceStockItemId" INTEGER,
  ADD COLUMN "destinationStockItemId" INTEGER,
  ADD COLUMN "sourceSector" sobra_corte."SectorType",
  ADD COLUMN "destinationSector" sobra_corte."SectorType";
