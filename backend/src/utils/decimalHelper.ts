import { Prisma } from '../generated/prisma';

/**
 * Converte qualquer valor (string, number, Prisma.Decimal) para Prisma.Decimal com precisão de 3 casas decimais.
 */
export function decimalInput(val: number | string | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (val === null || val === undefined) {
    return new Prisma.Decimal('0.000');
  }
  if (val instanceof Prisma.Decimal) {
    if (val.isNaN() || !val.isFinite()) {
      throw new Error(`Valor decimal inválido: "${val}"`);
    }
    if (val.abs().lessThan('0.0001')) {
      return new Prisma.Decimal('0.000');
    }
    return val.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
  }
  const cleanStr = String(val).replace(',', '.').trim();
  if (cleanStr === '' || cleanStr === 'NaN' || cleanStr === 'Infinity' || cleanStr === '-Infinity') {
    throw new Error(`Valor decimal inválido: "${val}"`);
  }
  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(cleanStr);
  } catch {
    throw new Error(`Valor decimal inválido: "${val}"`);
  }
  if (dec.isNaN() || !dec.isFinite()) {
    throw new Error(`Valor decimal inválido: "${val}"`);
  }
  // Normaliza resíduos infinitesimais menores que 0.0001 para zero
  if (dec.abs().lessThan('0.0001')) {
    return new Prisma.Decimal('0.000');
  }
  return dec.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Converte com segurança Prisma.Decimal ou string para número JS sem dízimas de ponto flutuante.
 */
export function decimalNumber(val: number | string | Prisma.Decimal | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (val instanceof Prisma.Decimal) {
    if (val.isNaN() || !val.isFinite() || val.abs().lessThan('0.0001')) return 0;
    return val.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  }
  const cleanStr = String(val).replace(',', '.').trim();
  if (!cleanStr) return 0;
  try {
    const dec = new Prisma.Decimal(cleanStr);
    if (dec.isNaN() || !dec.isFinite() || dec.abs().lessThan('0.0001')) return 0;
    return dec.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    return 0;
  }
}

/**
 * Formata um valor numérico ou Decimal para string em pt-BR com até 3 casas decimais.
 */
export function decimalString(val: number | string | Prisma.Decimal | null | undefined, maxDecimals = 3): string {
  const num = decimalNumber(val);
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}
