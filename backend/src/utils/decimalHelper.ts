import { Prisma } from '../generated/prisma';

/**
 * Converte qualquer valor (string, number, Prisma.Decimal) para Prisma.Decimal com precisão de 3 casas decimais.
 */
export function decimalInput(val: number | string | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (val === null || val === undefined) {
    return new Prisma.Decimal('0.000');
  }
  if (val instanceof Prisma.Decimal) {
    return val;
  }
  const cleanStr = String(val).replace(',', '.').trim();
  const num = Number(cleanStr);
  if (isNaN(num)) {
    throw new Error(`Valor decimal inválido: "${val}"`);
  }
  // Normaliza resíduos infinitesimais menores que 0.0001 para zero
  if (Math.abs(num) < 0.0001) {
    return new Prisma.Decimal('0.000');
  }
  return new Prisma.Decimal(num.toFixed(3));
}

/**
 * Converte com segurança Prisma.Decimal ou string para número JS sem dízimas de ponto flutuante.
 */
export function decimalNumber(val: number | string | Prisma.Decimal | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (val instanceof Prisma.Decimal) {
    const n = val.toNumber();
    return Math.abs(n) < 0.0001 ? 0 : Number(n.toFixed(3));
  }
  const num = Number(String(val).replace(',', '.').trim());
  if (isNaN(num) || Math.abs(num) < 0.0001) return 0;
  return Number(num.toFixed(3));
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

/**
 * Verifica se um valor é zero ou residual infinitesimal (< 0.0001)
 */
export function isZeroOrResidual(val: number | string | Prisma.Decimal | null | undefined): boolean {
  const num = decimalNumber(val);
  return Math.abs(num) < 0.0001;
}
