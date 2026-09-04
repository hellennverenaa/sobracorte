-- Audit only explicit role changes made through PUT /users/:id.
CREATE TABLE "sobra_corte"."RoleChangeAudit" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "usuario" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "previousRole" TEXT NOT NULL,
  "newRole" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedById" TEXT,
  "changedByName" TEXT,
  "factoryUnitId" INTEGER NOT NULL,
  CONSTRAINT "RoleChangeAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoleChangeAudit_factoryUnitId_fkey"
    FOREIGN KEY ("factoryUnitId") REFERENCES "sobra_corte"."FactoryUnit"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RoleChangeAudit_factoryUnitId_changedAt_idx"
  ON "sobra_corte"."RoleChangeAudit" ("factoryUnitId", "changedAt");
CREATE INDEX "RoleChangeAudit_factoryUnitId_userId_changedAt_idx"
  ON "sobra_corte"."RoleChangeAudit" ("factoryUnitId", "userId", "changedAt");
