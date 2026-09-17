import type { StockTransactionClient } from '../prisma';
import { Prisma, SectorType, FootSide } from '../generated/prisma';
import { normalizeStockColor, normalizeStockSector, normalizeStockText, stockIdentity } from './stockIdentity';
import { normalizeUnit } from '../utils/unitHelper';

type RequestIdentity = {
  requestSector: SectorType;
  sku?: string | null;
  modelName?: string | null;
  description: string;
  color?: string | null;
  sizeGrade?: string | null;
  footSide?: string | null;
};

export async function findRequisitionStock(tx: StockTransactionClient, factoryUnitId: number, req: RequestIdentity, side?: FootSide) {
  const sector = normalizeStockSector(req.requestSector);
  const AND: Prisma.StockItemWhereInput[] = [];
  const exact = (field: string, value?: string | null) => {
    if (normalizeStockText(value)) AND.push({ [field]: { equals: normalizeStockText(value), mode: 'insensitive' } });
  };
  exact(sector === 'CORTE' ? 'code' : sector === 'APOIO' ? 'pieceCode' : 'sku', req.sku);
  if (sector !== 'CORTE') exact('productName', req.modelName);
  if (sector === 'CORTE' || sector === 'APOIO') exact(sector === 'CORTE' ? 'name' : 'description', req.description);
  exact('sizeGrade', req.sizeGrade);
  const footSide = side || (sector === 'APOIO' || sector === 'CORTE' ? null : req.footSide);
  if (footSide) AND.push({ footSide: footSide as FootSide });
  // Sem SKU/modelo nos calçados não existe identificação suficiente para uma baixa segura.
  if (sector !== 'CORTE' && sector !== 'APOIO' && !req.sku && !req.modelName) return [];
  const items = await tx.stockItem.findMany({
    where: { factoryUnitId, sector: sector === 'DISTRIBUICAO' ? { in: ['DISTRIBUICAO', 'EXPEDICAO'] } : sector as SectorType, AND },
    include: { locations: { include: { location: true } } },
  });
  return items.filter(item => !req.color || normalizeStockColor(sector === 'APOIO' ? item.materialColor : item.color) === normalizeStockColor(req.color));
}

export function assertCompatiblePair(left: Record<string, any>, right: Record<string, any>) {
  const leftIdentity = stockIdentity(left);
  const rightIdentity = stockIdentity(right);
  if (left.footSide !== 'E' || right.footSide !== 'D' || normalizeStockSector(left.sector) !== normalizeStockSector(right.sector)
    || normalizeStockText(left.type) !== normalizeStockText(right.type)
    || normalizeUnit(left.unit, left.sector) !== normalizeUnit(right.unit, right.sector)
    || Object.keys(leftIdentity).some(field => field !== 'footSide' && leftIdentity[field] !== rightIdentity[field])) {
    throw new Error('Os pés esquerdo e direito devem pertencer ao mesmo produto, modelo, material, cor e grade.');
  }
}
