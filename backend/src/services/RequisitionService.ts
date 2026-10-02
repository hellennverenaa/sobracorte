import { validateQuantity } from '../utils/unitHelper';
import { assertStockSectorAccess, StockAccessError } from '../auth/stockAccess';
import { movementSnapshot } from './movementSnapshot';
import { prisma, type StockTransactionClient } from '../prisma';
import { 
  CreateRequisitionPayloadDTO, 
  RequisitionItemInputDTO,
  RequisitionFilterDTO, 
  FulfillRequisitionDTO, 
  OperatorContext 
} from '../types/stock.dto';
import { Prisma, SectorType } from '../generated/prisma';
import { lockStockIdentityWrites, normalizeStockSector } from './stockIdentity';
import { debitStockItem } from './stockDebit';
import {
  findPersistedRequisitionSource,
  findRequisitionStockCandidates,
  findUnverifiedRequisitionStockMatches,
  RequisitionStockCandidate,
  UnverifiedRequisitionStockMatch,
} from './requisitionStock';

function persistedRequisitionDescription(item: RequisitionItemInputDTO) {
  const sector = normalizeStockSector(item.requestSector);
  const type = item.type?.trim().toUpperCase();
  const prefix = sector === 'PRE_FABRICADO'
    ? type
    : sector === 'DISTRIBUICAO' && type
      ? (type === 'SOLA_PROCESSADA' ? 'SOLA PROCESSADA' : type)
      : undefined;

  if (!prefix) return item.description;
  const description = item.description.trim().toUpperCase();
  if (description === prefix || description.startsWith(`${prefix} -`)) return description;
  const detail = item.modelName || item.sku || description;
  return `${prefix} - ${detail.trim().toUpperCase()}`;
}

export class RequisitionService {
  /**
   * Contagem de requisições pendentes para notificações e sininho
   */
  async getPendingCount(factoryUnitId: number, sector?: SectorType) {
    const normalized = sector ? normalizeStockSector(sector) : undefined;
    const sectorValues = normalized === 'DISTRIBUICAO'
      ? ['DISTRIBUICAO', 'EXPEDICAO'] as SectorType[]
      : normalized ? [normalized as SectorType] : [];
    const where: Prisma.MaterialRequisitionWhereInput = {
      factoryUnitId,
      status: 'PENDENTE',
      ...(normalized ? {
        OR: [
          { sourceSector: { in: sectorValues } },
          { sourceSector: null, requestSector: { in: sectorValues } },
        ],
      } : {}),
    };

    const count = await prisma.materialRequisition.count({ where });
    return { pendingCount: count };
  }

  /**
   * Gera o próximo código sequencial de requisição para a unidade fabril (ex: REQ-2026-0001)
   */
  private async generateNextCode(tx: StockTransactionClient, factoryUnitId: number): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `REQ-${currentYear}-`;

    const count = await tx.materialRequisition.count({
      where: {
        factoryUnitId,
        code: {
          startsWith: prefix,
        },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `${prefix}${sequence}`;
  }

  /**
   * Consulta a disponibilidade física de sobras no estoque em tempo real
   * com cálculo inteligente de pares completos para calçados (E + D)
   */
  async checkStockAvailability(
    req: {
      requestSector: SectorType; sku?: string | null; modelName?: string | null;
      description: string; type?: string | null; color?: string | null; sizeGrade?: string | null; footSide?: string | null;
      sourceCandidateId?: string | null;
    },
    factoryUnitId: number,
    client: StockTransactionClient = prisma,
  ): Promise<{
    quantity: number;
    locations: string[];
    pairsDetail?: { esq: number; dir: number };
    ambiguous?: boolean;
    unit?: string;
    candidates: RequisitionStockCandidate[];
    unverifiedStockMatches: UnverifiedRequisitionStockMatch[];
  }> {
    const candidates = await findRequisitionStockCandidates(client, factoryUnitId, req);
    const offeredStockItemIds = candidates.flatMap(candidate => candidate.sourceStockItemIds);
    const unverifiedStockMatches = await findUnverifiedRequisitionStockMatches(
      client,
      factoryUnitId,
      req,
      offeredStockItemIds,
    );
    const selected = req.sourceCandidateId ? candidates.find(candidate => candidate.id === req.sourceCandidateId) : undefined;
    const legacyChoice = !req.sourceCandidateId && candidates.length === 1 ? candidates[0] : undefined;
    const choice = selected || legacyChoice;
    return {
      unit: choice?.unit,
      quantity: choice?.quantity || 0,
      locations: choice?.locations || [],
      ambiguous: !choice && candidates.length > 1,
      candidates,
      unverifiedStockMatches,
    };
  }

  private async getSelectedSourceCandidate(req: any, factoryUnitId: number, tx: StockTransactionClient) {
    const persisted = await findPersistedRequisitionSource(tx, factoryUnitId, req);
    if (persisted) return persisted;
    if (Array.isArray(req.sourceStockItemIds) && req.sourceStockItemIds.length) return null;
    const candidates = await findRequisitionStockCandidates(tx, factoryUnitId, {
      ...req,
      requestUnit: req.requestUnit || undefined,
    });
    const legacyCandidates = candidates.filter(candidate => candidate.sourceCompatibilityIds.length === 0
      && normalizeStockSector(candidate.sourceSector) === normalizeStockSector(req.requestSector));
    return legacyCandidates.length === 1 ? legacyCandidates[0] : null;
  }

  private async getSelectedSourceStockInfo(req: any, factoryUnitId: number, tx: StockTransactionClient) {
    const candidate = await this.getSelectedSourceCandidate(req, factoryUnitId, tx);
    return candidate ? {
      quantity: candidate.quantity,
      unit: candidate.unit,
      locations: candidate.locations,
      sourceSector: candidate.sourceSector,
      sourceMatchReason: candidate.reason,
      sourceStockItems: candidate.items,
      pairsDetail: req.footSide === 'PAR' ? {
        esq: Number(candidate.stockRows.find((item: any) => item.footSide === 'E')?.quantity || 0),
        dir: Number(candidate.stockRows.find((item: any) => item.footSide === 'D')?.quantity || 0),
      } : undefined,
    } : { quantity: 0, unit: req.requestUnit || undefined, locations: [], sourceSector: req.sourceSector || req.requestSector, sourceMatchReason: req.sourceMatchReason || null, sourceStockItems: [], pairsDetail: undefined };
  }

  /**
   * Cria requisição digital de reposição com suporte a Multi-Itens e Trava de Saldo Zero
   */
  async createRequisition(payload: CreateRequisitionPayloadDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;

    const rawItems: RequisitionItemInputDTO[] = 
      'items' in payload && Array.isArray((payload as any).items) 
        ? (payload as any).items 
        : [payload as RequisitionItemInputDTO];

    if (rawItems.length === 0) {
      throw new Error('A requisição deve conter pelo menos 1 item.');
    }

    const createdItems = await prisma.$transaction(async (tx) => {
      // O mesmo lock das baixas protege disponibilidade, código e criação.
      await lockStockIdentityWrites(tx, factoryUnitId);
      // 1. Validar disponibilidade sob o lock, sem reservar saldo.
      const selectedCandidates: RequisitionStockCandidate[] = [];
      for (const item of rawItems) {
        const candidates = await findRequisitionStockCandidates(tx, factoryUnitId, {
          requestSector: item.requestSector as SectorType,
          sku: item.sku || null,
          modelName: item.modelName || null,
          description: item.description,
          type: item.type || null,
          sizeGrade: item.sizeGrade || null,
          color: item.color || null,
          footSide: item.footSide || null,
        });
        let selected = item.sourceCandidateId
          ? candidates.find(candidate => candidate.id === item.sourceCandidateId)
          : undefined;
        if (!selected && !item.sourceCandidateId) {
          const legacyChoices = candidates.filter(candidate => candidate.sourceCompatibilityIds.length === 0
            && normalizeStockSector(candidate.sourceSector) === normalizeStockSector(item.requestSector));
          if (legacyChoices.length === 1) selected = legacyChoices[0];
        }
        if (!candidates.length) {
          const itemLabel = item.sku ? `${item.sku} - ${item.description}` : item.description;
          throw new Error(
            `Não há sobra compatível com saldo positivo para ${itemLabel}. Confirme unidade, variantes e saldo do fornecedor. Para usar matéria-prima de Corte sem SKU compartilhado, é necessária uma regra especial de compatibilidade.`
          );
        }
        if (!selected) throw new Error('Escolha uma origem de estoque compatível para cada item da requisição.');
        if (selected.requiresConfirmation && item.confirmSourceSuggestion !== true) {
          throw new Error('Confirme que a sugestão de estoque fornecedor atende ao produto e às variantes solicitadas.');
        }
        validateQuantity(item.quantityRequested, selected.unit, item.requestSector);
        if (item.quantityRequested > selected.quantity) {
          throw new Error(`A quantidade solicitada excede o saldo equivalente da origem escolhida (${selected.quantity} ${selected.unit}).`);
        }
        selectedCandidates.push(selected);
      }

      // 2. Gerar código compartilhado e persistir todas as linhas atomicamente.
      const code = await this.generateNextCode(tx, factoryUnitId);

      const results = [];
      for (const [index, item] of rawItems.entries()) {
        const sec = normalizeStockSector(item.requestSector);
        const selected = selectedCandidates[index];
        const created = await tx.materialRequisition.create({
          data: {
            code,
            requestSector: sec as SectorType,
            requestUnit: selected.unit,
            sourceStockItemIds: selected.sourceStockItemIds,
            sourceCompatibilityIds: selected.sourceCompatibilityIds,
            sourceSector: selected.sourceSector,
            sourceQuantityPerRequestUnit: selected.sourceQuantityPerRequestUnit,
            sourceMatchReason: selected.reason,
            sku: item.sku || null,
            modelName: item.modelName || null,
            type: item.type || null,
            description: persistedRequisitionDescription(item),
            sizeGrade: item.sizeGrade || null,
            color: item.color || null,
            footSide: item.footSide || null,
            quantityRequested: item.quantityRequested,
            reason: item.reason,
            requesterId: operatorId || null,
            requesterName: operatorName || 'Solicitante',
            factoryUnitId,
          },
        });
        results.push(created);
      }
      return results;
    });

    // 4. Retornar itens enriquecidos com saldo
    const enriched = await Promise.all(
      createdItems.map(async (req) => {
        const stockInfo = await this.getSelectedSourceStockInfo(req, factoryUnitId, prisma);
        return {
          ...req,
          stockAvailable: stockInfo.quantity,
          unit: stockInfo.unit,
          locations: stockInfo.locations,
          pairsDetail: stockInfo.pairsDetail,
          sourceSector: stockInfo.sourceSector,
          sourceMatchReason: stockInfo.sourceMatchReason,
          sourceStockItems: stockInfo.sourceStockItems,
        };
      })
    );

    return {
      code: createdItems[0].code,
      totalItems: enriched.length,
      items: enriched,
    };
  }

  /**
   * Lista requisições com paginação, filtros e cálculo de saldo em tempo real
   */
  async listRequisitions(filter: RequisitionFilterDTO, context: OperatorContext) {
    const { factoryUnitId } = context;
    const { status, requestSector, search, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where: Prisma.MaterialRequisitionWhereInput = {
      factoryUnitId,
      ...(status ? { status } : {}),
      ...(requestSector ? {
        requestSector: (requestSector === 'DISTRIBUICAO' || (requestSector as string) === 'EXPEDICAO')
          ? { in: ['DISTRIBUICAO' as SectorType, 'EXPEDICAO' as SectorType] }
          : (requestSector as SectorType)
      } : {}),
      ...(search ? {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { modelName: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { requesterName: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };

    const [total, requisitions] = await Promise.all([
      prisma.materialRequisition.count({ where }),
      prisma.materialRequisition.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    // Cruzar cada requisição com o saldo físico em estoque
    const enriched = await Promise.all(
      requisitions.map(async (req) => {
        const stockInfo = await this.getSelectedSourceStockInfo(req, factoryUnitId, prisma);
        return {
          ...req,
          stockAvailable: stockInfo.quantity,
          unit: stockInfo.unit,
          locations: stockInfo.locations,
          pairsDetail: stockInfo.pairsDetail,
          sourceSector: stockInfo.sourceSector,
          sourceMatchReason: stockInfo.sourceMatchReason,
          sourceStockItems: stockInfo.sourceStockItems,
        };
      })
    );

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      data: enriched,
    };
  }

  /**
   * Atendimento e baixa atômica de requisição (1 clique)
   * com suporte a baixa coordenada de PAR COMPLETO (E + D)
   */
  async fulfillRequisition(id: string, dto: FulfillRequisitionDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;
    return prisma.$transaction(async tx => {
      await lockStockIdentityWrites(tx, factoryUnitId);
      const req = await tx.materialRequisition.findFirst({ where: { id, factoryUnitId } });
      if (!req) throw new Error('Requisição não encontrada.');
      if (req.status !== 'PENDENTE' && req.status !== 'ATENDIDA_PARCIAL') {
        throw new Error('Apenas requisições pendentes ou atendidas parcialmente podem receber baixa.');
      }
      const sourceSector = req.sourceSector || req.requestSector;
      if (context.role !== 'admin') {
        if (context.role !== 'admin_setor' || !context.assignedSector || normalizeStockSector(context.assignedSector) !== normalizeStockSector(sourceSector)) {
          const error: any = new Error('Acesso negado: apenas administradores do setor fornecedor podem atender esta requisição.');
          error.status = 403;
          throw error;
        }
      }
      const amount = new Prisma.Decimal(dto.quantity);
      if (!amount.isPositive() || amount.decimalPlaces() > 3 || amount.gt(new Prisma.Decimal(req.quantityRequested).minus(req.quantityFulfilled))) {
        throw new Error('A quantidade informada é inválida ou excede a pendência da requisição.');
      }
      validateQuantity(dto.quantity, req.requestUnit || 'UN', req.requestSector);
      const candidate = await this.getSelectedSourceCandidate(req, factoryUnitId, tx);
      if (!candidate) throw new Error('A origem escolhida não está mais compatível ou não possui saldo. Atualize a requisição antes de atender.');
      if (candidate.sourceSector !== sourceSector) throw new Error('A origem de estoque da requisição não corresponde mais ao setor fornecedor registrado.');
      if (amount.gt(new Prisma.Decimal(candidate.quantity))) throw new Error(`Saldo insuficiente na origem escolhida. Disponível: ${candidate.quantity} ${candidate.unit}.`);
      const sourceQuantity = amount.mul(new Prisma.Decimal(req.sourceQuantityPerRequestUnit || 1));
      if (sourceQuantity.decimalPlaces() > 3) throw new Error('A conversão configurada para a origem gera quantidade com mais de três casas decimais.');
      const items = candidate.sourceStockItemIds.map(id => candidate.stockRows.find((entry: any) => Number(entry.id) === id));
      if (items.some(item => !item)) throw new Error('Um dos materiais da origem escolhida não está mais disponível.');
      for (const item of items.sort((a, b) => a.id - b.id)) {
        const { debits } = await debitStockItem(tx, item, Number(sourceQuantity), dto.locationId);
        for (const debit of debits) {
          await tx.stockMovement.create({
            data: {
              factoryUnitId, stockItemId: item.id, sector: item.sector, type: 'SAIDA_REQUISICAO',
              quantity: debit.quantity, sourceLocationId: debit.locationId, sourceLocationName: debit.locationName,
              ...movementSnapshot(item),
              sourceStockItemId: item.id, sourceSector: item.sector,
              origem: req.footSide === 'PAR' ? `Atendimento de Requisição (Pé ${item.footSide === 'E' ? 'Esquerdo' : 'Direito'})` : 'Atendimento de Requisição',
              reason: `Atendimento digital da requisição ${req.code} · setor solicitante ${req.requestSector}; origem ${sourceSector}${req.sourceMatchReason ? ` · ${req.sourceMatchReason}` : ''}${dto.observation ? ' - ' + dto.observation : ''}`,
              operatorId: operatorId || null, operatorName: operatorName || 'Operador',
            },
          });
        }
      }
      const fulfilled = new Prisma.Decimal(req.quantityFulfilled).plus(amount);
      return tx.materialRequisition.update({
        where: { id_factoryUnitId: { id, factoryUnitId }, status: req.status, quantityFulfilled: req.quantityFulfilled },
        data: { quantityFulfilled: { increment: amount }, status: fulfilled.gte(req.quantityRequested) ? 'ATENDIDA_TOTAL' : 'ATENDIDA_PARCIAL' },
      });
    });
  }

  /**
   * Cancela uma requisição pendente
   */
  async cancelRequisition(id: string, context: OperatorContext) {
    const { factoryUnitId } = context;
    return prisma.$transaction(async tx => {
      await lockStockIdentityWrites(tx, factoryUnitId);
      const req = await tx.materialRequisition.findFirst({ where: { id, factoryUnitId } });
      if (!req) throw new Error('Requisição não encontrada.');
      if (context.role === 'leitor') throw new StockAccessError('Acesso negado: o perfil leitor não pode cancelar requisições.');
      assertStockSectorAccess(context, req.requestSector);
      if (req.status !== 'PENDENTE') throw new Error('Apenas requisições pendentes podem ser canceladas.');
      return tx.materialRequisition.update({
        where: { id_factoryUnitId: { id, factoryUnitId }, status: 'PENDENTE', quantityFulfilled: 0 },
        data: { status: 'CANCELADA' },
      });
    });
  }
}
