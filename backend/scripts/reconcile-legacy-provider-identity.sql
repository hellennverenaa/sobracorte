-- The operator confirms that both bindings belong to the same legacy account.
DO $$
DECLARE
  p RECORD;
  migrated_binding RECORD;
  provider_binding RECORD;
  migrated_identity RECORD;
  provider_identity RECORD;
  legacy_user RECORD;
  provider_user RECORD;
BEGIN
  SELECT * INTO STRICT p FROM legacy_identity_reconciliation_input;

  PERFORM id FROM sobra_corte."UserRoleBinding"
    WHERE id IN (p.migrated_binding_id, p.provider_binding_id) ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT migrated_binding FROM sobra_corte."UserRoleBinding"
    WHERE id = p.migrated_binding_id AND "factoryUnitId" = p.unit_id;
  SELECT * INTO STRICT provider_binding FROM sobra_corte."UserRoleBinding"
    WHERE id = p.provider_binding_id AND "factoryUnitId" = p.unit_id;

  PERFORM id FROM sobra_corte."AuthIdentity"
    WHERE id IN (migrated_binding."identityId", provider_binding."identityId") ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT migrated_identity FROM sobra_corte."AuthIdentity"
    WHERE id = migrated_binding."identityId";
  SELECT * INTO STRICT provider_identity FROM sobra_corte."AuthIdentity"
    WHERE id = provider_binding."identityId";

  IF migrated_identity."nativeUnitId" <> p.unit_id
    OR provider_identity."nativeUnitId" <> p.unit_id
    OR migrated_identity."authOrigin" <> 'LEGADO'
    OR provider_identity."authOrigin" <> 'LEGADO'
    OR migrated_identity."authUserId" <> migrated_identity.usuario
    OR provider_identity."authUserId" !~ '^[1-9][0-9]*$'
    OR upper(trim(migrated_identity.usuario)) <> upper(trim(provider_identity.usuario))
    OR migrated_identity."matriculaDass" IS NULL
    OR migrated_identity."matriculaDass" IS DISTINCT FROM provider_identity."matriculaDass" THEN
    RAISE EXCEPTION 'Os vínculos não correspondem à mesma identidade legada migrada.';
  END IF;

  IF ROW(migrated_binding.role, migrated_binding."assignedSector") IS DISTINCT FROM
     ROW(provider_binding.role, provider_binding."assignedSector") THEN
    RAISE EXCEPTION 'Permissões divergentes: exige decisão explícita do administrador.';
  END IF;
  IF EXISTS (SELECT 1 FROM sobra_corte."UserRoleBinding"
    WHERE "identityId" = migrated_identity.id AND id <> migrated_binding.id) THEN
    RAISE EXCEPTION 'A identidade migrada possui outros vínculos; revisão manual necessária.';
  END IF;

  SELECT * INTO STRICT legacy_user FROM sobra_corte."User"
    WHERE "factoryUnitId" = p.unit_id
      AND upper(trim(usuario)) = upper(trim(migrated_identity.usuario))
      AND "matriculaDass" = migrated_identity."matriculaDass"
      AND COALESCE(NULLIF("authOrigin", ''), 'LEGADO') = 'LEGADO'
    FOR UPDATE;
  SELECT * INTO STRICT provider_user FROM autenticacao.usuarios
    WHERE id = provider_identity."authUserId"::bigint
      AND upper(trim(usuario)) = upper(trim(provider_identity.usuario))
      AND NULLIF(regexp_replace(matricula::text, '\D', '', 'g'), '')::numeric = provider_identity."matriculaDass";

  UPDATE sobra_corte."RoleChangeAudit" SET "bindingId" = migrated_binding.id
    WHERE "bindingId" = provider_binding.id;
  DELETE FROM sobra_corte."UserRoleBinding" WHERE id = provider_binding.id;
  UPDATE sobra_corte."UserRoleBinding"
    SET "identityId" = provider_identity.id, "updatedAt" = now()
    WHERE id = migrated_binding.id;
  UPDATE sobra_corte."User"
    SET "authOrigin" = 'LEGADO', "authUserId" = provider_identity."authUserId", "updatedAt" = now()
    WHERE id = legacy_user.id;

  INSERT INTO sobra_corte."StockMovement"
    ("factoryUnitId", sector, type, quantity, "operatorName", origem, reason, "createdAt")
  VALUES (p.unit_id, 'CONFIGURACOES', 'EDICAO_CONFIGURACAO', 0,
    'Reconciliação de identidade legada', 'Gestão de Usuários - RBAC',
    format('Reconciliação confirmada: vínculo %s, identidade por login %s -> identidade do provedor legado %s; vínculo redundante %s removido.',
      migrated_binding.id, migrated_identity.id, provider_identity.id, provider_binding.id), now());
END $$;
