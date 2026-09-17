import { Request } from 'express';
import { SectorType } from '../generated/prisma';

export interface StockAccessContext {
  role?: string | null;
  assignedSector?: string | null;
  isGlobalAdmin?: boolean;
}
export class StockAccessError extends Error {
  readonly status = 403;
}
export function normalizeAccessSector(sector: string) {
  const value = sector.trim().toUpperCase();
  return value === 'CABEDAIS' || value === 'EXPEDICAO' ? 'DISTRIBUICAO' : value;
}
export function isStockMaster(context: StockAccessContext) {
  return context.role === 'admin' || context.isGlobalAdmin === true;
}
export function assignedStockSector(context: StockAccessContext): SectorType | null {
  if (isStockMaster(context)) return null;
  const sector = normalizeAccessSector(context.assignedSector || '');
  if (!['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM', 'CONSUMO'].includes(sector)) {
    throw new StockAccessError('Acesso negado: seu perfil precisa de um setor específico atribuído.');
  }
  return sector as SectorType;
}
export function assertStockSectorAccess(context: StockAccessContext, sector: string | null | undefined) {
  const assigned = assignedStockSector(context);
  if (assigned && (!sector || normalizeAccessSector(sector) !== assigned)) {
    throw new StockAccessError(`Acesso negado: seu perfil está restrito ao setor ${assigned}.`);
  }
}
export function assertGeneralStockAccess(context: StockAccessContext, location: { sector?: string | null }) {
  if (!location.sector && !isStockMaster(context)) {
    throw new StockAccessError('Acesso negado: apenas Admin Master pode cadastrar ou transferir itens em localizações Geral/Livre.');
  }
}
export function requestStockAccess(req: Request): StockAccessContext {
  return {
    role: req.effectiveContext?.effectiveRole ?? req.user?.role,
    assignedSector: req.effectiveContext?.assignedSector ?? req.user?.assignedSector,
    isGlobalAdmin: req.effectiveContext?.isGlobalAdmin ?? req.isGlobalAdmin,
  };
}
export function sectorAccessWhere(context: StockAccessContext) {
  const sector = assignedStockSector(context);
  return sector ? { sector: sector === 'DISTRIBUICAO' ? { in: ['DISTRIBUICAO', 'EXPEDICAO'] as SectorType[] } : sector } : {};
}
