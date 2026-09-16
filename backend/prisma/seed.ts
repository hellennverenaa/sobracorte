import { prismaForInternalUse } from '../src/prisma';

export const FACTORY_UNITS = [
  { code: 'SEST', name: 'Santo Estêvão', active: true },
  { code: 'STJ', name: 'Santo Antônio de Jesus', active: true },
  { code: 'ITB', name: 'Itaberaba', active: true },
  { code: 'VDC', name: 'Vitória da Conquista', active: true },
  { code: 'ITP', name: 'Itapipoca', active: true },
  { code: 'IVT', name: 'Ivoti', active: true },
] as const;

export const DEFAULT_UNITS = [
  { name: 'Metro', symbol: 'm' },
  { name: 'Metro Quadrado', symbol: 'm²' },
  { name: 'Quilograma', symbol: 'kg' },
  { name: 'Grama', symbol: 'g' },
  { name: 'Unidade', symbol: 'un' },
  { name: 'Unidade (Discreto)', symbol: 'und' },
  { name: 'Par', symbol: 'par' },
  { name: 'Rolo', symbol: 'rolo' },
  { name: 'Centímetro', symbol: 'cm' },
  { name: 'Litro', symbol: 'l' },
  { name: 'Caixa', symbol: 'cx' },
] as const;

async function main() {
  console.log('🌱 Iniciando Seed de Unidades Fabris e Configurações...');

  for (const unit of FACTORY_UNITS) {
    const upserted = await prismaForInternalUse.factoryUnit.upsert({
      where: { code: unit.code },
      update: { name: unit.name, active: unit.active },
      create: { code: unit.code, name: unit.name, active: unit.active },
    });
    console.log(`✅ Unidade [${upserted.code}] ${upserted.name} sincronizada (ID: ${upserted.id})`);

    // Provisionar DEFAULT_UNITS para a unidade
    for (const u of DEFAULT_UNITS) {
      const exists = await prismaForInternalUse.unitConfig.findFirst({
        where: { factoryUnitId: upserted.id, symbol: u.symbol },
      });
      if (!exists) {
        await prismaForInternalUse.unitConfig.create({
          data: {
            name: u.name,
            symbol: u.symbol,
            active: true,
            factoryUnitId: upserted.id,
          },
        });
      }
    }
  }

  // Obter SEST como referência de configurações de categorias e origens
  const sestUnit = await prismaForInternalUse.factoryUnit.findUnique({
    where: { code: 'SEST' },
    include: { categories: true, origins: true },
  });

  if (sestUnit) {
    const otherUnits = await prismaForInternalUse.factoryUnit.findMany({
      where: { code: { not: 'SEST' } },
    });

    for (const targetUnit of otherUnits) {
      // 1. Replicar CategoryConfig
      for (const c of sestUnit.categories) {
        const exists = await prismaForInternalUse.categoryConfig.findFirst({
          where: { factoryUnitId: targetUnit.id, name: c.name },
        });
        if (!exists) {
          await prismaForInternalUse.categoryConfig.create({
            data: {
              name: c.name,
              sector: c.sector,
              unitLock: c.unitLock,
              unitLocked: c.unitLocked,
              factoryUnitId: targetUnit.id,
            },
          });
        }
      }

      // 2. Replicar OriginConfig
      for (const o of sestUnit.origins) {
        const exists = await prismaForInternalUse.originConfig.findFirst({
          where: { factoryUnitId: targetUnit.id, name: o.name },
        });
        if (!exists) {
          await prismaForInternalUse.originConfig.create({
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
    await prismaForInternalUse.$disconnect();
  });
