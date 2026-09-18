export const ACTIVE_STOCK_SECTORS = ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'] as const;

export class SectorValidationError extends Error {
  constructor(value: unknown) {
    super(`Setor inválido ou descontinuado: ${String(value)}.`);
    this.name = 'SectorValidationError';
  }
}

/** Normaliza aliases legados sem converter setores desconhecidos em um setor válido. */
export function normalizeSector(value: string): string {
  const sector = value.trim().toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[ -]+/g, '_');
  return sector === 'CABEDAIS' || sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : sector;
}

/** Aceita somente setores operacionais atuais; aliases de Consumo nunca são reinterpretados. */
export function requireActiveStockSector(value: unknown): typeof ACTIVE_STOCK_SECTORS[number] {
  const sector = normalizeSector(String(value ?? ''));
  if (!ACTIVE_STOCK_SECTORS.includes(sector as typeof ACTIVE_STOCK_SECTORS[number])) {
    throw new SectorValidationError(value);
  }
  return sector as typeof ACTIVE_STOCK_SECTORS[number];
}
