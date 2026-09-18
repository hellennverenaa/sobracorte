import { Prisma } from '../generated/prisma';
import { FACTORY_CATALOG, type FactoryCatalog, validateFactoryCatalog } from './factoryCatalog';

export type FactoryProvisioningUnit = {
  code: string;
  name: string;
  active: boolean;
};

type ProvisioningTransaction = Prisma.TransactionClient;

function auditData(factoryUnitId: number, kind: 'Categoria' | 'Origem', name: string, sector: string | null, unit?: string, locked?: boolean) {
  const details = [
    `Criação inicial de ${kind}: ${name}`,
    `Setor: ${sector || 'TODOS'}`,
    ...(kind === 'Categoria' ? [`Unidade: ${unit}`, `Unidade bloqueada: ${locked ? 'sim' : 'não'}`] : []),
  ].join(' | ');

  return {
    factoryUnitId,
    sector: 'CONFIGURACOES' as const,
    type: 'CRIACAO_CONFIGURACAO' as const,
    quantity: 0,
    operatorName: 'Sistema / Catálogo fixo',
    origem: 'CATALOGO_FIXO',
    reason: details,
  };
}

export async function createFactoryWithCatalog(
  tx: ProvisioningTransaction,
  unit: FactoryProvisioningUnit,
  catalog = validateFactoryCatalog(FACTORY_CATALOG),
) {
  const factory = await tx.factoryUnit.create({
    data: {
      code: unit.code,
      name: unit.name,
      active: unit.active,
      enableRequisitions: true,
    },
  });

  for (const category of catalog.categories) {
    await tx.categoryConfig.create({
      data: {
        name: category.name,
        sector: category.sector,
        defaultUnitCode: category.defaultUnitCode,
        unitLocked: category.unitLocked,
        factoryUnitId: factory.id,
      },
    });
    await tx.stockMovement.create({
      data: auditData(factory.id, 'Categoria', category.name, category.sector, category.defaultUnitCode, category.unitLocked),
    });
  }

  for (const origin of catalog.origins) {
    await tx.originConfig.create({
      data: {
        name: origin.name,
        sector: origin.sector,
        factoryUnitId: factory.id,
      },
    });
    await tx.stockMovement.create({
      data: auditData(factory.id, 'Origem', origin.name, origin.sector),
    });
  }

  return {
    factory,
    categoriesCreated: catalog.categories.length,
    originsCreated: catalog.origins.length,
  };
}
