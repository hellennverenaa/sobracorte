/**
 * Utilitário canônico de normalização e compatibilidade de unidades de medida (Ponto 05).
 */

import { normalizeSector } from './sectorHelper';

export const CANONICAL_UNITS = {
  METRO_QUADRADO: 'M²',
  METRO: 'M',
  QUILOGRAMA: 'KG',
  GRAMA: 'G',
  UNIDADE: 'UN',
  UNIDADE_DISCRETA: 'UND',
  PAR: 'PAR',
  ROLO: 'ROLO',
  CAIXA: 'CX',
  CENTIMETRO: 'CM',
  LITRO: 'L',
} as const;

export function isDiscreteSector(sector?: string | null): boolean {
  if (!sector) return false;
  const s = normalizeSector(sector);
  return ['APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'].includes(s);
}

/** Unidades que representam peças, volumes ou pares indivisíveis. */
export function isDiscreteUnit(unit?: string | null): boolean {
  if (!unit) return false;
  return ['UN', 'UND', 'PC', 'PAR', 'CX', 'ROLO'].includes(String(unit).toUpperCase().trim());
}

/**
 * Decide se a quantidade deve ser inteira, considerando a unidade cadastrada.
 * Setores historicamente discretos continuam inteiros mesmo quando a unidade
 * antiga não foi preenchida; Consumo sem unidade usa o default UN.
 */
export function requiresIntegerQuantity(unit?: string | null, sector?: string | null): boolean {
  if (!unit || String(unit).trim() === '') {
    return isDiscreteSector(sector) || String(sector || '').toUpperCase().trim() === 'CONSUMO';
  }
  return isDiscreteUnit(normalizeUnit(unit, sector));
}

export const UNIT_ALIASES: Record<string, string> = Object.fromEntries([
  ...['M2', 'M²', 'MT2', 'M^2', 'METRO QUADRADO', 'METROS QUADRADOS', 'METRO_QUADRADO', 'M2.'].map(alias => [alias, CANONICAL_UNITS.METRO_QUADRADO]),
  ...['M', 'MT', 'METRO', 'METROS', 'M.'].map(alias => [alias, CANONICAL_UNITS.METRO]),
  ...['KG', 'KGS', 'KILO', 'QUILOGRAMA', 'QUILO', 'QUILOGRAMAS', 'QUILOS', 'KG.'].map(alias => [alias, CANONICAL_UNITS.QUILOGRAMA]),
  ...['G', 'GR', 'GRAMA', 'GRAMAS', 'G.'].map(alias => [alias, CANONICAL_UNITS.GRAMA]),
  ...['PAR', 'PARES', 'PR', 'PAR.'].map(alias => [alias, CANONICAL_UNITS.PAR]),
  ...['ROLO', 'ROLOS', 'RL', 'RL.'].map(alias => [alias, CANONICAL_UNITS.ROLO]),
  ...['CX', 'CXS', 'CAIXA', 'CAIXAS', 'CX.'].map(alias => [alias, CANONICAL_UNITS.CAIXA]),
  ...['CM', 'CENTIMETRO', 'CENTÍMETRO', 'CENTIMETROS', 'CENTÍMETROS', 'CM.'].map(alias => [alias, CANONICAL_UNITS.CENTIMETRO]),
  ...['L', 'LT', 'LTS', 'LITRO', 'LITROS', 'L.'].map(alias => [alias, CANONICAL_UNITS.LITRO]),
  ...['UN', 'UND', 'UNIDADE', 'UNIDADES', 'PC', 'PÇ', 'PECA', 'PEÇA', 'PECAS', 'PEÇAS', 'UN.'].map(alias => [alias, CANONICAL_UNITS.UNIDADE]),
]);

/**
 * Normaliza qualquer variação ou alias textual de unidade de medida para o símbolo canônico.
 */
export function normalizeUnit(rawUnit?: string | null, sector?: string | null): string {
  if (!rawUnit || String(rawUnit).trim() === '') {
    return isDiscreteSector(sector) ? CANONICAL_UNITS.UNIDADE_DISCRETA : CANONICAL_UNITS.UNIDADE;
  }

  const clean = String(rawUnit).toUpperCase().trim();

  const canonical = UNIT_ALIASES[clean];
  if (canonical === 'UN' && isDiscreteSector(sector)) return CANONICAL_UNITS.UNIDADE_DISCRETA;
  if (canonical) return canonical;

  return clean;
}

/**
 * Verifica se duas unidades são semanticamente equivalentes (ex: M2 e M², ou UN e UND quando aplicável).
 */
export function areUnitsCompatible(unitA?: string | null, unitB?: string | null, sector?: string | null): boolean {
  if (!unitA || !unitB) return false;
  const normA = normalizeUnit(unitA, sector);
  const normB = normalizeUnit(unitB, sector);

  if (normA === normB) return true;

  // No contexto de setores discretos ou equivalência UN/UND
  if ((normA === 'UN' || normA === 'UND') && (normB === 'UN' || normB === 'UND')) {
    return true;
  }

  // Equivalência de M2 e M²
  if ((normA === 'M2' || normA === 'M²') && (normB === 'M2' || normB === 'M²')) {
    return true;
  }

  return false;
}
