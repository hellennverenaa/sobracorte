import { Prisma, SectorType } from '../generated/prisma';
import { normalizeSector, requireActiveStockSector } from '../utils/sectorHelper';

type CategoryScope = {
  sector?: string | null;
  sectors?: string[] | null;
};

export function normalizeCategorySectors(raw: unknown): SectorType[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map(value => requireActiveStockSector(value) as SectorType)));
}

export function categorySectors(category: CategoryScope): SectorType[] | null {
  const configured = Array.isArray(category.sectors) && category.sectors.length > 0
    ? category.sectors
    : category.sector
      ? [category.sector]
      : [];
  if (configured.length === 0) return null; // Sem escopo significa categoria geral.
  return Array.from(new Set(configured.map(value => normalizeSector(value)))).filter(Boolean) as SectorType[];
}

export function categoryAppliesToSector(category: CategoryScope, targetSector: string): boolean {
  const scopes = categorySectors(category);
  return scopes === null || scopes.includes(normalizeSector(targetSector) as SectorType);
}

export function categoryScopeWhere(targetSector: string): Prisma.CategoryConfigWhereInput {
  const normalized = normalizeSector(targetSector) as SectorType;
  const aliases: SectorType[] = normalized === 'DISTRIBUICAO'
    ? ['DISTRIBUICAO', 'EXPEDICAO']
    : [normalized];
  return {
    OR: [
      { sectors: { hasSome: aliases } },
      { sectors: { isEmpty: true }, sector: { in: aliases } },
      { sectors: { isEmpty: true }, sector: null },
    ],
  };
}

export function categoryScopeValue(rawSectors: unknown, legacySector?: unknown, defaultSector?: string): {
  sectors: SectorType[];
  legacySector: SectorType | null;
} {
  let sectors: SectorType[];
  if (Array.isArray(rawSectors)) {
    sectors = normalizeCategorySectors(rawSectors);
  } else if (legacySector) {
    sectors = [requireActiveStockSector(legacySector) as SectorType];
  } else if (defaultSector) {
    sectors = [requireActiveStockSector(defaultSector) as SectorType];
  } else {
    sectors = [];
  }
  return {
    sectors,
    legacySector: sectors[0] ?? null,
  };
}
