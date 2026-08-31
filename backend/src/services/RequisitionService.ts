import { prisma } from '../prisma';
import { CreateRequisitionDTO, RequisitionFilterDTO, OperatorContext } from '../types/stock.dto';
import { Prisma, SectorType } from '../generated/prisma';

export class RequisitionService {
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
   * Cria uma nova requisição digital de reposição
   */
  async createRequisition(dto: CreateRequisitionDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;

    const code = await this.generateNextCode(factoryUnitId);

    const requisition = await prisma.materialRequisition.create({
      data: {
        code,
        requestSector: dto.requestSector as SectorType,
        sku: dto.sku,
        modelName: dto.modelName,
        description: dto.description,
        sizeGrade: dto.sizeGrade || null,
        footSide: dto.footSide || null,
        quantityRequested: dto.quantityRequested,
        reason: dto.reason,
        requesterId: operatorId || null,
        requesterName: operatorName || 'Solicitante',
        factoryUnitId,
      },
    });

    const stockInfo = await this.checkStockAvailability(requisition, factoryUnitId);

    return {
      ...requisition,
      stockAvailable: stockInfo.quantity,
      locations: stockInfo.locations,
    };
  }

  /**
   * Consulta a disponibilidade física de sobras no estoque em tempo real
   */
  private async checkStockAvailability(
    req: {
      requestSector: SectorType;
      sku?: string | null;
      modelName?: string | null;
      description: string;
      sizeGrade?: string | null;
      footSide?: string | null;
    },
    factoryUnitId: number
  ): Promise<{ quantity: number; locations: string[] }> {
    if (req.requestSector === 'CORTE') {
      const materials = await prisma.material.findMany({
        where: {
          factoryUnitId,
          OR: [
            ...(req.sku ? [{ code: { equals: req.sku, mode: 'insensitive' as Prisma.QueryMode } }] : []),
            { name: { contains: req.description, mode: 'insensitive' as Prisma.QueryMode } },
          ],
        },
        include: {
          locations: {
            include: { location: true },
          },
        },
      });

      const totalQty = materials.reduce((acc, m) => acc + (m.quantity || 0), 0);
      const locSet = new Set<string>();
      for (const m of materials) {
        for (const locLink of m.locations) {
          if (locLink.location?.name && (locLink.quantity || 0) > 0) {
            locSet.add(`${locLink.location.name} (${locLink.quantity})`);
          }
        }
      }

      return {
        quantity: totalQty,
        locations: Array.from(locSet),
      };
    }

    // Setores Multi-Setor (APOIO, PRE_FABRICADO, EXPEDICAO, MONTAGEM)
    const stockItems = await prisma.stockItem.findMany({
      where: {
        factoryUnitId,
        sector: req.requestSector,
        quantity: { gt: 0 },
        OR: [
          ...(req.sku ? [
            { sku: { equals: req.sku, mode: 'insensitive' as Prisma.QueryMode } },
            { pieceCode: { equals: req.sku, mode: 'insensitive' as Prisma.QueryMode } },
          ] : []),
          ...(req.modelName ? [{ productName: { equals: req.modelName, mode: 'insensitive' as Prisma.QueryMode } }] : []),
          { description: { contains: req.description, mode: 'insensitive' as Prisma.QueryMode } },
        ],
        ...(req.sizeGrade ? { sizeGrade: { equals: req.sizeGrade, mode: 'insensitive' as Prisma.QueryMode } } : {}),
        ...(req.footSide ? { footSide: req.footSide as any } : {}),
      },
      include: {
        locations: {
          include: { location: true },
        },
      },
    });

    const totalQty = stockItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
    const locSet = new Set<string>();
    for (const item of stockItems) {
      for (const locLink of item.locations) {
        if (locLink.location?.name && (locLink.quantity || 0) > 0) {
          locSet.add(`${locLink.location.name} (${locLink.quantity})`);
        }
      }
    }

    return {
      quantity: totalQty,
      locations: Array.from(locSet),
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
      ...(requestSector ? { requestSector: requestSector as SectorType } : {}),
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
   * Cancela uma requisição pendente
   */
  async cancelRequisition(id: string, context: OperatorContext) {
    const { factoryUnitId } = context;

    const req = await prisma.materialRequisition.findFirst({
      where: { id, factoryUnitId },
    });

    if (!req) {
      throw new Error('Requisição não encontrada.');
    }

    if (req.status !== 'PENDENTE') {
      throw new Error('Apenas requisições pendentes podem ser canceladas.');
    }

    const updated = await prisma.materialRequisition.update({
      where: { id: req.id },
      data: { status: 'CANCELADA' },
    });

    return updated;
  }
}
