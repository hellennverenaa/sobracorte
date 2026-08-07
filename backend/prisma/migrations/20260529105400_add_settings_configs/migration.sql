-- CreateTable
CREATE TABLE "sobra_corte"."CategoryConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unitLock" TEXT NOT NULL DEFAULT 'livre',

    CONSTRAINT "CategoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sobra_corte"."OriginConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "OriginConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryConfig_name_key" ON "sobra_corte"."CategoryConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OriginConfig_name_key" ON "sobra_corte"."OriginConfig"("name");
