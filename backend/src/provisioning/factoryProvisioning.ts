import { ComponentType, Prisma, SectorType } from '../generated/prisma';
import { FACTORY_CATALOG, type FactoryCatalog, validateFactoryCatalog } from './factoryCatalog';

export type FactoryProvisioningUnit = {
  code: string;
  name: string;
  active: boolean;
};

type ProvisioningTransaction = Prisma.TransactionClient;

const DEFAULT_COMPONENT_SUBTYPES: Array<{
  name: string;
  sectors: SectorType[];
  componentType: ComponentType;
}> = [
  { name: 'Matéria-prima', sectors: ['CORTE'], componentType: 'MATERIA_PRIMA' },
  { name: 'Peça cortada', sectors: ['APOIO'], componentType: 'PECA_CORTADA' },
  { name: 'Cabedal', sectors: ['APOIO', 'DISTRIBUICAO'], componentType: 'CABEDAL' },
  { name: 'Solado', sectors: ['PRE_FABRICADO', 'DISTRIBUICAO'], componentType: 'SOLADO' },
  { name: 'Pé pronto', sectors: ['MONTAGEM'], componentType: 'PE_PRONTO' },
];

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

  const subtypeIds = new Map<ComponentType, number>();
  for (const subtype of DEFAULT_COMPONENT_SUBTYPES) {
    const createdSubtype = await tx.componentSubtypeConfig.create({
      data: { ...subtype, factoryUnitId: factory.id },
    });
    subtypeIds.set(subtype.componentType, createdSubtype.id);
  }

  for (const category of catalog.categories) {
    const componentType: ComponentType = category.sector === 'CORTE'
      ? 'MATERIA_PRIMA'
      : category.sector === 'APOIO'
        ? 'PECA_CORTADA'
        : category.sector === 'PRE_FABRICADO'
          ? 'SOLADO'
          : category.sector === 'DISTRIBUICAO'
            ? (category.name.includes('SOLA') ? 'SOLADO' : 'CABEDAL')
            : 'PE_PRONTO';
    await tx.categoryConfig.create({
      data: {
        name: category.name,
        sector: category.sector,
        sectors: [category.sector],
        subtypeId: subtypeIds.get(componentType),
        componentType,
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
