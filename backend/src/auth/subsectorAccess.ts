import { Prisma } from '../generated/prisma';
import { assignedStockSector, isStockMaster, sectorAccessWhere, StockAccessContext, StockAccessError } from './stockAccess';
import { normalizeSector } from '../utils/sectorHelper';

export interface SubsectorRecordRef {
  id: number;
  sector: string;
}

export interface SubsectorCategoryPolicy {
  categoryMode?: string;
  categoryLinks?: Array<{ categoryConfigId?: number; categoryId?: number }>;
}

/** Garante que uma prateleira seja exclusiva do escopo do item nela armazenado. */
export function assertStockLocationSubsector(
  location: { subsectorId?: number | null },
  itemSubsectorId: number | null | undefined,
) {
  if ((location.subsectorId ?? null) !== (itemSubsectorId ?? null)) {
    throw new Error('A localização deve pertencer ao mesmo subsetor do item. Localizações de subsetores diferentes não podem ser compartilhadas.');
  }
}

/** Aplica a lista de categorias configurada no subsetor. */
export function assertSubsectorCategoryAllowed(
  subsector: SubsectorCategoryPolicy | null | undefined,
  categoryId: number | null | undefined,
  requireCategory = false,
) {
  if (subsector?.categoryMode !== 'SELECTED') return;
  if (!categoryId) {
    if (requireCategory) throw new Error('Selecione uma categoria permitida para este subsetor.');
    return;
  }
  const allowed = new Set((subsector.categoryLinks || []).map(link => Number(link.categoryConfigId ?? link.categoryId)));
  if (!allowed.has(Number(categoryId))) {
    throw new Error('A categoria selecionada não está permitida para este subsetor.');
  }
}

/** Leitor pode consultar, mas não alterar estoque. */
export function assertStockWriteAccess(context: StockAccessContext) {
  if (context.role === 'leitor') {
    throw new StockAccessError('Acesso negado: o perfil Leitor permite somente consulta.');
  }
}

/**
 * Confere o subsetor real do registro. `null` é o caminho legado aprovado:
 * permanece sujeito apenas às permissões de setor que já existiam.
 */
export function assertStockSubsectorAccess(
  context: StockAccessContext,
  subsector: SubsectorRecordRef | null | undefined,
  recordSector: string,
) {
  assertStockWriteAccess(context);
  const assignedSector = context.role === 'leitor' && !context.assignedSector
    ? null
    : assignedStockSector(context);
  if (subsector && normalizeSector(subsector.sector) !== normalizeSector(recordSector)) {
    throw new StockAccessError('O subsetor informado não pertence ao setor do registro.');
  }
  if (assignedSector && normalizeSector(recordSector) !== normalizeSector(assignedSector)) {
    throw new StockAccessError(`Acesso negado: seu perfil está restrito ao setor ${assignedSector}.`);
  }
  if (!subsector || isStockMaster(context)) return;

  if (context.role === 'admin_setor') {
    if (!assignedSector || normalizeSector(subsector.sector) !== normalizeSector(assignedSector)) {
      throw new StockAccessError('Acesso negado: o subsetor não pertence ao setor atribuído ao usuário.');
    }
    return;
  }

  if (!context.subsectorIds?.includes(subsector.id)) {
    throw new StockAccessError('Acesso negado: você não possui acesso a este subsetor.');
  }
}

function requestedSectorWhere(context: StockAccessContext) {
  // Leitores sem setor atribuído continuam com a leitura multissetorial legada.
  if (context.role === 'leitor' && !context.assignedSector) return {};
  return sectorAccessWhere(context);
}

function subsectorMembershipWhere(context: StockAccessContext, field: 'stockItem' | 'location' | 'stockMovement') {
  // Compatibilidade para chamadas internas antigas sem contexto HTTP. Toda
  // requisição autenticada recebe subsectorIds, inclusive quando a lista é vazia.
  if (context.subsectorIds === undefined || isStockMaster(context)) return {};

  const idField = field === 'stockItem' ? 'subsectorId' : 'subsectorId';
  const legacyRecord = field === 'stockMovement'
    ? { subsectorId: null, OR: [{ stockItemId: null }, { stockItem: { is: { subsectorId: null } } }] }
    : { [idField]: null };
  if (context.role === 'admin_setor') {
    const sector = assignedStockSector(context);
    return {
      OR: [
        legacyRecord,
        { subsector: { sector } },
      ],
    };
  }

  return {
    OR: [
      legacyRecord,
      ...(context.subsectorIds.length ? [{ [idField]: { in: context.subsectorIds } }] : []),
    ],
  };
}

/** Filtro equivalente para consultas SQL parametrizadas sobre StockItem. */
export function stockItemSubsectorSql(alias: 'e' | 'd' | 'm' | 's', context: StockAccessContext) {
  const column = Prisma.raw(`${alias}."subsectorId"`);
  if (context.subsectorIds === undefined || isStockMaster(context)) return Prisma.sql`TRUE`;
  if (context.role === 'admin_setor') {
    const sector = assignedStockSector(context);
    return Prisma.sql`(
      ${column} IS NULL
      OR EXISTS (
        SELECT 1 FROM sobra_corte."SubsectorConfig" ss
        WHERE ss.id = ${column}
          AND ss."factoryUnitId" = ${alias}."factoryUnitId"
          AND ss.sector = ${sector}::sobra_corte."SectorType"
      )
    )`;
  }
  if (!context.subsectorIds.length) return Prisma.sql`${column} IS NULL`;
  return Prisma.sql`(${column} IS NULL OR ${column} IN (${Prisma.join(context.subsectorIds)}))`;
}

function combineScope<T extends object>(sectorScope: object, memberScope: object): T {
  const conditions = [sectorScope, memberScope].filter(condition => Object.keys(condition).length > 0);
  if (conditions.length === 0) return {} as T;
  if (conditions.length === 1) return conditions[0] as T;
  return { AND: conditions } as T;
}

export function stockItemScopeWhere(context: StockAccessContext): Prisma.StockItemWhereInput {
  return combineScope<Prisma.StockItemWhereInput>(
    requestedSectorWhere(context),
    subsectorMembershipWhere(context, 'stockItem'),
  );
}

export function locationScopeWhere(context: StockAccessContext): Prisma.LocationWhereInput {
  return combineScope<Prisma.LocationWhereInput>(
    requestedSectorWhere(context),
    subsectorMembershipWhere(context, 'location'),
  );
}

export function stockMovementScopeWhere(context: StockAccessContext): Prisma.StockMovementWhereInput {
  return combineScope<Prisma.StockMovementWhereInput>(
    requestedSectorWhere(context),
    subsectorMembershipWhere(context, 'stockMovement'),
  );
}
