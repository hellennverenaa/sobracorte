-- CreateIndex
CREATE INDEX IF NOT EXISTS "Material_type_idx" ON "sobra_corte"."Material"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Material_quantity_idx" ON "sobra_corte"."Material"("quantity" DESC);
