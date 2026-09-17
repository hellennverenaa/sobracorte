import { Prisma } from '../generated/prisma';
import { normalizeUnit, UNIT_ALIASES } from '../utils/unitHelper';

// Identificadores SQL são constantes internas; nenhum identificador vem da requisição.
function normalizedText(alias: 'e' | 'd', field: string) {
  return Prisma.sql`UPPER(TRIM(COALESCE(${Prisma.raw(`${alias}."${field}"`)}, '')))`;
}

function normalizedPairUnit(alias: 'e' | 'd') {
  const unit = normalizedText(alias, 'unit');
  return Prisma.sql`CASE ${unit}
    WHEN '' THEN 'UND'
    ${Prisma.join(Object.keys(UNIT_ALIASES).map(value => Prisma.sql`WHEN ${value} THEN ${normalizeUnit(value, 'MONTAGEM')}`), ' ')}
    ELSE ${unit} END`;
}

export const pairCompatibilitySql = Prisma.sql`
  e."factoryUnitId" = d."factoryUnitId"
  AND (CASE WHEN e.sector::text = 'EXPEDICAO' THEN 'DISTRIBUICAO' ELSE e.sector::text END)
    = (CASE WHEN d.sector::text = 'EXPEDICAO' THEN 'DISTRIBUICAO' ELSE d.sector::text END)
  AND ${Prisma.join(['sku', 'productName', 'sizeGrade', 'type'].map(field =>
    Prisma.sql`${normalizedText('e', field)} = ${normalizedText('d', field)}`), ' AND ')}
  AND REGEXP_REPLACE(${normalizedText('e', 'color')}, '[[:space:]]+', '', 'g')
    = REGEXP_REPLACE(${normalizedText('d', 'color')}, '[[:space:]]+', '', 'g')
  AND ${normalizedPairUnit('e')} = ${normalizedPairUnit('d')}
`;
