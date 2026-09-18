import { validateUnit } from '../utils/unitHelper';
import { ACTIVE_STOCK_SECTORS, requireActiveStockSector } from '../utils/sectorHelper';

export type FactoryCatalogCategory = {
  name: string;
  sector: typeof ACTIVE_STOCK_SECTORS[number];
  defaultUnitCode: string;
  unitLocked: boolean;
};

export type FactoryCatalogOrigin = {
  name: string;
  sector: typeof ACTIVE_STOCK_SECTORS[number] | null;
};

export type FactoryCatalog = {
  categories: readonly FactoryCatalogCategory[];
  origins: readonly FactoryCatalogOrigin[];
};

/**
 * Catálogo inicial de uma fábrica nova.
 *
 * Os nomes são mantidos em caixa alta porque a API normaliza novos cadastros
 * dessa forma e o banco possui unicidade sensível a caixa. As unidades são
 * bloqueadas conforme a decisão operacional vigente.
 */
export const FACTORY_CATALOG = {
  categories: [
    { name: 'TECIDO', sector: 'CORTE', defaultUnitCode: 'M²', unitLocked: true },
    { name: 'COURO', sector: 'CORTE', defaultUnitCode: 'M', unitLocked: true },
    { name: 'FORRO', sector: 'CORTE', defaultUnitCode: 'M²', unitLocked: true },
    { name: 'SINTETICO', sector: 'CORTE', defaultUnitCode: 'M²', unitLocked: true },
    { name: 'LINHA', sector: 'CORTE', defaultUnitCode: 'KG', unitLocked: true },
    { name: 'MOLDE / PEÇA', sector: 'APOIO', defaultUnitCode: 'UN', unitLocked: true },
    { name: 'EVA', sector: 'PRE_FABRICADO', defaultUnitCode: 'UN', unitLocked: true },
    { name: 'BORRACHA', sector: 'PRE_FABRICADO', defaultUnitCode: 'UN', unitLocked: true },
    { name: 'CABEDAL', sector: 'DISTRIBUICAO', defaultUnitCode: 'UN', unitLocked: true },
    { name: 'SOLA_PROCESSADA', sector: 'DISTRIBUICAO', defaultUnitCode: 'UN', unitLocked: true },
    { name: 'PE PRONTO', sector: 'MONTAGEM', defaultUnitCode: 'UN', unitLocked: true },
  ],
  origins: [
    // O schema permite apenas um setor por origem. null é o único modo de
    // disponibilizar Consumo em CORTE e APOIO sem duplicar o nome.
    { name: 'CONSUMO', sector: null },
    { name: 'DEVOLUÇÃO', sector: null },
    { name: 'DUBLAGEM', sector: 'CORTE' },
    { name: 'ERRO DE ENFESTO', sector: 'CORTE' },
    { name: 'GANHO NO ROLO', sector: 'CORTE' },
    { name: 'OUTROS', sector: null },
    { name: 'RETALHO', sector: 'CORTE' },
    { name: 'SOBRA DE REQUISIÇÃO', sector: null },
  ],
} as const satisfies FactoryCatalog;

export class FactoryCatalogValidationError extends Error {
  constructor(message: string) {
    super(`Catálogo inicial inválido: ${message}`);
    this.name = 'FactoryCatalogValidationError';
  }
}

function canonicalName(value: unknown, kind: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FactoryCatalogValidationError(`${kind} precisa ter nome.`);
  }
  if (value !== value.trim() || value !== value.toUpperCase()) {
    throw new FactoryCatalogValidationError(`${kind} "${value}" deve estar normalizado em caixa alta e sem espaços nas extremidades.`);
  }
  return value;
}

function logicalName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

export function validateFactoryCatalog(catalog: FactoryCatalog = FACTORY_CATALOG): FactoryCatalog {
  if (!catalog || !Array.isArray(catalog.categories) || !Array.isArray(catalog.origins)) {
    throw new FactoryCatalogValidationError('categorias e origens são obrigatórias.');
  }

  const categoryNames = new Set<string>();
  const categories = catalog.categories.map((category, index) => {
    const name = canonicalName(category.name, `categoria #${index + 1}`);
    const key = logicalName(name);
    if (categoryNames.has(key)) throw new FactoryCatalogValidationError(`categoria duplicada: "${name}".`);
    categoryNames.add(key);

    let sector: typeof ACTIVE_STOCK_SECTORS[number];
    try {
      sector = requireActiveStockSector(category.sector);
    } catch (error) {
      throw new FactoryCatalogValidationError(`setor da categoria "${name}" é inválido: ${(error as Error).message}`);
    }

    let defaultUnitCode: string;
    try {
      defaultUnitCode = validateUnit(category.defaultUnitCode);
    } catch (error) {
      throw new FactoryCatalogValidationError(`unidade da categoria "${name}" é inválida: ${(error as Error).message}`);
    }
    if (category.unitLocked && !defaultUnitCode) {
      throw new FactoryCatalogValidationError(`categoria bloqueada "${name}" precisa de unidade padrão.`);
    }

    return { name, sector, defaultUnitCode, unitLocked: Boolean(category.unitLocked) };
  });

  const originNames = new Set<string>();
  const origins = catalog.origins.map((origin, index) => {
    const name = canonicalName(origin.name, `origem #${index + 1}`);
    const key = logicalName(name);
    if (originNames.has(key)) throw new FactoryCatalogValidationError(`origem duplicada: "${name}".`);
    originNames.add(key);

    let sector: typeof ACTIVE_STOCK_SECTORS[number] | null = null;
    if (origin.sector !== null && origin.sector !== undefined) {
      try {
        sector = requireActiveStockSector(origin.sector);
      } catch (error) {
        throw new FactoryCatalogValidationError(`setor da origem "${name}" é inválido: ${(error as Error).message}`);
      }
    }

    return { name, sector };
  });

  return { categories, origins };
}
