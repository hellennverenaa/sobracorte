async function backfillLegacyProviderIdentities(client, apply = false) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  const summary = { rekeyed: 0, merged: 0 };
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    const { rows: candidates } = await client.query(`
      SELECT u.id AS user_id, u."factoryUnitId" AS unit_id,
             COALESCE(NULLIF(u."authUserId", ''), u.usuario) AS migrated_key,
             provider.id::text AS provider_key
      FROM sobra_corte."User" u
      JOIN sobra_corte."FactoryUnit" unit ON unit.id = u."factoryUnitId" AND unit.code = 'SEST'
      JOIN autenticacao.usuarios provider
        ON upper(trim(provider.usuario)) = upper(trim(u.usuario))
       AND NULLIF(regexp_replace(provider.matricula::text, '\\D', '', 'g'), '')::numeric = u."matriculaDass"
      WHERE COALESCE(NULLIF(u."authOrigin", ''), 'LEGADO') = 'LEGADO'
        AND COALESCE(NULLIF(u."authUserId", ''), u.usuario) IS DISTINCT FROM provider.id::text
      ORDER BY u.id
      FOR UPDATE OF u
    `);

    for (const candidate of candidates) {
      const identities = await client.query(`
        SELECT i.*
        FROM sobra_corte."AuthIdentity" i
        WHERE i."nativeUnitId" = $1 AND i."authOrigin" = 'LEGADO'
          AND i."authUserId" IN ($2, $3)
        ORDER BY i.id FOR UPDATE
      `, [candidate.unit_id, candidate.migrated_key, candidate.provider_key]);
      const bindings = identities.rows.length ? await client.query(`
        SELECT id,"identityId",role,"assignedSector" AS assigned_sector
        FROM sobra_corte."UserRoleBinding"
        WHERE "factoryUnitId"=$1 AND "identityId"=ANY($2::int[])
        ORDER BY id FOR UPDATE
      `, [candidate.unit_id, identities.rows.map(row => row.id)]) : { rows: [] };
      const withBinding = identities.rows.map(identity => ({
        ...identity,
        ...(() => {
          const binding = bindings.rows.find(row => row.identityId === identity.id);
          return binding ? { binding_id: binding.id, role: binding.role, assigned_sector: binding.assigned_sector } : {};
        })(),
      }));
      const migrated = withBinding.find(row => row.authUserId === candidate.migrated_key);
      const provider = withBinding.find(row => row.authUserId === candidate.provider_key);
      if (!migrated?.binding_id) throw new Error(`Vínculo migrado ausente para User ${candidate.user_id}.`);

      if (!provider) {
        await client.query(`UPDATE sobra_corte."AuthIdentity"
          SET "authUserId"=$2,"updatedAt"=now() WHERE id=$1`, [migrated.id, candidate.provider_key]);
        await client.query(`UPDATE sobra_corte."User"
          SET "authOrigin"='LEGADO',"authUserId"=$2,"updatedAt"=now() WHERE id=$1`,
          [candidate.user_id, candidate.provider_key]);
        summary.rekeyed += 1;
        continue;
      }

      if (provider.binding_id && (migrated.role !== provider.role || migrated.assigned_sector !== provider.assigned_sector)) {
        throw new Error(`Permissões divergentes para User ${candidate.user_id}.`);
      }
      const extra = await client.query(`SELECT count(*)::int AS count FROM sobra_corte."UserRoleBinding"
        WHERE "identityId"=$1 AND id<>$2`, [migrated.id, migrated.binding_id]);
      if (extra.rows[0].count !== 0) throw new Error(`Identidade migrada possui outros vínculos para User ${candidate.user_id}.`);

      if (provider.binding_id) {
        await client.query(`UPDATE sobra_corte."RoleChangeAudit" SET "bindingId"=$1 WHERE "bindingId"=$2`,
          [migrated.binding_id, provider.binding_id]);
        await client.query(`DELETE FROM sobra_corte."UserRoleBinding" WHERE id=$1`, [provider.binding_id]);
      }
      await client.query(`UPDATE sobra_corte."UserRoleBinding"
        SET "identityId"=$2,"updatedAt"=now() WHERE id=$1`, [migrated.binding_id, provider.id]);
      await client.query(`UPDATE sobra_corte."User"
        SET "authOrigin"='LEGADO',"authUserId"=$2,"updatedAt"=now() WHERE id=$1`,
        [candidate.user_id, candidate.provider_key]);
      await client.query(`INSERT INTO sobra_corte."StockMovement"
        ("factoryUnitId",sector,type,quantity,"operatorName",origem,reason,"createdAt")
        VALUES ($1,'CONFIGURACOES','EDICAO_CONFIGURACAO',0,
          'Reconciliação de identidade legada','Gestão de Usuários - RBAC',$2,now())`, [
        candidate.unit_id,
        provider.binding_id
          ? `Reconciliação automática validada: vínculo ${migrated.binding_id}, identidade por login ${migrated.id} -> identidade do provedor legado ${provider.id}; vínculo redundante ${provider.binding_id} removido.`
          : `Reconciliação automática validada: vínculo ${migrated.binding_id}, identidade por login ${migrated.id} -> identidade do provedor legado ${provider.id}; identidade numérica preexistente não possuía vínculo local.`,
      ]);
      summary.merged += 1;
    }

    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return summary;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

module.exports = { backfillLegacyProviderIdentities };

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  const { Client } = require('pg');
  const args = process.argv.slice(2);
  async function main() {
    if (args.length > 1 || (args[0] && args[0] !== '--apply')) {
      throw new Error('Uso: node scripts/backfill-legacy-provider-identities.cjs [--apply]');
    }
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      const summary = await backfillLegacyProviderIdentities(client, args[0] === '--apply');
      console.log(`${args[0] ? 'Reconciliação aplicada' : 'Simulação aprovada'}: ${summary.rekeyed} chaves corrigidas, ${summary.merged} duplicidades consolidadas.`);
    } finally {
      await client.end();
    }
  }
  main().catch(error => {
    console.error(error.code ? `Reconciliação recusada (${error.code}): ${error.message}` : error.message);
    process.exitCode = 1;
  });
}
