-- Expansion only: legacy User remains available until the authorized contraction.
CREATE TABLE "sobra_corte"."AuthIdentity" (
  "id" SERIAL NOT NULL,
  "nativeUnitId" INTEGER NOT NULL,
  "authOrigin" TEXT NOT NULL,
  "authUserId" TEXT NOT NULL,
  "usuario" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "setor" TEXT,
  "funcao" TEXT,
  "matriculaDass" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthIdentity_nativeUnitId_fkey" FOREIGN KEY ("nativeUnitId")
    REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AuthIdentity_nativeUnitId_authOrigin_authUserId_key"
  ON "sobra_corte"."AuthIdentity"("nativeUnitId", "authOrigin", "authUserId");
CREATE INDEX "AuthIdentity_nativeUnitId_matriculaDass_idx"
  ON "sobra_corte"."AuthIdentity"("nativeUnitId", "matriculaDass");

CREATE TABLE "sobra_corte"."UserRoleBinding" (
  "id" SERIAL NOT NULL,
  "identityId" INTEGER NOT NULL,
  "factoryUnitId" INTEGER NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'leitor',
  "assignedSector" "sobra_corte"."SectorType",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRoleBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserRoleBinding_identityId_fkey" FOREIGN KEY ("identityId")
    REFERENCES "sobra_corte"."AuthIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserRoleBinding_factoryUnitId_fkey" FOREIGN KEY ("factoryUnitId")
    REFERENCES "sobra_corte"."FactoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserRoleBinding_identityId_factoryUnitId_key"
  ON "sobra_corte"."UserRoleBinding"("identityId", "factoryUnitId");
CREATE UNIQUE INDEX "UserRoleBinding_id_factoryUnitId_key"
  ON "sobra_corte"."UserRoleBinding"("id", "factoryUnitId");
CREATE INDEX "UserRoleBinding_factoryUnitId_identityId_idx"
  ON "sobra_corte"."UserRoleBinding"("factoryUnitId", "identityId");

ALTER TABLE "sobra_corte"."RoleChangeAudit" ADD COLUMN "bindingId" INTEGER;
ALTER TABLE "sobra_corte"."RoleChangeAudit"
  ADD CONSTRAINT "RoleChangeAudit_bindingId_fkey" FOREIGN KEY ("bindingId")
  REFERENCES "sobra_corte"."UserRoleBinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ambiguous legacy groups are reported and deliberately excluded from the
-- backfill. A later contraction must refuse a non-empty report.
CREATE TABLE "sobra_corte"."IdentityMigrationConflict" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "conflictKey" TEXT NOT NULL UNIQUE,
  "nativeUnitId" INTEGER NOT NULL,
  "authOrigin" TEXT NOT NULL,
  "authUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "legacyUserIds" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "sobra_corte"."IdentityMigrationConflict"
  ("conflictKey", "nativeUnitId", "authOrigin", "authUserId", "reason", "legacyUserIds")
SELECT
  concat("factoryUnitId", ':', COALESCE(NULLIF("authOrigin", ''), 'LEGADO'), ':', COALESCE(NULLIF("authUserId", ''), "usuario")),
  "factoryUnitId",
  COALESCE(NULLIF("authOrigin", ''), 'LEGADO'),
  COALESCE(NULLIF("authUserId", ''), "usuario"),
  'MULTIPLE_LEGACY_USERS_FOR_STABLE_IDENTITY',
  jsonb_agg("id" ORDER BY "id")
FROM "sobra_corte"."User"
GROUP BY 1, 2, 3, 4
HAVING count(*) > 1
ON CONFLICT ("conflictKey") DO NOTHING;

WITH normalized AS (
  SELECT u.*,
    COALESCE(NULLIF(u."authOrigin", ''), 'LEGADO') AS normalized_origin,
    COALESCE(NULLIF(u."authUserId", ''), u."usuario") AS normalized_user_id,
    count(*) OVER (
      PARTITION BY u."factoryUnitId", COALESCE(NULLIF(u."authOrigin", ''), 'LEGADO'), COALESCE(NULLIF(u."authUserId", ''), u."usuario")
    ) AS identity_count
  FROM "sobra_corte"."User" u
)
INSERT INTO "sobra_corte"."AuthIdentity"
  ("nativeUnitId", "authOrigin", "authUserId", "usuario", "nome", "email", "setor", "funcao", "matriculaDass", "createdAt", "updatedAt")
SELECT "factoryUnitId", normalized_origin, normalized_user_id, "usuario", "nome", "email", "setor", "funcao", "matriculaDass", "createdAt", "updatedAt"
FROM normalized
WHERE identity_count = 1
ON CONFLICT ("nativeUnitId", "authOrigin", "authUserId") DO UPDATE SET
  "usuario" = EXCLUDED."usuario",
  "nome" = EXCLUDED."nome",
  "email" = EXCLUDED."email",
  "setor" = EXCLUDED."setor",
  "funcao" = EXCLUDED."funcao",
  "matriculaDass" = EXCLUDED."matriculaDass";

INSERT INTO "sobra_corte"."UserRoleBinding"
  ("identityId", "factoryUnitId", "role", "assignedSector", "createdAt", "updatedAt")
SELECT i."id", u."factoryUnitId", u."role", u."assignedSector", u."createdAt", u."updatedAt"
FROM "sobra_corte"."User" u
JOIN "sobra_corte"."AuthIdentity" i
  ON i."nativeUnitId" = u."factoryUnitId"
 AND i."authOrigin" = COALESCE(NULLIF(u."authOrigin", ''), 'LEGADO')
 AND i."authUserId" = COALESCE(NULLIF(u."authUserId", ''), u."usuario")
WHERE NOT EXISTS (
  SELECT 1 FROM "sobra_corte"."IdentityMigrationConflict" c
  WHERE c."conflictKey" = concat(u."factoryUnitId", ':', COALESCE(NULLIF(u."authOrigin", ''), 'LEGADO'), ':', COALESCE(NULLIF(u."authUserId", ''), u."usuario"))
)
ON CONFLICT ("identityId", "factoryUnitId") DO NOTHING;
