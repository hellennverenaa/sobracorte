ALTER TABLE "sobra_corte"."User" ADD COLUMN "authOrigin" TEXT, ADD COLUMN "authUserId" TEXT;
DROP INDEX IF EXISTS "sobra_corte"."User_factoryUnitId_matriculaDass_key";
CREATE UNIQUE INDEX "User_factoryUnitId_authOrigin_authUserId_key" ON "sobra_corte"."User"("factoryUnitId", "authOrigin", "authUserId");
