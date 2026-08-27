-- CreateTable: LocationCategory (Vínculo de Localização a Múltiplas Categorias)
CREATE TABLE IF NOT EXISTS sobra_corte."LocationCategory" (
    "locationId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "factoryUnitId" INTEGER NOT NULL,

    CONSTRAINT "LocationCategory_pkey" PRIMARY KEY ("locationId", "categoryId"),
    CONSTRAINT "LocationCategory_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId") REFERENCES sobra_corte."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LocationCategory_locationId_factoryUnitId_fkey" FOREIGN KEY ("locationId", "factoryUnitId") REFERENCES sobra_corte."Location"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LocationCategory_categoryId_factoryUnitId_fkey" FOREIGN KEY ("categoryId", "factoryUnitId") REFERENCES sobra_corte."CategoryConfig"("id", "factoryUnitId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Índices de alta performance
CREATE INDEX IF NOT EXISTS "LocationCategory_factoryUnitId_locationId_idx" ON sobra_corte."LocationCategory"("factoryUnitId", "locationId");
CREATE INDEX IF NOT EXISTS "LocationCategory_factoryUnitId_categoryId_idx" ON sobra_corte."LocationCategory"("factoryUnitId", "categoryId");

-- Migração de dados legados existentes em Location.categoryId para a nova tabela de junção
INSERT INTO sobra_corte."LocationCategory" ("locationId", "categoryId", "factoryUnitId")
SELECT l.id, l."categoryId", l."factoryUnitId"
FROM sobra_corte."Location" l
WHERE l."categoryId" IS NOT NULL
ON CONFLICT ("locationId", "categoryId") DO NOTHING;
