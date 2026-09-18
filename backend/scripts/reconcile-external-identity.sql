-- O operador confirma a correspondência; nunca inferir identidade por matrícula.
DO $$
DECLARE
  p RECORD;
  old_binding RECORD;
  new_binding RECORD;
  old_identity RECORD;
  new_identity RECORD;
  legacy_id INTEGER;
  candidates INTEGER;
BEGIN
  SELECT * INTO STRICT p FROM identity_reconciliation_input;
  PERFORM id FROM sobra_corte."UserRoleBinding"
    WHERE id IN (p.migrated_binding_id, p.external_binding_id) ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT old_binding FROM sobra_corte."UserRoleBinding"
    WHERE id = p.migrated_binding_id AND "factoryUnitId" = p.unit_id;
  SELECT * INTO STRICT new_binding FROM sobra_corte."UserRoleBinding"
    WHERE id = p.external_binding_id AND "factoryUnitId" = p.unit_id;
  PERFORM id FROM sobra_corte."AuthIdentity"
    WHERE id IN (old_binding."identityId", new_binding."identityId") ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT old_identity FROM sobra_corte."AuthIdentity" WHERE id = old_binding."identityId";
  SELECT * INTO STRICT new_identity FROM sobra_corte."AuthIdentity" WHERE id = new_binding."identityId";

  IF old_identity."nativeUnitId" <> p.unit_id OR new_identity."nativeUnitId" <> p.unit_id
    OR old_identity."authOrigin" <> 'LEGADO' OR new_identity."authOrigin" <> 'EXTERNO'
    OR old_identity."authUserId" <> old_identity.usuario
    OR old_identity.usuario <> new_identity.usuario
    OR old_identity."matriculaDass" IS NULL
    OR old_identity."matriculaDass" IS DISTINCT FROM new_identity."matriculaDass" THEN
    RAISE EXCEPTION 'Os registros não correspondem a um cadastro migrado sem identidade externa.';
  END IF;
  IF ROW(old_binding.role, old_binding."assignedSector") IS DISTINCT FROM
     ROW(new_binding.role, new_binding."assignedSector") THEN
    RAISE EXCEPTION 'Permissões divergentes: exige decisão explícita do administrador.';
  END IF;
  IF EXISTS (SELECT 1 FROM sobra_corte."UserRoleBinding"
    WHERE "identityId" = old_identity.id AND id <> old_binding.id) THEN
    RAISE EXCEPTION 'A identidade migrada possui outros vínculos; revisão manual necessária.';
  END IF;

  PERFORM id FROM sobra_corte."User" WHERE "factoryUnitId" = p.unit_id
    AND usuario = old_identity.usuario FOR UPDATE;
  SELECT count(*), min(id) INTO candidates, legacy_id FROM sobra_corte."User"
    WHERE "factoryUnitId" = p.unit_id AND usuario = old_identity.usuario
      AND "matriculaDass" = old_identity."matriculaDass"
      AND COALESCE(NULLIF("authOrigin", ''), 'LEGADO') = 'LEGADO'
      AND COALESCE(NULLIF("authUserId", ''), usuario) = old_identity."authUserId";
  IF candidates <> 1 THEN
    RAISE EXCEPTION 'Cadastro original ausente ou ambíguo; nenhuma alteração autorizada.';
  END IF;

  -- Conservar o vínculo original, seus IDs e permissões. Audits mantêm userId
  -- histórico; somente a FK bindingId do vínculo redundante muda.
  UPDATE sobra_corte."RoleChangeAudit" SET "bindingId" = old_binding.id
    WHERE "bindingId" = new_binding.id;
  DELETE FROM sobra_corte."UserRoleBinding" WHERE id = new_binding.id;
  UPDATE sobra_corte."UserRoleBinding" SET "identityId" = new_identity.id, "updatedAt" = now()
    WHERE id = old_binding.id;
  UPDATE sobra_corte."User" SET "authOrigin" = new_identity."authOrigin",
    "authUserId" = new_identity."authUserId", "updatedAt" = now() WHERE id = legacy_id;
  -- A identidade antiga fica sem vínculo, preservada como evidência da migração.
  INSERT INTO sobra_corte."StockMovement"
    ("factoryUnitId", sector, type, quantity, "operatorName", origem, reason, "createdAt")
    VALUES (p.unit_id, 'CONFIGURACOES', 'EDICAO_CONFIGURACAO', 0,
      'Reconciliação manual de identidade', 'Gestão de Usuários - RBAC',
      format('Reconciliação confirmada: vínculo %s, identidade migrada %s -> externa %s; vínculo redundante %s removido; permissões preservadas.',
        old_binding.id, old_identity.id, new_identity.id, new_binding.id), now());
END $$;
