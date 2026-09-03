-- matriculaDass is an external authentication identifier, not a cross-domain
-- foreign key. This migration only creates the application's local user table.
CREATE TABLE "sobra_corte"."User" (
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

CREATE UNIQUE INDEX "User_usuario_key" ON "sobra_corte"."User"("usuario");
CREATE UNIQUE INDEX "User_email_key" ON "sobra_corte"."User"("email");
CREATE UNIQUE INDEX "User_matriculaDass_key" ON "sobra_corte"."User"("matriculaDass");
CREATE INDEX "User_usuario_idx" ON "sobra_corte"."User"("usuario");
CREATE INDEX "User_email_idx" ON "sobra_corte"."User"("email");
