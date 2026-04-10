-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "autenticacao";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sobra_corte";

-- CreateTable
CREATE TABLE IF NOT EXISTS "sobra_corte"."Material" (
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

-- CreateTable
CREATE TABLE IF NOT EXISTS "sobra_corte"."Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sobra_corte"."MaterialLocation" (
    "materialId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "MaterialLocation_pkey" PRIMARY KEY ("materialId","locationId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sobra_corte"."Movement" (
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

-- CreateTable
CREATE TABLE IF NOT EXISTS "sobra_corte"."User" (
    "id" SERIAL NOT NULL,
    "usuario" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "setor" TEXT,
    "funcao" TEXT,
    "role" TEXT NOT NULL DEFAULT 'leitor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "matriculaDass" BIGINT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "autenticacao"."usuarios" (
    "id" BIGSERIAL NOT NULL,
    "createdat" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedat" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "codigo_barras" BIGINT NOT NULL,
    "matricula" BIGINT NOT NULL,
    "nome" VARCHAR,
    "usuario" VARCHAR,
    "senha" VARCHAR,
    "funcao" VARCHAR,
    "setor" VARCHAR,
    "teste_calce" INTEGER DEFAULT 0,
    "pense_aja" INTEGER DEFAULT 0,
    "season" INTEGER DEFAULT 0,
    "ambulatorio" INTEGER DEFAULT 0,
    "limpeza" INTEGER DEFAULT 0,
    "telas" INTEGER,
    "unidade" VARCHAR,
    "nivel" VARCHAR,
    "pe_confirmado" INTEGER,
    "rfid" BIGINT,

    CONSTRAINT "usuarios_pk" PRIMARY KEY ("id","codigo_barras","matricula")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Material_code_key" ON "sobra_corte"."Material"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Material_name_idx" ON "sobra_corte"."Material"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Material_code_idx" ON "sobra_corte"."Material"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Location_name_key" ON "sobra_corte"."Location"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialLocation_locationId_idx" ON "sobra_corte"."MaterialLocation"("locationId");       

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Movement_materialId_idx" ON "sobra_corte"."Movement"("materialId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Movement_createdAt_idx" ON "sobra_corte"."Movement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_usuario_key" ON "sobra_corte"."User"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "sobra_corte"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_matriculaDass_key" ON "sobra_corte"."User"("matriculaDass");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_usuario_idx" ON "sobra_corte"."User"("usuario");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "sobra_corte"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "matricula_unique" ON "autenticacao"."usuarios"("matricula");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialLocation_materialId_fkey') THEN
        ALTER TABLE "sobra_corte"."MaterialLocation" ADD CONSTRAINT "MaterialLocation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "sobra_corte"."Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialLocation_locationId_fkey') THEN
        ALTER TABLE "sobra_corte"."MaterialLocation" ADD CONSTRAINT "MaterialLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "sobra_corte"."Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Movement_materialId_fkey') THEN
        ALTER TABLE "sobra_corte"."Movement" ADD CONSTRAINT "Movement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "sobra_corte"."Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_matriculaDass_fkey') THEN
        ALTER TABLE "sobra_corte"."User" ADD CONSTRAINT "User_matriculaDass_fkey" FOREIGN KEY ("matriculaDass") REFERENCES "autenticacao"."usuarios"("matricula") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;