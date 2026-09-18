import { prismaForInternalUse } from '../src/prisma';

export const FACTORY_UNITS = [
  { code: 'SEST', name: 'Santo Estêvão', active: true },
  { code: 'SAJ', name: 'Santo Antônio de Jesus', active: true },
  { code: 'ITB', name: 'Itaberaba', active: true },
  { code: 'VDC', name: 'Vitória da Conquista', active: true },
  { code: 'ITP', name: 'Itapipoca', active: true },
  { code: 'IVT', name: 'Ivoti', active: true },
] as const;

export async function seedFactoryUnits(client = prismaForInternalUse) {
  if (await client.factoryUnit.findUnique({ where: { code: 'STJ' } })) {
    throw new Error('Aplique a migration de renomeação STJ/SAJ antes do seed; não criar uma segunda unidade.');
  }
  console.log('🌱 Iniciando Seed de Unidades Fabris e Configurações...');

  for (const unit of FACTORY_UNITS) {
    const upserted = await client.factoryUnit.upsert({
      where: { code: unit.code },
      update: { name: unit.name, active: unit.active },
      create: { code: unit.code, name: unit.name, active: unit.active },
    });
    console.log(`✅ Unidade [${upserted.code}] ${upserted.name} sincronizada (ID: ${upserted.id})`);
  }

  // Obter SEST como referência de configurações de categorias e origens
  const sestUnit = await client.factoryUnit.findUnique({
    where: { code: 'SEST' },
    include: { categories: true, origins: true },
  });

  if (sestUnit) {
    const otherUnits = await client.factoryUnit.findMany({
      where: { code: { not: 'SEST' } },
    });

    for (const targetUnit of otherUnits) {
      // 1. Replicar CategoryConfig
      for (const c of sestUnit.categories) {
        const exists = await client.categoryConfig.findFirst({
          where: { factoryUnitId: targetUnit.id, name: c.name },
        });
        if (!exists) {
          await client.categoryConfig.create({
            data: {
              name: c.name,
              sector: c.sector,
              defaultUnitCode: c.defaultUnitCode,
              unitLocked: c.unitLocked,
              factoryUnitId: targetUnit.id,
            },
          });
        }
      }

      // 2. Replicar OriginConfig
      for (const o of sestUnit.origins) {
        const exists = await client.originConfig.findFirst({
          where: { factoryUnitId: targetUnit.id, name: o.name },
        });
        if (!exists) {
          await client.originConfig.create({
            data: {
              name: o.name,
              sector: o.sector,
              factoryUnitId: targetUnit.id,
            },
          });
        }
      }
    }
  }

  console.log('🚀 Seed concluído com sucesso!');
}


if (require.main === module) {
  seedFactoryUnits()
    .catch((error) => {
      console.error('Falha no seed.', { name: error instanceof Error ? error.name : 'UnknownError' });
      process.exitCode = 1;
    })
    .finally(async () => { await prismaForInternalUse.$disconnect(); });
}
