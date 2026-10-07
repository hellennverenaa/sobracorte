import type { StockTransactionClient } from '../prisma';
import { Prisma, SectorType, FootSide, ComponentType } from '../generated/prisma';
import { normalizeStockColor, normalizeStockSector, normalizeStockText, stockIdentity } from './stockIdentity';
import { normalizeUnit } from '../utils/unitHelper';
import { stockItemScopeWhere, stockItemSubsectorSql } from '../auth/subsectorAccess';
import { assignedStockSector, isStockMaster } from '../auth/stockAccess';
import type { StockAccessContext } from '../auth/stockAccess';
import type { OperatorContext } from '../types/stock.dto';

export type RequestIdentity = {
  requestSector: SectorType;
  sku?: string | null;
  pieceCode?: string | null;
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
  requiresConfirmation: boolean;
  confirmationDetails: string[];
  rank: number;
};

export type UnverifiedRequisitionStockMatch = {
  id: number;
  sourceSector: SectorType;
  matchReasons: string[];
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

/** IDs de requisições cuja origem completa permanece visível no escopo atual.
 * Requisições legadas sem itens de origem continuam no fluxo histórico do setor.
 */
export async function findRequisitionIdsWithinStockScope(
  client: any,
  factoryUnitId: number,
  context?: StockAccessContext,
): Promise<string[] | undefined> {
  if (!context || !context.role || isStockMaster(context)) return undefined;
  const sector = context.role === 'leitor' && !context.assignedSector
    ? null
    : assignedStockSector(context);
  const itemSectorSql = !sector
    ? Prisma.sql`TRUE`
    : sector === 'DISTRIBUICAO'
      ? Prisma.sql`s."sector" IN ('DISTRIBUICAO'::sobra_corte."SectorType", 'EXPEDICAO'::sobra_corte."SectorType")`
      : Prisma.sql`s."sector" = ${sector}::sobra_corte."SectorType"`;
  const requestSectorSql = !sector
    ? Prisma.sql`TRUE`
    : sector === 'DISTRIBUICAO'
      ? Prisma.sql`r."requestSector" IN ('DISTRIBUICAO'::sobra_corte."SectorType", 'EXPEDICAO'::sobra_corte."SectorType")`
      : Prisma.sql`r."requestSector" = ${sector}::sobra_corte."SectorType"`;
  const sourceSectorSql = !sector
    ? Prisma.sql`TRUE`
    : sector === 'DISTRIBUICAO'
      ? Prisma.sql`r."sourceSector" IN ('DISTRIBUICAO'::sobra_corte."SectorType", 'EXPEDICAO'::sobra_corte."SectorType")`
      : Prisma.sql`r."sourceSector" = ${sector}::sobra_corte."SectorType"`;
  // Admin de Setor pode consultar solicitações do próprio setor e as destinadas
  // ao seu setor como fornecedor, sempre com a origem limitada ao escopo autorizado.
  const requestVisibilitySql = context.role === 'admin_setor' && sector
    ? Prisma.sql`(${requestSectorSql} OR ${sourceSectorSql})`
    : requestSectorSql;
  const rows = await client.$queryRaw(Prisma.sql`
    SELECT r."id"
    FROM sobra_corte."MaterialRequisition" r
    WHERE r."factoryUnitId" = ${factoryUnitId}
      AND ${requestVisibilitySql}
      AND (
        cardinality(r."sourceStockItemIds") = 0
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(r."sourceStockItemIds") AS source_ref("stockItemId")
          WHERE NOT EXISTS (
            SELECT 1
            FROM sobra_corte."StockItem" s
            WHERE s."id" = source_ref."stockItemId"
              AND s."factoryUnitId" = r."factoryUnitId"
              AND ${itemSectorSql}
              AND ${stockItemSubsectorSql('s', context)}
          )
        )
      )
  `) as Array<{ id: string }>;
  return rows.map(row => row.id);
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
export async function findRequisitionStock(
  tx: StockTransactionClient,
  factoryUnitId: number,
  req: RequestIdentity,
  side?: FootSide,
  context?: OperatorContext,
) {
  const sector = normalizeStockSector(req.requestSector);
  const AND: Prisma.StockItemWhereInput[] = [];
  const exact = (field: string, value?: string | null) => {
    if (normalizeStockText(value)) AND.push({ [field]: { equals: normalizeStockText(value), mode: 'insensitive' } });
  };
  const requestedComponent = normalizeStockText(req.type);
  if (sector === 'APOIO' && requestedComponent
    && requestedComponent !== 'CABEDAL' && requestedComponent !== 'PECA_CORTADA') return [];
  const apoioComponent = sector === 'APOIO'
    ? requestedComponent === 'CABEDAL' ? ComponentType.CABEDAL : ComponentType.PECA_CORTADA
    : undefined;
  if (sector === 'APOIO') {
    // O campo certo depende do componente. `sku` fica reservado ao cabedal;
    // código de peça cortada nunca é procurado em SKU ou texto livre.
    exact(apoioComponent === 'CABEDAL' ? 'sku' : 'pieceCode', apoioComponent === 'CABEDAL'
      ? req.sku
      : req.pieceCode || req.sku);
    AND.push({ componentType: apoioComponent });
  } else {
    exact(sector === 'CORTE' ? 'code' : 'sku', req.sku);
  }
  if (sector !== 'CORTE') exact('productName', req.modelName);
  if (sector === 'CORTE') exact('name', req.description);
  if (sector !== 'APOIO') exact('type', inferredType(req, sector));
  exact('sizeGrade', req.sizeGrade);

  const items = await tx.stockItem.findMany({
    where: {
      factoryUnitId,
      sector: sectorWhere(sector),
      AND: [...AND, ...(context ? [stockItemScopeWhere(context)] : [])],
      ...(side ? { footSide: side } : {}),
    },
    include: { locations: { include: { location: true } } },
  });
  return items.filter(item => {
    const isCutPiece = sector === 'APOIO' && item.componentType === 'PECA_CORTADA';
    if (req.color && normalizeStockColor(isCutPiece ? item.materialColor : item.color) !== normalizeStockColor(req.color)) return false;
    if (!req.footSide && item.footSide) return false;
    return true;
  });
}

function candidateRank(requestSector: string, sourceSector: string) {
  const request = normalizeStockSector(requestSector);
  const source = normalizeStockSector(sourceSector);
  if (source === request) return 0;
  // Para reutilização de produto/componente, prioriza o estágio mais pronto.
  // A compatibilidade de tipo e variantes continua sendo validada antes do rank.
  if (source === 'MONTAGEM') return 10;
  if (source === 'DISTRIBUICAO' || source === 'EXPEDICAO') return 20;
  if (source === 'PRE_FABRICADO') return 30;
  if (source === 'APOIO') return 40;
  if (source === 'CORTE') return 50;
  return 100;
}

type AutomaticMatchMode = 'code' | 'model';

function automaticMatchCheck(
  item: Record<string, any>,
  req: RequestIdentity,
  requestUnit: string,
  mode: AutomaticMatchMode,
) {
  const requestSector = normalizeStockSector(req.requestSector);
  const sourceSector = normalizeStockSector(item.sector);
  const sourceType = normalizeStockText(sourceSector === 'APOIO' ? item.componentType || item.type : item.type);
  const expectedType = normalizeStockText(inferredType(req, requestSector));
  const montageCabedal = requestSector === 'MONTAGEM' && sourceSector === 'DISTRIBUICAO';
  const confirmationDetails: string[] = [];

  if (!['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'].includes(sourceSector)) {
    return { eligible: false, confirmationDetails };
  }
  if (sourceSector === requestSector) return { eligible: false, confirmationDetails };
  // O fluxo de produto/componente não usa matéria-prima como substituta.
  // Requisições de matéria-prima são tratadas separadamente no próprio Corte.
  if (sourceSector === 'CORTE' && requestSector !== 'CORTE') {
    return { eligible: false, confirmationDetails };
  }
  if (mode === 'code' && ['CORTE', 'APOIO'].includes(sourceSector)
    && normalizeStockText(item.sku) !== normalizeStockText(req.sku)) {
    return { eligible: false, confirmationDetails };
  }
  // Corte tracks raw material, not the finished product model. It can only be
  // linked automatically through a genuinely shared SKU; model-only matches need
  // an explicit product relationship.
  if (mode === 'model' && sourceSector === 'CORTE') {
    return { eligible: false, confirmationDetails };
  }
  if (mode === 'code' && requestSector === 'MONTAGEM') {
    if (sourceSector === 'PRE_FABRICADO') return { eligible: false, confirmationDetails };
    if (sourceSector === 'DISTRIBUICAO' && sourceType !== 'CABEDAL') return { eligible: false, confirmationDetails };
    if (sourceSector === 'APOIO' && !['PECA_CORTADA', 'CABEDAL', 'PE_PRONTO'].includes(sourceType)) {
      return { eligible: false, confirmationDetails };
    }
  }
  if (mode === 'model') {
    if (montageCabedal) {
      if (sourceType !== 'CABEDAL') return { eligible: false, confirmationDetails };
    } else if (requestSector === 'MONTAGEM' && sourceSector === 'APOIO') {
      if (!['PECA_CORTADA', 'CABEDAL'].includes(sourceType)) return { eligible: false, confirmationDetails };
    } else if (!expectedType || !sourceType || sourceType !== expectedType) {
      return { eligible: false, confirmationDetails };
    }
  } else if (montageCabedal && sourceType !== 'CABEDAL') {
    return { eligible: false, confirmationDetails };
  }

  const targetUnit = normalizeUnit(requestUnit, requestSector);
  const sourceUnit = normalizeUnit(item.unit, sourceSector);
  if (req.footSide === 'PAR') {
    // A pair is made from one discrete left item and one discrete right item;
    // no unit conversion or un-sided stock is inferred.
    if (sourceUnit !== 'UN' || !['E', 'D'].includes(item.footSide)) {
      return { eligible: false, confirmationDetails };
    }
  } else if (sourceUnit !== targetUnit || item.footSide === 'PAR') {
    return { eligible: false, confirmationDetails };
  }

  const compareVariant = (
    requested: unknown,
    supplied: unknown,
    label: string,
    normalize: (value: unknown) => string = normalizeStockText,
  ) => {
    const target = normalize(requested);
    const source = normalize(supplied);
    if (!target) return true;
    if (!source) {
      confirmationDetails.push(`${label} não está cadastrado no estoque fornecedor`);
      return true;
    }
    return target === source;
  };

  if (req.modelName && item.productName && normalizeStockText(req.modelName) !== normalizeStockText(item.productName)) {
    return { eligible: false, confirmationDetails };
  }
  if (req.modelName && !item.productName) confirmationDetails.push('modelo/linha não está cadastrado no estoque fornecedor');

  const sourceColor = item.color || item.materialColor;
  if (!compareVariant(req.color, sourceColor, 'cor', normalizeStockColor)) {
    return { eligible: false, confirmationDetails };
  }
  if (!compareVariant(req.sizeGrade, item.sizeGrade, 'grade/tamanho')) {
    return { eligible: false, confirmationDetails };
  }

  const requestedSide = req.footSide;
  if (requestedSide === 'E' || requestedSide === 'D') {
    if (item.footSide && item.footSide !== requestedSide) return { eligible: false, confirmationDetails };
    if (!item.footSide) confirmationDetails.push('lado do pé não está cadastrado no estoque fornecedor');
  }
  if (expectedType && sourceType && sourceType !== expectedType && !montageCabedal) {
    return { eligible: false, confirmationDetails };
  }
  if (expectedType && !sourceType) confirmationDetails.push('tipo/componente não está cadastrado no estoque fornecedor');

  return { eligible: true, confirmationDetails: [...new Set(confirmationDetails)] };
}

function makeCandidate(
  items: any[],
  requestSector: string,
  requestUnit: string,
  sourceQuantityPerRequestUnit: number,
  reason: string,
  compatibilityIds: number[] = [],
  requiresConfirmation = false,
  confirmationDetails: string[] = [],
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
    requiresConfirmation,
    confirmationDetails,
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
 * Busca alternativas sem agregar saldos de produtos ou setores diferentes.
 * Peças Cortadas podem ser sugeridas por modelo/variantes; matéria-prima do Corte
 * permanece restrita ao fluxo de solicitação interno desse setor.
 */
export async function findRequisitionStockCandidates(
  tx: StockTransactionClient,
  factoryUnitId: number,
  req: RequestIdentity & { requestUnit?: string | null },
  context?: OperatorContext,
): Promise<RequisitionStockCandidate[]> {
  const requestSector = normalizeStockSector(req.requestSector);
  const candidates: RequisitionStockCandidate[] = [];
  const add = (candidate: RequisitionStockCandidate | null) => { if (candidate) candidates.push(candidate); };
  const requestUnit = req.requestUnit || (req.footSide === 'PAR' ? 'PAR' : requestSector === 'CORTE' ? 'M²' : 'UN');

  if (req.footSide === 'PAR') {
    const [left, right, completePairs] = await Promise.all([
      findRequisitionStock(tx, factoryUnitId, req, 'E', context),
      findRequisitionStock(tx, factoryUnitId, req, 'D', context),
      findRequisitionStock(tx, factoryUnitId, req, 'PAR', context),
    ]);
    for (const item of completePairs) {
      add(makeCandidate([item], requestSector, requestUnit, 1, `Material compatível no setor ${requestSector}.`));
    }
    for (const pair of pairItems([...left, ...right])) {
      add(makeCandidate(pair, requestSector, requestUnit, 1, `Material compatível no setor ${requestSector}.`));
    }
  } else {
    const items = await findRequisitionStock(tx, factoryUnitId, req, req.footSide as FootSide | undefined, context);
    for (const item of items) {
      add(makeCandidate([item], requestSector, item.unit || requestUnit, 1, `Material compatível no setor ${requestSector}.`));
    }
  }

  // Matéria-prima é uma requisição própria do Corte. Não cruza SKU/código,
  // modelo com produtos e componentes acabados.
  if (requestSector === 'CORTE') return candidates;

  // Regra operacional existente: Montagem pode aproveitar cabedal do mesmo produto
  // em Distribuição quando SKU, modelo, cor, grade e lado foram informados exatamente.
  if (requestSector === 'MONTAGEM' && req.sku && req.modelName && req.color && req.sizeGrade && req.footSide) {
    const linked = await tx.stockItem.findMany({
      where: {
        factoryUnitId,
        ...(context ? { AND: [stockItemScopeWhere(context)] } : {}),
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
        add(makeCandidate(pair, requestSector, 'PAR', 1, 'SKU, modelo, cor, grade e lados compatíveis; cabedal disponível em Distribuição.', [], true));
      }
    } else {
      for (const item of linked) {
        add(makeCandidate([item], requestSector, requestUnit, 1, 'SKU, modelo, cor, grade e lado compatíveis; cabedal disponível em Distribuição.', [], true));
      }
    }
  }

  // Código compartilhado: permite sugerir o registro do setor fornecedor se a
  // unidade, o produto e as variantes preenchidas não entrarem em conflito.
  // O usuário ainda precisa confirmar que o material realmente atende ao pedido.
  const codeIdentity = requestSector === 'APOIO'
    ? normalizeStockText(normalizeStockText(req.type) === 'CABEDAL' ? req.sku : req.pieceCode || req.sku)
    : normalizeStockText(req.sku);
  const allowAutomaticCrossSectorMatches = requestSector !== 'APOIO';
  const codeRows = codeIdentity && allowAutomaticCrossSectorMatches
    ? await tx.stockItem.findMany({
      where: {
        factoryUnitId,
        ...(context ? { AND: [stockItemScopeWhere(context)] } : {}),
        sector: { not: 'CORTE' },
        quantity: { gt: 0 },
        OR: (['sku', 'code', 'pieceCode'] as const).map((field): Prisma.StockItemWhereInput => ({
          [field]: { equals: codeIdentity, mode: 'insensitive' as const },
        })),
      },
      include: { locations: { include: { location: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 500,
    })
    : [];
  const crossSectorCodeRows = codeRows.filter(item => normalizeStockSector(item.sector) !== requestSector);
  const eligibleCodeMatches = crossSectorCodeRows
    .map(item => ({ item, match: automaticMatchCheck(item, req, requestUnit, 'code') }))
    .filter(entry => entry.match.eligible);
  const sectorsWithCompatibleExactCode = new Set(eligibleCodeMatches.map(({ item }) => normalizeStockSector(item.sector)));
  const exactCodeReason = 'Código correspondente; confira o componente e as variantes antes de confirmar.';

  if (req.footSide === 'PAR') {
    for (const sourceSector of new Set(eligibleCodeMatches.map(({ item }) => normalizeStockSector(item.sector)))) {
      const sectorItems = eligibleCodeMatches
        .filter(({ item }) => normalizeStockSector(item.sector) === sourceSector)
        .map(({ item }) => item);
      for (const pair of pairItems(sectorItems)) {
        const details = [...new Set(pair.flatMap(item => automaticMatchCheck(item, req, requestUnit, 'code').confirmationDetails))];
        add(makeCandidate(pair, requestSector, requestUnit, 1, exactCodeReason, [], true, details));
      }
    }
  } else {
    for (const { item, match } of eligibleCodeMatches) {
      add(makeCandidate([item], requestSector, requestUnit, 1, exactCodeReason, [], true, match.confirmationDetails));
    }
  }

  // Model fallback uses an exact model/line and rejects conflicts in any
  // requested variant. Component type must also match, except for Montagem,
  // where Cabedal and Peças Cortadas are shown as explicit suggestions for the
  // requester to confirm. Raw materials in Corte are excluded.
  const modelIdentity = normalizeStockText(req.modelName);
  if (modelIdentity && allowAutomaticCrossSectorMatches) {
    const modelRows = await tx.stockItem.findMany({
      where: {
        factoryUnitId,
        ...(context ? { AND: [stockItemScopeWhere(context)] } : {}),
        sector: { not: 'CORTE' },
        quantity: { gt: 0 },
        productName: { equals: modelIdentity, mode: 'insensitive' },
      },
      include: { locations: { include: { location: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    const eligible = modelRows.filter(item => {
      const sourceSector = normalizeStockSector(item.sector);
      if (sourceSector === requestSector || sectorsWithCompatibleExactCode.has(sourceSector)) return false;
      return automaticMatchCheck(item, req, requestUnit, 'model').eligible;
    });
    const modelReason = 'Modelo/linha e variantes preenchidas coincidem; confirme que este material atende ao produto solicitado.';
    if (req.footSide === 'PAR') {
      for (const sourceSector of new Set(eligible.map(item => normalizeStockSector(item.sector)))) {
        const sectorItems = eligible.filter(item => normalizeStockSector(item.sector) === sourceSector);
        for (const pair of pairItems(sectorItems)) {
          const details = [...new Set(pair.flatMap(item => automaticMatchCheck(item, req, requestUnit, 'model').confirmationDetails))];
          add(makeCandidate(pair, requestSector, requestUnit, 1, modelReason, [], true, details));
        }
      }
    } else {
      for (const item of eligible) {
        const match = automaticMatchCheck(item, req, requestUnit, 'model');
        add(makeCandidate([item], requestSector, requestUnit, 1, modelReason, [], true, match.confirmationDetails));
      }
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
  context?: OperatorContext,
): Promise<UnverifiedRequisitionStockMatch[]> {
  const requestSector = normalizeStockSector(req.requestSector);
  type StockIdentityField = 'sku' | 'code' | 'pieceCode' | 'productName' | 'name' | 'description';
  const fieldLabels: Record<StockIdentityField, string> = {
    sku: 'SKU',
    code: 'código do material',
    pieceCode: 'código da peça',
    productName: 'modelo/linha',
    name: 'nome do material',
    description: 'descrição da peça',
  };
  const comparisons: Array<{ field: StockIdentityField; requestField: string; value: string }> = [];
  const addComparisons = (value: string | null | undefined, requestField: string, fields: StockIdentityField[]) => {
    const normalizedValue = normalizeStockText(value);
    if (!normalizedValue) return;
    for (const field of fields) comparisons.push({ field, requestField, value: normalizedValue });
  };

  // Compare like-for-like identifiers. A requested SKU must not match a free-form
  // material name or description that happens to contain the same text.
  if (requestSector === 'APOIO' || requestSector === 'CORTE') return [];
  addComparisons(req.sku, 'SKU informado', ['sku', 'code', 'pieceCode']);
  addComparisons(req.modelName, 'modelo/linha informado', ['productName']);
  if (!req.sku && !req.modelName && (requestSector === 'CORTE' || requestSector === 'APOIO')) {
    addComparisons(req.description, 'descrição informada', ['description', 'name']);
  }
  if (!comparisons.length) return [];

  const OR: Prisma.StockItemWhereInput[] = comparisons.map(({ field, value }) => ({
    [field]: { equals: value, mode: 'insensitive' },
  }));
  const rows = await tx.stockItem.findMany({
    where: { factoryUnitId, sector: { not: 'CORTE' }, quantity: { gt: 0 }, AND: context ? [stockItemScopeWhere(context), { OR }] : [{ OR }] },
    include: { locations: { include: { location: true } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
  const offeredIds = new Set(alreadyOfferedStockItemIds.map(Number));
  const crossSectorRows = rows.filter(item => normalizeStockSector(item.sector) !== requestSector && !offeredIds.has(item.id));
  return crossSectorRows
    .slice(0, 10)
    .map(item => {
      const matchReasons = [...new Set(comparisons
        .filter(({ field, value }) => normalizeStockText(item[field]) === value)
        .map(({ field, requestField, value }) => `${requestField} “${value}” → ${fieldLabels[field]}`))];
      return {
        id: item.id,
        sourceSector: normalizeStockSector(item.sector) as SectorType,
        matchReasons,
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
      };
    });
}

/** Reconstitui a origem gravada na requisição, mesmo se o vínculo de produto for removido depois. */
export async function findPersistedRequisitionSource(
  tx: StockTransactionClient,
  factoryUnitId: number,
  req: Record<string, any>,
  context?: OperatorContext,
): Promise<RequisitionStockCandidate | null> {
  const ids = Array.isArray(req.sourceStockItemIds)
    ? [...new Set(req.sourceStockItemIds.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0))].sort((a: number, b: number) => a - b)
    : [];
  if (!ids.length) return null;
  const items = await tx.stockItem.findMany({
    where: { factoryUnitId, id: { in: ids }, ...(context ? { AND: [stockItemScopeWhere(context)] } : {}) },
    include: { locations: { include: { location: true } } },
  });
  if (items.length !== ids.length) return null;
  const sourceSector = normalizeStockSector(req.sourceSector || req.requestSector);
  if (items.some(item => normalizeStockSector(item.sector) !== sourceSector)) return null;
  const compatibilityIds = Array.isArray(req.sourceCompatibilityIds)
    ? req.sourceCompatibilityIds.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0)
    : [];
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
    || (left.subsectorId ?? null) !== (right.subsectorId ?? null)
    || normalizeUnit(left.unit, left.sector) !== normalizeUnit(right.unit, right.sector)
    || Object.keys(leftIdentity).some(field => field !== 'footSide' && leftIdentity[field] !== rightIdentity[field])) {
    throw new Error('Os pés esquerdo e direito devem pertencer ao mesmo produto, modelo, material, cor e grade.');
  }
}
