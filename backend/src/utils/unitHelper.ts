/**
 * Utilitário canônico de normalização e compatibilidade de unidades de medida (Ponto 05).
 */

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
  const s = String(sector).toUpperCase().trim();
  return ['APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'].includes(s);
}

/**
 * Normaliza qualquer variação ou alias textual de unidade de medida para o símbolo canônico.
 */
export function normalizeUnit(rawUnit?: string | null, sector?: string | null): string {
  if (!rawUnit || String(rawUnit).trim() === '') {
    return isDiscreteSector(sector) ? CANONICAL_UNITS.UNIDADE_DISCRETA : CANONICAL_UNITS.UNIDADE;
  }

  const clean = String(rawUnit).toUpperCase().trim();

  // Metro Quadrado
  if (['M2', 'M²', 'MT2', 'M^2', 'METRO QUADRADO', 'METROS QUADRADOS', 'METRO_QUADRADO', 'M2.'].includes(clean)) {
    return CANONICAL_UNITS.METRO_QUADRADO;
  }

  // Metro Linear
  if (['M', 'MT', 'METRO', 'METROS', 'M.'].includes(clean)) {
    return CANONICAL_UNITS.METRO;
  }

  // Quilograma
  if (['KG', 'KGS', 'KILO', 'QUILOGRAMA', 'QUILO', 'QUILOGRAMAS', 'QUILOS', 'KG.'].includes(clean)) {
    return CANONICAL_UNITS.QUILOGRAMA;
  }

  // Grama
  if (['G', 'GR', 'GRAMA', 'GRAMAS', 'G.'].includes(clean)) {
    return CANONICAL_UNITS.GRAMA;
  }

  // Par
  if (['PAR', 'PARES', 'PR', 'PAR.'].includes(clean)) {
    return CANONICAL_UNITS.PAR;
  }

  // Rolo
  if (['ROLO', 'ROLOS', 'RL', 'RL.'].includes(clean)) {
    return CANONICAL_UNITS.ROLO;
  }

  // Caixa
  if (['CX', 'CXS', 'CAIXA', 'CAIXAS', 'CX.'].includes(clean)) {
    return CANONICAL_UNITS.CAIXA;
  }

  // Centímetro
  if (['CM', 'CENTIMETRO', 'CENTÍMETRO', 'CENTIMETROS', 'CENTÍMETROS', 'CM.'].includes(clean)) {
    return CANONICAL_UNITS.CENTIMETRO;
  }

  // Litro
  if (['L', 'LT', 'LTS', 'LITRO', 'LITROS', 'L.'].includes(clean)) {
    return CANONICAL_UNITS.LITRO;
  }

  // Unidade / Peça
  if (['UN', 'UND', 'UNIDADE', 'UNIDADES', 'PC', 'PÇ', 'PECA', 'PEÇA', 'PECAS', 'PEÇAS', 'UN.'].includes(clean)) {
    return isDiscreteSector(sector) ? CANONICAL_UNITS.UNIDADE_DISCRETA : CANONICAL_UNITS.UNIDADE;
  }

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
