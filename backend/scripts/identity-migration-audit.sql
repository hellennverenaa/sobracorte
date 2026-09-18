-- Somente contagens por unidade; nunca imprime dados cadastrais.
WITH legacy AS (
  SELECT u.*, f.code AS native_code, COALESCE(NULLIF(u."authOrigin", ''), 'LEGADO') AS origin,
    COALESCE(NULLIF(u."authUserId", ''), u.usuario) AS provider_id,
    count(*) OVER (PARTITION BY u."factoryUnitId",
      COALESCE(NULLIF(u."authOrigin", ''), 'LEGADO'), COALESCE(NULLIF(u."authUserId", ''), u.usuario)) AS candidates
  FROM sobra_corte."User" u
  JOIN sobra_corte."FactoryUnit" f ON f.id = u."factoryUnitId"
), violations AS (
  SELECT u."factoryUnitId" AS unit_id, 'ambiguous_legacy_identity'::text AS check_name
  FROM legacy u WHERE candidates > 1
  UNION ALL
  SELECT u."factoryUnitId", 'missing_identity_or_binding'
  FROM legacy u
  LEFT JOIN sobra_corte."AuthIdentity" i ON i."nativeUnitId" = u."factoryUnitId"
    AND i."authOrigin" = u.origin AND i."authUserId" = u.provider_id
  LEFT JOIN sobra_corte."UserRoleBinding" b ON b."identityId" = i.id AND b."factoryUnitId" = u."factoryUnitId"
  WHERE u.candidates = 1 AND (i.id IS NULL OR (b.id IS NULL
    AND NOT COALESCE(u.native_code || ':' || u."matriculaDass"::text = ANY($1::text[]), false)))
  UNION ALL
  SELECT u."factoryUnitId", 'permissions_changed_without_audit'
  FROM legacy u
  JOIN sobra_corte."AuthIdentity" i ON i."nativeUnitId" = u."factoryUnitId"
    AND i."authOrigin" = u.origin AND i."authUserId" = u.provider_id
  JOIN sobra_corte."UserRoleBinding" b ON b."identityId" = i.id AND b."factoryUnitId" = u."factoryUnitId"
  WHERE ROW(b.role, b."assignedSector") IS DISTINCT FROM ROW(u.role, u."assignedSector")
    AND NOT EXISTS (SELECT 1 FROM sobra_corte."RoleChangeAudit" a WHERE a."bindingId" = b.id
      AND a."factoryUnitId" = b."factoryUnitId" AND a."newRole" = b.role
      AND a."newSector" IS NOT DISTINCT FROM b."assignedSector")
  UNION ALL
  SELECT b."factoryUnitId", 'multiple_bound_identities_for_login'
  FROM sobra_corte."UserRoleBinding" b
  JOIN sobra_corte."AuthIdentity" i ON i.id = b."identityId"
  GROUP BY b."factoryUnitId", upper(trim(i.usuario))
  HAVING count(DISTINCT i.id) > 1
  UNION ALL
  SELECT u."factoryUnitId", 'legacy_provider_id_mismatch'
  FROM legacy u
  JOIN autenticacao.usuarios provider
    ON upper(trim(provider.usuario)) = upper(trim(u.usuario))
   AND NULLIF(regexp_replace(provider.matricula::text, '\D', '', 'g'), '')::numeric = u."matriculaDass"
  WHERE u.native_code = 'SEST' AND u.origin = 'LEGADO'
    AND u.provider_id IS DISTINCT FROM provider.id::text
  UNION ALL
  SELECT c."nativeUnitId", 'recorded_migration_conflict'
  FROM sobra_corte."IdentityMigrationConflict" c
)
SELECT unit_id, check_name, count(*)::integer AS divergences
FROM violations GROUP BY unit_id, check_name ORDER BY unit_id, check_name;
