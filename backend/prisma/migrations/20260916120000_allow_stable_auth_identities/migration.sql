-- Local usernames, emails and registrations are provider attributes, not
-- identities. The stable identity is factoryUnitId + authOrigin + authUserId.
DROP INDEX IF EXISTS "sobra_corte"."User_factoryUnitId_usuario_key";
DROP INDEX IF EXISTS "sobra_corte"."User_factoryUnitId_email_key";
DROP INDEX IF EXISTS "sobra_corte"."User_factoryUnitId_matriculaDass_key";

CREATE UNIQUE INDEX IF NOT EXISTS "User_factoryUnitId_authOrigin_authUserId_key"
  ON "sobra_corte"."User"("factoryUnitId", "authOrigin", "authUserId");
