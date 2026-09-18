import { prismaForInternalUse } from '../src/prisma';
import { FACTORY_CATALOG, validateFactoryCatalog } from '../src/provisioning/factoryCatalog';
import { createFactoryWithCatalog } from '../src/provisioning/factoryProvisioning';

export const FACTORY_UNITS = [
  { code: 'SEST', name: 'Santo Estêvão', active: true },
  { code: 'SAJ', name: 'Santo Antônio de Jesus', active: true },
  { code: 'ITB', name: 'Itaberaba', active: true },
  { code: 'VDC', name: 'Vitória da Conquista', active: true },
  { code: 'ITP', name: 'Itapipoca', active: true },
  { code: 'IVT', name: 'Ivoti', active: true },
] as const;

function isFactoryCodeConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') return false;
  const target = 'meta' in error && error.meta && typeof error.meta === 'object' && 'target' in error.meta
    ? error.meta.target
    : undefined;
  return Array.isArray(target) ? target.includes('code') : target === 'FactoryUnit_code_key' || target === 'code';
}

export async function seedFactoryUnits(client = prismaForInternalUse) {
  if (await client.factoryUnit.findUnique({ where: { code: 'STJ' } })) {
    throw new Error('Aplique a migration de renomeação STJ/SAJ antes do seed; não criar uma segunda unidade.');
  }
  const catalog = validateFactoryCatalog(FACTORY_CATALOG);

  console.log('🌱 Iniciando seed de fábricas ausentes com catálogo fixo...');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await client.$transaction(async (tx) => {
        if (await tx.factoryUnit.findUnique({ where: { code: 'STJ' } })) {
          throw new Error('Aplique a migration de renomeação STJ/SAJ antes do seed; não criar uma segunda unidade.');
        }

        const existing = await tx.factoryUnit.findMany({
          where: { code: { in: FACTORY_UNITS.map(unit => unit.code) } },
          select: { code: true },
        });
        const existingCodes = new Set(existing.map(unit => unit.code));
        const created: string[] = [];

        for (const unit of FACTORY_UNITS) {
          if (existingCodes.has(unit.code)) continue;
          await createFactoryWithCatalog(tx, unit, catalog);
          created.push(unit.code);
        }

        return {
          created,
          preserved: FACTORY_UNITS.filter(unit => existingCodes.has(unit.code)).map(unit => unit.code),
        };
      });

      for (const code of result.created) console.log(`✅ Unidade [${code}] criada com catálogo fixo.`);
      for (const code of result.preserved) console.log(`↪️ Unidade [${code}] existente preservada.`);
      console.log('🚀 Seed concluído sem sincronização retroativa.');
      return result;
    } catch (error) {
      if (!isFactoryCodeConflict(error) || attempt > 0) throw error;
      console.log('↻ Execução concorrente detectada; reavaliando unidades oficiais.');
    }
  }
}

if (require.main === module) {
  seedFactoryUnits()
    .catch((error) => {
      console.error('Falha no seed.', { name: error instanceof Error ? error.name : 'UnknownError' });
      process.exitCode = 1;
    })
    .finally(async () => { await prismaForInternalUse.$disconnect(); });
}
