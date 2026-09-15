-- Upgrade after the production history through 20260913000000.
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

-- The production source already uses multiple categories per location. Copy
-- every link for the new factories instead of selecting one arbitrary category.
INSERT INTO sobra_corte."LocationCategory" ("locationId", "categoryId", "factoryUnitId")
SELECT target_location.id, target_category.id, target_factory.id
FROM sobra_corte."FactoryUnit" source_factory
JOIN sobra_corte."Location" source_location ON source_location."factoryUnitId" = source_factory.id
JOIN sobra_corte."LocationCategory" source_link
  ON source_link."locationId" = source_location.id AND source_link."factoryUnitId" = source_factory.id
JOIN sobra_corte."CategoryConfig" source_category
  ON source_category.id = source_link."categoryId" AND source_category."factoryUnitId" = source_factory.id
JOIN sobra_corte."FactoryUnit" target_factory ON target_factory.code IN ('ITB', 'VDC', 'ITP')
JOIN sobra_corte."Location" target_location
  ON target_location."factoryUnitId" = target_factory.id AND target_location.name = source_location.name
JOIN sobra_corte."CategoryConfig" target_category
  ON target_category."factoryUnitId" = target_factory.id AND target_category.name = source_category.name
WHERE source_factory.code = 'SEST'
ON CONFLICT ("locationId", "categoryId") DO NOTHING;
