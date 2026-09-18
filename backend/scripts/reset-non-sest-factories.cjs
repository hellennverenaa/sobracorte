const { Client } = require('pg');
require('dotenv').config({ quiet: true });

const CONFIRMATION = 'RESET-NON-SEST';
const TABLES = [
  ['IdentityMigrationConflict', 'nativeUnitId'],
  ['RoleChangeAudit', 'factoryUnitId'],
  ['UserRoleBinding', 'factoryUnitId'],
  ['User', 'factoryUnitId'],
  ['MaterialDeletionAudit', 'factoryUnitId'],
  ['MaterialRequisition', 'factoryUnitId'],
  ['StockItemLocation', 'factoryUnitId'],
  ['StockMovement', 'factoryUnitId'],
  ['StockItem', 'factoryUnitId'],
  ['LocationCategory', 'factoryUnitId'],
  ['Location', 'factoryUnitId'],
  ['CategoryConfig', 'factoryUnitId'],
  ['OriginConfig', 'factoryUnitId'],
];

function parseArgs(args, env) {
  const apply = args.includes('--apply');
  const allowProduction = args.includes('--allow-production');
  const confirmation = args.find(arg => arg.startsWith('--confirm='))?.slice('--confirm='.length);
  const disableArgs = args.filter(arg => arg.startsWith('--disable='));
  if (disableArgs.length > 1) throw new Error('--disable deve ser informado no máximo uma vez.');
  const disableCodes = disableArgs.length === 0 ? [] : disableArgs[0].slice('--disable='.length)
    .split(',').map(code => code.trim().toUpperCase()).filter(Boolean);
  if (new Set(disableCodes).size !== disableCodes.length || disableCodes.some(code => !/^[A-Z][A-Z0-9]{1,9}$/.test(code))) {
    throw new Error('Códigos inválidos ou duplicados em --disable.');
  }
  if (disableCodes.includes('SEST')) throw new Error('SEST é protegida e não pode ser desativada.');
  const known = new Set(['--apply', '--allow-production', `--confirm=${CONFIRMATION}`, ...disableArgs]);
  if (args.some(arg => !known.has(arg))) {
    throw new Error(`Uso: node scripts/reset-non-sest-factories.cjs [--disable=VDC,IVT] [--apply --confirm=${CONFIRMATION} --allow-production]`);
  }
  if (!apply && (allowProduction || confirmation)) throw new Error('Confirmações só podem ser usadas com --apply.');
  if (apply && confirmation !== CONFIRMATION) throw new Error(`Aplicação exige --confirm=${CONFIRMATION}.`);
  if (apply && env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error('Reset em produção exige também --allow-production.');
  }
  return { apply, disableCodes };
}

async function loadCatalog() {
  try {
    const { FACTORY_CATALOG, validateFactoryCatalog } = require('../dist/src/provisioning/factoryCatalog');
    return validateFactoryCatalog(FACTORY_CATALOG);
  } catch (error) {
    throw new Error(`Catálogo compilado indisponível ou inválido; execute npm run build antes do reset. ${(error && error.message) || ''}`.trim());
  }
}

async function counts(client, unitIds) {
  const result = {};
  for (const [table, column] of TABLES) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS count FROM sobra_corte."${table}" WHERE "${column}"=ANY($1::int[])`,
      [unitIds],
    );
    result[table] = rows[0].count;
  }
  const identities = await client.query(
    'SELECT count(*)::int AS count FROM sobra_corte."AuthIdentity" WHERE "nativeUnitId"=ANY($1::int[])',
    [unitIds],
  );
  result.AuthIdentity = identities.rows[0].count;
  return result;
}

async function resetNonSestFactories(client, catalog, apply = false, disableCodes = []) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '5min'");

    const units = await client.query(
      'SELECT id,code,name,active FROM sobra_corte."FactoryUnit" ORDER BY id FOR UPDATE',
    );
    const sest = units.rows.filter(unit => unit.code === 'SEST');
    if (sest.length !== 1) throw new Error(`Proteção SEST falhou: esperado 1 registro, encontrados ${sest.length}.`);
    const targets = units.rows.filter(unit => unit.code !== 'SEST');
    if (targets.length === 0) throw new Error('Nenhuma unidade não-SEST encontrada; reset recusado.');
    const targetIds = targets.map(unit => unit.id);
    if (targetIds.includes(sest[0].id)) throw new Error('Proteção SEST falhou: ID protegido entrou no conjunto alvo.');
    const knownTargetCodes = new Set(targets.map(unit => unit.code));
    const unknownDisableCodes = disableCodes.filter(code => !knownTargetCodes.has(code));
    if (unknownDisableCodes.length) {
      throw new Error(`Unidades para desativação inexistentes ou protegidas: ${unknownDisableCodes.join(', ')}.`);
    }

    const before = await counts(client, targetIds);
    const sestBefore = await counts(client, [sest[0].id]);

    // AuthIdentity is native to one unit but may theoretically carry bindings
    // elsewhere. Deleting it would cascade outside the requested reset scope.
    const crossUnitBindings = await client.query(`
      SELECT count(*)::int AS count
      FROM sobra_corte."AuthIdentity" identity
      JOIN sobra_corte."UserRoleBinding" binding ON binding."identityId" = identity.id
      WHERE identity."nativeUnitId"=ANY($1::int[])
        AND NOT (binding."factoryUnitId"=ANY($1::int[]))
    `, [targetIds]);
    if (crossUnitBindings.rows[0].count !== 0) {
      throw new Error(`Reset recusado: ${crossUnitBindings.rows[0].count} vínculos cruzados alcançariam unidades protegidas.`);
    }

    for (const table of ['IdentityMigrationConflict', 'RoleChangeAudit', 'UserRoleBinding', 'User',
      'MaterialDeletionAudit', 'MaterialRequisition', 'StockItemLocation', 'StockMovement',
      'StockItem', 'LocationCategory', 'Location', 'CategoryConfig', 'OriginConfig']) {
      const column = TABLES.find(([name]) => name === table)[1];
      await client.query(`DELETE FROM sobra_corte."${table}" WHERE "${column}"=ANY($1::int[])`, [targetIds]);
    }
    await client.query(
      'DELETE FROM sobra_corte."AuthIdentity" WHERE "nativeUnitId"=ANY($1::int[])',
      [targetIds],
    );

    for (const unit of targets) {
      for (const category of catalog.categories) {
        await client.query(`INSERT INTO sobra_corte."CategoryConfig"
          (name,sector,"unitLocked","defaultUnitCode","factoryUnitId")
          VALUES ($1,$2,$3,$4,$5)`,
        [category.name, category.sector, category.unitLocked, category.defaultUnitCode, unit.id]);
        await client.query(`INSERT INTO sobra_corte."StockMovement"
          ("factoryUnitId",sector,type,quantity,"operatorName",origem,reason,"createdAt")
          VALUES ($1,'CONFIGURACOES','CRIACAO_CONFIGURACAO',0,
            'Sistema / Catálogo fixo','CATALOGO_FIXO',$2,now())`,
        [unit.id, `Criação inicial de Categoria: ${category.name} | Setor: ${category.sector} | Unidade: ${category.defaultUnitCode} | Unidade bloqueada: ${category.unitLocked ? 'sim' : 'não'}`]);
      }
      for (const origin of catalog.origins) {
        await client.query(`INSERT INTO sobra_corte."OriginConfig" (name,sector,"factoryUnitId")
          VALUES ($1,$2,$3)`, [origin.name, origin.sector, unit.id]);
        await client.query(`INSERT INTO sobra_corte."StockMovement"
          ("factoryUnitId",sector,type,quantity,"operatorName",origem,reason,"createdAt")
          VALUES ($1,'CONFIGURACOES','CRIACAO_CONFIGURACAO',0,
            'Sistema / Catálogo fixo','CATALOGO_FIXO',$2,now())`,
        [unit.id, `Criação inicial de Origem: ${origin.name} | Setor: ${origin.sector || 'TODOS'}`]);
      }
    }
    if (disableCodes.length) {
      await client.query(
        'UPDATE sobra_corte."FactoryUnit" SET active=FALSE WHERE code=ANY($1::text[]) AND code<>\'SEST\'',
        [disableCodes],
      );
    }

    const after = await counts(client, targetIds);
    const sestAfter = await counts(client, [sest[0].id]);
    if (JSON.stringify(sestAfter) !== JSON.stringify(sestBefore)) {
      throw new Error('Proteção SEST falhou: contagens da unidade protegida foram alteradas.');
    }
    const expectedMovements = targets.length * (catalog.categories.length + catalog.origins.length);
    if (after.CategoryConfig !== targets.length * catalog.categories.length ||
        after.OriginConfig !== targets.length * catalog.origins.length ||
        after.StockMovement !== expectedMovements) {
      throw new Error('Validação pós-reset falhou: catálogo ou auditorias com contagem inesperada.');
    }
    for (const table of ['IdentityMigrationConflict', 'RoleChangeAudit', 'UserRoleBinding', 'User',
      'MaterialDeletionAudit', 'MaterialRequisition', 'StockItemLocation', 'StockItem',
      'LocationCategory', 'Location', 'AuthIdentity']) {
      if (after[table] !== 0) throw new Error(`Validação pós-reset falhou: ${table} ainda contém ${after[table]} registros.`);
    }

    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return {
      mode: apply ? 'applied' : 'dry-run',
      protectedUnit: { id: sest[0].id, code: sest[0].code },
      targets: targets.map(unit => ({ id: unit.id, code: unit.code, activeBefore: unit.active,
        activeAfter: disableCodes.includes(unit.code) ? false : unit.active })),
      disabledUnits: disableCodes,
      before,
      after,
      template: { categoriesPerUnit: catalog.categories.length, originsPerUnit: catalog.origins.length },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

module.exports = { CONFIRMATION, parseArgs, resetNonSestFactories };

if (require.main === module) {
  async function main() {
    const { apply, disableCodes } = parseArgs(process.argv.slice(2), process.env);
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
    const catalog = await loadCatalog();
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.delete('schema');
    const client = new Client({ connectionString: url.toString() });
    try {
      await client.connect();
      const result = await resetNonSestFactories(client, catalog, apply, disableCodes);
      console.log(JSON.stringify(result, null, 2));
      if (!apply) console.log('Simulação concluída; todas as alterações foram revertidas.');
    } finally {
      await client.end();
    }
  }
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Falha no reset de unidades.');
    process.exitCode = 1;
  });
}
