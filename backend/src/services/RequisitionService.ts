import { prisma } from '../prisma';
import { 
  CreateRequisitionPayloadDTO, 
  RequisitionItemInputDTO,
  RequisitionFilterDTO, 
  FulfillRequisitionDTO, 
  CheckStockAvailabilityDTO,
  OperatorContext 
} from '../types/stock.dto';
import { Prisma, SectorType } from '../generated/prisma';
import { lockStockIdentityWrites, normalizeStockSector } from './stockIdentity';
import { debitStockItem } from './stockDebit';
import { assertCompatiblePair, findRequisitionStock } from './requisitionStock';

export class RequisitionService {
  /**
   * Contagem de requisições pendentes para notificações e sininho
   */
  async getPendingCount(factoryUnitId: number, sector?: SectorType) {
    const where: Prisma.MaterialRequisitionWhereInput = {
      factoryUnitId,
      status: 'PENDENTE',
      ...(sector ? { requestSector: sector } : {}),
    };

    const count = await prisma.materialRequisition.count({ where });
    return { pendingCount: count };
  }

  /**
   * Gera o próximo código sequencial de requisição para a unidade fabril (ex: REQ-2026-0001)
   */
  private async generateNextCode(factoryUnitId: number): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `REQ-${currentYear}-`;

    const count = await prisma.materialRequisition.count({
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
      description: string; color?: string | null; sizeGrade?: string | null; footSide?: string | null;
    },
    factoryUnitId: number
  ): Promise<{ quantity: number; locations: string[]; pairsDetail?: { esq: number; dir: number }; ambiguous?: boolean }> {
    const items = await findRequisitionStock(prisma, factoryUnitId, req, req.footSide === 'PAR' ? 'E' : undefined);
    let selected = items;
    let pairsDetail;
    if (req.footSide === 'PAR') {
      const rightItems = await findRequisitionStock(prisma, factoryUnitId, req, 'D');
      if (items.length > 1 || rightItems.length > 1) return { quantity: 0, locations: [], ambiguous: true };
      if (!items.length || !rightItems.length) return { quantity: 0, locations: [], pairsDetail: { esq: Number(items[0]?.quantity || 0), dir: Number(rightItems[0]?.quantity || 0) } };
      try { assertCompatiblePair(items[0], rightItems[0]); }
      catch { return { quantity: 0, locations: [], ambiguous: true }; }
      pairsDetail = { esq: Number(items[0].quantity), dir: Number(rightItems[0].quantity) };
      selected = [...items, ...rightItems];
    } else if (items.length > 1) {
      return { quantity: 0, locations: [], ambiguous: true };
    }
    const locations = [...new Set(selected.flatMap(item => item.locations.filter(link => Number(link.quantity) > 0)
      .map(link => `${link.location.name} (${link.quantity})`)))];
    return { quantity: pairsDetail ? Math.min(pairsDetail.esq, pairsDetail.dir) : Number(items[0]?.quantity || 0), locations, ...(pairsDetail ? { pairsDetail } : {}) };
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

    // 1. TRAVA DE SALDO ZERO: Validar disponibilidade de todos os itens antes de abrir
    for (const item of rawItems) {
      const stockInfo = await this.checkStockAvailability(
        {
          requestSector: item.requestSector as SectorType,
          sku: item.sku || null,
          modelName: item.modelName || null,
          description: item.description,
          sizeGrade: item.sizeGrade || null,
          color: item.color || null,
          footSide: item.footSide || null,
        },
        factoryUnitId
      );

      if (stockInfo.ambiguous) throw new Error('Há materiais ambíguos no estoque. Especifique a identificação completa ou regularize duplicatas.');
      if (stockInfo.quantity <= 0) {
        const itemLabel = item.sku ? `${item.sku} - ${item.description}` : item.description;
        throw new Error(
          `MATERIAL INDISPONÍVEL EM SOBRAS DASS (${itemLabel}). Favor acionar a programação regular de corte/compra.`
        );
      }
    }

    // 2. Gerar código único compartilhado para a requisição
    const code = await this.generateNextCode(factoryUnitId);

    // 3. Persistir todos os itens dentro de uma transação
    const createdItems = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of rawItems) {
        let sec = item.requestSector;
        if ((sec as string) === 'EXPEDICAO' || (sec as string) === 'CABEDAIS') sec = 'DISTRIBUICAO';
        const created = await tx.materialRequisition.create({
          data: {
            code,
            requestSector: sec as SectorType,
            sku: item.sku || null,
            modelName: item.modelName || null,
            description: item.description,
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
        const stockInfo = await this.checkStockAvailability(req, factoryUnitId);
        return {
          ...req,
          stockAvailable: stockInfo.quantity,
          locations: stockInfo.locations,
          pairsDetail: stockInfo.pairsDetail,
        };
      })
    );

    return {
      code,
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

    // Se o usuário não for admin master e tiver setor atribuído (e não for 'TODOS'), restringir ao seu setor
    let effectiveSector = requestSector;
    if (context.role !== 'admin' && context.assignedSector && context.assignedSector !== 'TODOS') {
      const normalizedUserSector = (context.assignedSector === 'CABEDAIS' || context.assignedSector === 'EXPEDICAO')
        ? 'DISTRIBUICAO'
        : context.assignedSector;
      effectiveSector = normalizedUserSector as any;
    }

    const where: Prisma.MaterialRequisitionWhereInput = {
      factoryUnitId,
      ...(status ? { status } : {}),
      ...(effectiveSector ? {
        requestSector: (effectiveSector === 'DISTRIBUICAO' || (effectiveSector as string) === 'EXPEDICAO')
          ? { in: ['DISTRIBUICAO' as SectorType, 'EXPEDICAO' as SectorType] }
          : (effectiveSector as SectorType)
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
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Cruzar cada requisição com o saldo físico em estoque
    const enriched = await Promise.all(
      requisitions.map(async (req) => {
        const stockInfo = await this.checkStockAvailability(req, factoryUnitId);
        return {
          ...req,
          stockAvailable: stockInfo.quantity,
          locations: stockInfo.locations,
          pairsDetail: stockInfo.pairsDetail,
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
      if (context.role !== 'admin') {
        if (context.role !== 'admin_setor' || !context.assignedSector || normalizeStockSector(context.assignedSector === 'CABEDAIS' ? 'DISTRIBUICAO' : context.assignedSector) !== normalizeStockSector(req.requestSector)) {
          const error: any = new Error('Acesso negado: apenas administradores do setor podem atender esta requisição.');
          error.status = 403;
          throw error;
        }
      }
      const amount = new Prisma.Decimal(dto.quantity);
      if (!amount.isPositive() || amount.decimalPlaces() > 3 || amount.gt(new Prisma.Decimal(req.quantityRequested).minus(req.quantityFulfilled))) {
        throw new Error('A quantidade informada é inválida ou excede a pendência da requisição.');
      }
      const candidates = await findRequisitionStock(tx, factoryUnitId, req, req.footSide === 'PAR' ? 'E' : undefined);
      if (candidates.length > 1) throw new Error('Há mais de um material compatível. Regularize duplicatas ou especifique a identificação completa.');
      if (!candidates.length) throw new Error('Material compatível não encontrado para atender esta requisição.');
      const items = [candidates[0]];
      if (req.footSide === 'PAR') {
        const rightItems = await findRequisitionStock(tx, factoryUnitId, req, 'D');
        if (rightItems.length !== 1) throw new Error('O pé direito está ausente ou possui cadastros ambíguos.');
        assertCompatiblePair(items[0], rightItems[0]);
        items.push(rightItems[0]);
      }
      for (const item of items.sort((a, b) => a.id - b.id)) {
        const { debits } = await debitStockItem(tx, item, dto.quantity, dto.locationId);
        for (const debit of debits) {
          await tx.stockMovement.create({
            data: {
              factoryUnitId, stockItemId: item.id, sector: item.sector, type: 'SAIDA_REQUISICAO',
              quantity: debit.quantity, sourceLocationId: debit.locationId, sourceLocationName: debit.locationName,
              itemCode: item.sku || item.pieceCode || item.code, itemName: item.description || item.name || item.productName,
              itemCategory: item.type || item.componentType, itemUnit: item.unit,
              origem: req.footSide === 'PAR' ? `Atendimento de Requisição (Pé ${item.footSide === 'E' ? 'Esquerdo' : 'Direito'})` : 'Atendimento de Requisição',
              reason: `Atendimento digital da requisição ${req.code}${dto.observation ? ' - ' + dto.observation : ''}`,
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
      if (req.status !== 'PENDENTE') throw new Error('Apenas requisições pendentes podem ser canceladas.');
      return tx.materialRequisition.update({
        where: { id_factoryUnitId: { id, factoryUnitId }, status: 'PENDENTE', quantityFulfilled: 0 },
        data: { status: 'CANCELADA' },
      });
    });
  }
}
