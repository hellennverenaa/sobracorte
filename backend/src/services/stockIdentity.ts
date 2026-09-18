import type { StockTransactionClient } from '../prisma';
import { Prisma, SectorType, FootSide } from '../generated/prisma';
import { normalizeSector as normalizeStockSector } from '../utils/sectorHelper';
export { normalizeSector as normalizeStockSector } from '../utils/sectorHelper';

export class DuplicateStockItemError extends Error {
  constructor(message = 'Este material já existe no estoque. Para adicionar saldo, utilize a movimentação de entrada do item existente.') {
    super(message);
    this.name = 'DuplicateStockItemError';
  }
}


/** Localizações gerais (sem setor) continuam compartilhadas. */
export function assertStockLocationSector(location: { sector?: string | null }, sector: string) {
  if (location.sector && normalizeStockSector(location.sector) !== normalizeStockSector(sector)) {
    throw new Error('A localização pertence a outro setor. Movimentações entre setores não são permitidas.');
  }
}
export function normalizeStockText(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalizeStockColor(value: unknown) {
  return normalizeStockText(value).replace(/\s+/g, '');
}

export function stockIdentity(data: Record<string, any>) {
  const sector = normalizeStockSector(data.sector);
  const fields = sector === 'CORTE' ? ['code', 'name', 'type']
    : sector === 'APOIO' ? ['pieceCode', 'productName', 'description', 'materialColor', 'sizeGrade']
    : sector === 'MONTAGEM' ? ['sku', 'productName', 'color', 'sizeGrade', 'footSide']
    : ['sku', 'productName', 'type', 'color', 'sizeGrade', 'footSide'];
  return Object.fromEntries(fields.map(field => [field,
    field === 'color' ? normalizeStockColor(data[field]) : normalizeStockText(data[field]),
  ]));
}

export async function lockStockIdentityWrites(tx: Pick<StockTransactionClient, '$queryRaw'>, factoryUnitId: number) {
  await tx.$queryRaw`SELECT id FROM sobra_corte."FactoryUnit" WHERE id = ${factoryUnitId} FOR NO KEY UPDATE`;
}

export async function findStockIdentityMatches(tx: StockTransactionClient, factoryUnitId: number, data: Record<string, any>) {
  const sector = normalizeStockSector(data.sector);
  const identity = stockIdentity(data);
  const AND = Object.entries(identity).filter(([field]) => field !== 'color').map(([field, value]): Prisma.StockItemWhereInput => field === 'footSide'
    ? { footSide: value ? value as FootSide : null }
    : value
    ? { [field]: { equals: value, mode: 'insensitive' } }
    : { OR: [{ [field]: null }, { [field]: '' }] });
  const candidates = await tx.stockItem.findMany({
    where: { factoryUnitId, sector: sector === 'DISTRIBUICAO' ? { in: ['DISTRIBUICAO', 'EXPEDICAO'] } : sector as SectorType, AND },
  });
  // Importações antigas preservavam espaços na cor; compare também esses registros.
  return candidates.filter(item => !('color' in identity) || stockIdentity(item).color === identity.color).slice(0, 2);
}

export async function rejectDuplicateStockItem(tx: StockTransactionClient, factoryUnitId: number, data: Record<string, any>) {
  if ((await findStockIdentityMatches(tx, factoryUnitId, data)).length) throw new DuplicateStockItemError();
}
