-- AlterTable
ALTER TABLE "sobra_corte"."User" ADD COLUMN "matriculaDass" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "User_matriculaDass_key" ON "sobra_corte"."User"("matriculaDass");

-- AddForeignKey
ALTER TABLE "sobra_corte"."User" ADD CONSTRAINT "User_matriculaDass_fkey" FOREIGN KEY ("matriculaDass") REFERENCES "autenticacao"."usuarios"("matricula") ON DELETE SET NULL ON UPDATE CASCADE;

npx prisma migrate diff --from-url="postgresql://postgres:admin123@127.0.0.1:5432/sobracorte" --to-schema=prisma/schema.prisma --script