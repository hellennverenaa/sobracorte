import type { StockTransactionClient } from '../prisma';
import { Prisma, SectorType, FootSide } from '../generated/prisma';
import { normalizeStockColor, normalizeStockSector, normalizeStockText, stockIdentity } from './stockIdentity';
import { normalizeUnit } from '../utils/unitHelper';

export type RequestIdentity = {
  requestSector: SectorType;
  sku?: string | null;
  modelName?: string | null;
  description: string;
  type?: string | null;
  color?: string | null;
  sizeGrade?: string | null;
  footSide?: string | null;
};

export type RequisitionStockCandidate = {
  id: string;
  sourceStockItemIds: number[];
  sourceCompatibilityIds: number[];
  sourceSector: SectorType;
  sourceQuantityPerRequestUnit: number;
  quantity: number;
  unit: string;
  sourceUnits: string[];
  locations: string[];
  items: Array<Record<string, unknown>>;
  stockRows: any[];
  reason: string;
  rank: number;
};

export type UnverifiedRequisitionStockMatch = {
  id: number;
  sourceSector: SectorType;
  hasProductLink: boolean;
  code?: string | null;
  pieceCode?: string | null;
  sku?: string | null;
  modelName?: string | null;
  description?: string | null;
  type?: string | null;
  componentType?: string | null;
  color?: string | null;
  sizeGrade?: string | null;
  footSide?: FootSide | null;
  unit: string;
  quantity: number;
  locations: string[];
};

function sectorWhere(sector: string): Prisma.StockItemWhereInput['sector'] {
  return normalizeStockSector(sector) === 'DISTRIBUICAO'
    ? { in: ['DISTRIBUICAO', 'EXPEDICAO'] }
    : normalizeStockSector(sector) as SectorType;
}

function inferredType(req: RequestIdentity, sector: string) {
  const description = normalizeStockText(req.description);
  return req.type || (
    sector === 'PRE_FABRICADO'
      ? description.match(/^(.+?)\s+-\s+/)?.[1]
      : sector === 'DISTRIBUICAO' && description.startsWith('SOLA PROCESSADA')
        ? 'SOLA_PROCESSADA'
        : sector === 'DISTRIBUICAO' && description.startsWith('CABEDAL')
          ? 'CABEDAL'
          : undefined
  );
}

/** Encontra a identidade tradicional de um setor, sem cruzar para outro setor. */
export async function findRequisitionStock(tx: StockTransactionClient, factoryUnitId: number, req: RequestIdentity, side?: FootSide) {
  const sector = normalizeStockSector(req.requestSector);
  const AND: Prisma.StockItemWhereInput[] = [];
  const exact = (field: string, value?: string | null) => {
    if (normalizeStockText(value)) AND.push({ [field]: { equals: normalizeStockText(value), mode: 'insensitive' } });
  };
  exact(sector === 'CORTE' ? 'code' : sector === 'APOIO' ? 'pieceCode' : 'sku', req.sku);
  if (sector !== 'CORTE') exact('productName', req.modelName);
  if (sector === 'CORTE' || sector === 'APOIO') exact(sector === 'CORTE' ? 'name' : 'description', req.description);
  exact('type', inferredType(req, sector));
  exact('sizeGrade', req.sizeGrade);

  const items = await tx.stockItem.findMany({
    where: {
      factoryUnitId,
      sector: sectorWhere(sector),
      AND,
      ...(side ? { footSide: side } : {}),
      ...(sector === 'APOIO' && !req.type ? { componentType: { not: 'CABEDAL' } } : {}),
    },
    include: { locations: { include: { location: true } } },
  });
  return items.filter(item => {
    const isCutPiece = sector === 'APOIO' && item.componentType !== 'CABEDAL';
    if (req.color && normalizeStockColor(isCutPiece ? item.materialColor : item.color) !== normalizeStockColor(req.color)) return false;
    if (sector === 'APOIO' && item.componentType === 'CABEDAL' && req.footSide && !side && item.footSide !== req.footSide) return false;
    if (!req.footSide && item.footSide) return false;
    return true;
  });
}

function mapFieldMatches(mapped: string | null | undefined, requested: string | null | undefined, color = false) {
  if (!mapped?.trim()) return true;
  if (!requested?.trim()) return false;
  return (color ? normalizeStockColor(mapped) : normalizeStockText(mapped))
    === (color ? normalizeStockColor(requested) : normalizeStockText(requested));
}

function mappingMatchesRequest(mapping: any, req: RequestIdentity) {
  const identityMatches = mapping.requestSku
    ? mapFieldMatches(mapping.requestSku, req.sku)
    : mapFieldMatches(mapping.requestDescription, req.description);
  return identityMatches
    && mapFieldMatches(mapping.requestModelName, req.modelName)
    && mapFieldMatches(mapping.requestType, inferredType(req, normalizeStockSector(req.requestSector)))
    && mapFieldMatches(mapping.requestColor, req.color, true)
    && mapFieldMatches(mapping.requestSizeGrade, req.sizeGrade)
    && (!mapping.requestFootSide || mapping.requestFootSide === req.footSide);
}

function sameSourceProductIgnoringSide(left: Record<string, any>, right: Record<string, any>) {
  const a = stockIdentity({ ...left, footSide: null });
  const b = stockIdentity({ ...right, footSide: null });
  return normalizeStockSector(left.sector) === normalizeStockSector(right.sector)
    && Object.keys(a).every(field => a[field] === b[field]);
}

function candidateRank(requestSector: string, sourceSector: string) {
  const request = normalizeStockSector(requestSector);
  const source = normalizeStockSector(sourceSector);
  if (source === request) return 0;
  if (request === 'MONTAGEM') {
    if (source === 'DISTRIBUICAO') return 10;
    if (source === 'APOIO') return 20;
    if (source === 'CORTE') return 30;
  }
  return 50;
}

function makeCandidate(
  items: any[],
  requestSector: string,
  requestUnit: string,
  sourceQuantityPerRequestUnit: number,
  reason: string,
  compatibilityIds: number[] = [],
) : RequisitionStockCandidate | null {
  if (!items.length || !Number.isFinite(sourceQuantityPerRequestUnit) || sourceQuantityPerRequestUnit <= 0) return null;
  const availableInRequestUnits = items.map(item => Number(item.quantity || 0) / sourceQuantityPerRequestUnit);
  const quantity = Math.max(0, Math.min(...availableInRequestUnits));
  if (quantity <= 0) return null;
  const sourceStockItemIds = items.map(item => Number(item.id)).sort((a, b) => a - b);
  const sourceCompatibilityIds = [...compatibilityIds].sort((a, b) => a - b);
  const sourceSector = normalizeStockSector(items[0].sector) as SectorType;
  const locations = [...new Set(items.flatMap(item => (item.locations || [])
    .filter((link: any) => Number(link.quantity) > 0)
    .map((link: any) => `${link.location.name} (${link.quantity})`)))];
  const sourceUnits = [...new Set(items.map(item => String(item.unit || 'UN')))];
  const candidateId = `${sourceCompatibilityIds.length ? `compat:${sourceCompatibilityIds.join(',')}:` : ''}stock:${sourceStockItemIds.join(',')}`;
  return {
    id: candidateId,
    sourceStockItemIds,
    sourceCompatibilityIds,
    sourceSector,
    sourceQuantityPerRequestUnit,
    quantity,
    unit: requestUnit || sourceUnits[0],
    sourceUnits,
    locations,
    stockRows: items,
    items: items.map(item => ({
      id: item.id,
      componentType: item.componentType,
      sector: item.sector,
      code: item.code,
      pieceCode: item.pieceCode,
      sku: item.sku,
      modelName: item.productName,
      description: item.description || item.name,
      type: item.type,
      color: item.color || item.materialColor,
      sizeGrade: item.sizeGrade,
      footSide: item.footSide,
      unit: item.unit,
      quantity: Number(item.quantity || 0),
    })),
    reason,
    rank: candidateRank(requestSector, sourceSector),
  };
}

function pairItems(items: any[]) {
  const left = items.filter(item => item.footSide === 'E');
  const right = items.filter(item => item.footSide === 'D');
  const pairs: Array<[any, any]> = [];
  for (const leftItem of left) {
    for (const rightItem of right) {
      try {
        assertCompatiblePair(leftItem, rightItem);
        pairs.push([leftItem, rightItem]);
      } catch {
        // Uma linha de estoque incompatível não deve ser pareada por aproximação.
      }
    }
  }
  return pairs;
}

/**
 * Busca alternativas de origem sem agregar saldos de produtos ou setores diferentes.
 * Itens de Corte e Peças Cortadas só entram por vínculos explícitos de produto/BOM.
 */
export async function findRequisitionStockCandidates(
  tx: StockTransactionClient,
  factoryUnitId: number,
  req: RequestIdentity & { requestUnit?: string | null },
): Promise<RequisitionStockCandidate[]> {
  const requestSector = normalizeStockSector(req.requestSector);
  const candidates: RequisitionStockCandidate[] = [];
  const add = (candidate: RequisitionStockCandidate | null) => { if (candidate) candidates.push(candidate); };
  const requestUnit = req.requestUnit || (req.footSide === 'PAR' ? 'PAR' : requestSector === 'CORTE' ? 'M²' : 'UN');

  if (req.footSide === 'PAR') {
    const [left, right] = await Promise.all([
      findRequisitionStock(tx, factoryUnitId, req, 'E'),
      findRequisitionStock(tx, factoryUnitId, req, 'D'),
    ]);
    for (const pair of pairItems([...left, ...right])) {
      add(makeCandidate(pair, requestSector, requestUnit, 1, `Material compatível no setor ${requestSector}.`));
    }
  } else {
    const items = await findRequisitionStock(tx, factoryUnitId, req, req.footSide as FootSide | undefined);
    for (const item of items) {
      add(makeCandidate([item], requestSector, item.unit || requestUnit, 1, `Material compatível no setor ${requestSector}.`));
    }
  }

  // Regra operacional existente: Montagem pode aproveitar cabedal do mesmo produto
  // em Distribuição quando SKU, modelo, cor, grade e lado foram informados exatamente.
  if (requestSector === 'MONTAGEM' && req.sku && req.modelName && req.color && req.sizeGrade && req.footSide) {
    const linked = await tx.stockItem.findMany({
      where: {
        factoryUnitId,
        sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] },
        type: { equals: 'CABEDAL', mode: 'insensitive' },
        sku: { equals: normalizeStockText(req.sku), mode: 'insensitive' },
        productName: { equals: normalizeStockText(req.modelName), mode: 'insensitive' },
        color: { equals: normalizeStockColor(req.color), mode: 'insensitive' },
        sizeGrade: { equals: normalizeStockText(req.sizeGrade), mode: 'insensitive' },
        ...(req.footSide === 'PAR' ? { footSide: { in: ['E', 'D'] } } : { footSide: req.footSide as FootSide }),
      },
      include: { locations: { include: { location: true } } },
    });
    if (req.footSide === 'PAR') {
      for (const pair of pairItems(linked)) {
        add(makeCandidate(pair, requestSector, 'PAR', 1, 'SKU, modelo, cor, grade e lados compatíveis; cabedal disponível em Distribuição.'));
      }
    } else {
      for (const item of linked) {
        add(makeCandidate([item], requestSector, requestUnit, 1, 'SKU, modelo, cor, grade e lado compatíveis; cabedal disponível em Distribuição.'));
      }
    }
  }

  // Relacionamentos explícitos podem ligar qualquer setor fornecedor ao produto solicitado.
  {
    const skuIdentity = normalizeStockText(req.sku);
    const descriptionIdentity = normalizeStockText(req.description);
    const mappings = await tx.requisitionStockCompatibility.findMany({
      where: {
        factoryUnitId,
        requestSector: requestSector as SectorType,
        OR: [
          ...(skuIdentity ? [{ requestSku: { equals: skuIdentity, mode: 'insensitive' as const } }] : []),
          ...(descriptionIdentity ? [{ requestSku: null, requestDescription: { equals: descriptionIdentity, mode: 'insensitive' as const } }] : []),
        ],
      },
      include: { sourceStockItem: { include: { locations: { include: { location: true } } } } },
    });
    const eligible = mappings.filter(mapping => {
      const item = mapping.sourceStockItem;
      return normalizeStockSector(mapping.sourceSector) !== requestSector
        && normalizeStockSector(item.sector) === normalizeStockSector(mapping.sourceSector)
        && mappingMatchesRequest(mapping, req)
        && Number(item.quantity) > 0
        && (!req.footSide || req.footSide === 'PAR' || !item.footSide || item.footSide === req.footSide)
        && (req.footSide !== 'PAR' || !item.footSide || item.footSide === 'E' || item.footSide === 'D');
    });

    for (const mapping of eligible) {
      const item = mapping.sourceStockItem;
      if (req.footSide === 'PAR' && (item.footSide === 'E' || item.footSide === 'D')) {
        if (item.footSide !== 'E') continue;
        const mate = eligible.find(other => other.matchKey === mapping.matchKey
          && normalizeStockSector(other.sourceSector) === normalizeStockSector(mapping.sourceSector)
          && other.sourceStockItem.footSide === 'D'
          && Number(other.sourceQuantityPerRequestUnit) === Number(mapping.sourceQuantityPerRequestUnit)
          && sameSourceProductIgnoringSide(item, other.sourceStockItem));
        if (!mate) continue;
        const pair = [item, mate.sourceStockItem];
        try { assertCompatiblePair(pair[0], pair[1]); } catch { continue; }
        add(makeCandidate(pair, requestSector, mapping.requestUnit,
          Number(mapping.sourceQuantityPerRequestUnit), mapping.reason, [mapping.id, mate.id]));
        continue;
      }
      add(makeCandidate([item], requestSector, mapping.requestUnit,
        Number(mapping.sourceQuantityPerRequestUnit), mapping.reason, [mapping.id]));
    }
  }

  // Mantém candidatos isolados e ordena pela orientação operacional.
  const unique = new Map<string, RequisitionStockCandidate>();
  for (const candidate of candidates) {
    const current = unique.get(candidate.id);
    if (!current || candidate.rank < current.rank) unique.set(candidate.id, candidate);
  }
  return [...unique.values()].sort((a, b) => a.rank - b.rank
    || normalizeStockText(a.sourceSector).localeCompare(normalizeStockText(b.sourceSector))
    || a.id.localeCompare(b.id));
}

/** Mostra estoque com identificador coincidente sem tratá-lo como substituto compatível. */
export async function findUnverifiedRequisitionStockMatches(
  tx: StockTransactionClient,
  factoryUnitId: number,
  req: RequestIdentity,
  alreadyOfferedStockItemIds: number[] = [],
): Promise<UnverifiedRequisitionStockMatch[]> {
  const requestSector = normalizeStockSector(req.requestSector);
  const identifiers = new Set<string>();
  if (req.sku) identifiers.add(normalizeStockText(req.sku));
  if (req.modelName) identifiers.add(normalizeStockText(req.modelName));
  if ((requestSector === 'CORTE' || requestSector === 'APOIO') && req.description) {
    identifiers.add(normalizeStockText(req.description));
  }
  const values = [...identifiers].filter(Boolean);
  if (!values.length) return [];

  const fields = ['sku', 'code', 'pieceCode', 'productName', 'name', 'description'];
  const OR: Prisma.StockItemWhereInput[] = values.flatMap(value => fields.map(field => ({
    [field]: { equals: value, mode: 'insensitive' },
  })));
  const rows = await tx.stockItem.findMany({
    where: { factoryUnitId, quantity: { gt: 0 }, OR },
    include: { locations: { include: { location: true } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
  const offeredIds = new Set(alreadyOfferedStockItemIds.map(Number));
  const crossSectorRows = rows.filter(item => normalizeStockSector(item.sector) !== requestSector && !offeredIds.has(item.id));
  const productLinks = crossSectorRows.length
    ? await tx.requisitionStockCompatibility.findMany({
      where: {
        factoryUnitId,
        requestSector: requestSector as SectorType,
        sourceStockItemId: { in: crossSectorRows.map(item => item.id) },
      },
      select: { sourceStockItemId: true },
    })
    : [];
  const linkedItemIds = new Set(productLinks.map(link => link.sourceStockItemId));
  return crossSectorRows
    .slice(0, 10)
    .map(item => ({
      id: item.id,
      sourceSector: normalizeStockSector(item.sector) as SectorType,
      hasProductLink: linkedItemIds.has(item.id),
      code: item.code,
      pieceCode: item.pieceCode,
      sku: item.sku,
      modelName: item.productName,
      description: item.description || item.name,
      type: item.type,
      componentType: item.componentType,
      color: item.color || item.materialColor,
      sizeGrade: item.sizeGrade,
      footSide: item.footSide,
      unit: item.unit || 'UN',
      quantity: Number(item.quantity || 0),
      locations: [...new Set(item.locations
        .filter(link => Number(link.quantity) > 0)
        .map(link => `${link.location.name} (${link.quantity})`))],
    }));
}

/** Reconstitui a origem gravada na requisição, mesmo se o vínculo de produto for removido depois. */
export async function findPersistedRequisitionSource(
  tx: StockTransactionClient,
  factoryUnitId: number,
  req: Record<string, any>,
): Promise<RequisitionStockCandidate | null> {
  const ids = Array.isArray(req.sourceStockItemIds)
    ? [...new Set(req.sourceStockItemIds.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0))].sort((a: number, b: number) => a - b)
    : [];
  if (!ids.length) return null;
  const items = await tx.stockItem.findMany({
    where: { factoryUnitId, id: { in: ids } },
    include: { locations: { include: { location: true } } },
  });
  if (items.length !== ids.length) return null;
  const sourceSector = normalizeStockSector(req.sourceSector || req.requestSector);
  if (items.some(item => normalizeStockSector(item.sector) !== sourceSector)) return null;
  const compatibilityIds = Array.isArray(req.sourceCompatibilityIds)
    ? req.sourceCompatibilityIds.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0)
    : [];
  if (sourceSector !== normalizeStockSector(req.requestSector) && !compatibilityIds.length) return null;
  return makeCandidate(
    items,
    normalizeStockSector(req.requestSector),
    String(req.requestUnit || items[0].unit || 'UN'),
    Number(req.sourceQuantityPerRequestUnit || 1),
    String(req.sourceMatchReason || 'Origem registrada na criação da requisição.'),
    compatibilityIds,
  );
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
