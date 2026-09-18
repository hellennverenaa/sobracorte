const { prismaForInternalUse: db, pool } = require('../dist/src/prisma');
const { FACTORY_CATALOG, validateFactoryCatalog } = require('../dist/src/provisioning/factoryCatalog');
const { createFactoryWithCatalog } = require('../dist/src/provisioning/factoryProvisioning');

function fail(message) {
  throw new Error(message);
}

function isFactoryCodeConflict(error) {
  if (!error || error.code !== 'P2002') return false;
  const target = error.meta && error.meta.target;
  return Array.isArray(target) ? target.includes('code') : target === 'FactoryUnit_code_key' || target === 'code';
}

async function main() {
  const args = process.argv.slice(2);
  const allowProduction = args.includes('--allow-production');
  const positional = args.filter(arg => arg !== '--allow-production');
  if (positional.length !== 2) fail('Uso: node scripts/create-factory.cjs <CODIGO> "<NOME>" [--allow-production]');
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    fail('Criação de fábrica em produção exige --allow-production e autorização operacional específica.');
  }

  const code = positional[0].trim().toUpperCase();
  const name = positional[1].trim();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(code)) fail('Código inválido: use de 2 a 10 caracteres alfanuméricos, começando por uma letra.');
  if (!name || name.length > 100) fail('Nome inválido: informe entre 1 e 100 caracteres.');

  try {
    const catalog = validateFactoryCatalog(FACTORY_CATALOG);
    if (await db.factoryUnit.findUnique({ where: { code: 'STJ' } })) {
      fail('Aplique a migration de renomeação STJ/SAJ antes do provisionamento.');
    }
    if (await db.factoryUnit.findUnique({ where: { code } })) {
      fail(`A fábrica ${code} já existe; criação não atualiza nem repara registros existentes.`);
    }

    const result = await db.$transaction(async (tx) => {
      if (await tx.factoryUnit.findUnique({ where: { code: 'STJ' } })) {
        fail('Aplique a migration de renomeação STJ/SAJ antes do provisionamento.');
      }
      if (await tx.factoryUnit.findUnique({ where: { code } })) {
        fail(`A fábrica ${code} já existe; criação não atualiza nem repara registros existentes.`);
      }
      return createFactoryWithCatalog(tx, { code, name, active: true }, catalog);
    });
    console.log(JSON.stringify({ code, name: result.factory.name, categories: result.categoriesCreated, origins: result.originsCreated }));
  } catch (error) {
    if (isFactoryCodeConflict(error)) fail(`A fábrica ${code} já existe; nenhuma alteração foi aplicada.`);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Falha ao criar fábrica.');
  process.exitCode = 1;
});
