CREATE TABLE "sobra_corte"."Material" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "observation" TEXT DEFAULT '',
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sobra_corte"."Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sobra_corte"."MaterialLocation" (
    "materialId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION DEFAULT 0,
    CONSTRAINT "MaterialLocation_pkey" PRIMARY KEY ("materialId", "locationId")
);

CREATE TABLE "sobra_corte"."Movement" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" INTEGER NOT NULL,
    "operatorId" TEXT,
    "operatorName" TEXT,
    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Material_code_key" ON "sobra_corte"."Material"("code");
CREATE INDEX "Material_name_idx" ON "sobra_corte"."Material"("name");
CREATE INDEX "Material_code_idx" ON "sobra_corte"."Material"("code");
CREATE UNIQUE INDEX "Location_name_key" ON "sobra_corte"."Location"("name");
CREATE INDEX "MaterialLocation_locationId_idx" ON "sobra_corte"."MaterialLocation"("locationId");
CREATE INDEX "Movement_materialId_idx" ON "sobra_corte"."Movement"("materialId");
CREATE INDEX "Movement_createdAt_idx" ON "sobra_corte"."Movement"("createdAt");

ALTER TABLE "sobra_corte"."MaterialLocation"
    ADD CONSTRAINT "MaterialLocation_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "sobra_corte"."Material"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."MaterialLocation"
    ADD CONSTRAINT "MaterialLocation_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "sobra_corte"."Location"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sobra_corte"."Movement"
    ADD CONSTRAINT "Movement_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "sobra_corte"."Material"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
