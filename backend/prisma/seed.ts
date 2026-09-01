import { prismaWithoutTenant } from '../src/prisma';

export const FACTORY_UNITS = [
  { code: 'SEST', name: 'Santo Estêvão', active: true },
  { code: 'STJ', name: 'Santo Antônio de Jesus', active: true },
  { code: 'ITB', name: 'Itaberaba', active: true },
  { code: 'VDC', name: 'Vitória da Conquista', active: true },
  { code: 'ITP', name: 'Itapipoca', active: true },
  { code: 'IVT', name: 'Ivoti', active: true },
] as const;

async function main() {
  console.log('🌱 Iniciando Seed de Unidades Fabris e Configurações...');

  for (const unit of FACTORY_UNITS) {
    const upserted = await prismaWithoutTenant.factoryUnit.upsert({
      where: { code: unit.code },
      update: { name: unit.name, active: unit.active },
      create: { code: unit.code, name: unit.name, active: unit.active },
    });
    console.log(`✅ Unidade [${upserted.code}] ${upserted.name} sincronizada (ID: ${upserted.id})`);
  }

  // Obter SEST como referência de configurações padrão
  const sestUnit = await prismaWithoutTenant.factoryUnit.findUnique({
    where: { code: 'SEST' },
    include: { units: true, categories: true, origins: true },
  });

  if (sestUnit) {
    const otherUnits = await prismaWithoutTenant.factoryUnit.findMany({
      where: { code: { not: 'SEST' } },
    });

    for (const targetUnit of otherUnits) {
      // 1. Replicar UnitConfig
      for (const u of sestUnit.units) {
        const exists = await prismaWithoutTenant.unitConfig.findFirst({
          where: { factoryUnitId: targetUnit.id, symbol: u.symbol },
        });
        if (!exists) {
          await prismaWithoutTenant.unitConfig.create({
            data: {
              name: u.name,
              symbol: u.symbol,
              active: u.active,
              factoryUnitId: targetUnit.id,
            },
          });
        }
      }

      // 2. Replicar CategoryConfig
      for (const c of sestUnit.categories) {
        const exists = await prismaWithoutTenant.categoryConfig.findFirst({
          where: { factoryUnitId: targetUnit.id, name: c.name },
        });
        if (!exists) {
          await prismaWithoutTenant.categoryConfig.create({
            data: {
              name: c.name,
              unitLock: c.unitLock,
              unitLocked: c.unitLocked,
              factoryUnitId: targetUnit.id,
            },
          });
        }
      }

      // 3. Replicar OriginConfig
      for (const o of sestUnit.origins) {
        const exists = await prismaWithoutTenant.originConfig.findFirst({
          where: { factoryUnitId: targetUnit.id, name: o.name },
        });
        if (!exists) {
          await prismaWithoutTenant.originConfig.create({
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

main()
  .catch((e) => {
    console.error('❌ Erro durante o Seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaWithoutTenant.$disconnect();
  });
