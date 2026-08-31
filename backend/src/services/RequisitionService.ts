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
      requestSector: SectorType;
      sku?: string | null;
      modelName?: string | null;
      description: string;
      sizeGrade?: string | null;
      footSide?: string | null;
    },
    factoryUnitId: number
  ): Promise<{ quantity: number; locations: string[]; pairsDetail?: { esq: number; dir: number } }> {
    // 1. CORTE: Matéria-Prima
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

    // 2. APOIO: Peças Cortadas / Moldes (sem pé)
    if (req.requestSector === 'APOIO') {
      const stockItems = await prisma.stockItem.findMany({
        where: {
          factoryUnitId,
          sector: 'APOIO',
          quantity: { gt: 0 },
          OR: [
            ...(req.sku ? [
              { sku: { equals: req.sku, mode: 'insensitive' as Prisma.QueryMode } },
              { pieceCode: { equals: req.sku, mode: 'insensitive' as Prisma.QueryMode } },
            ] : []),
            ...(req.modelName ? [{ productName: { equals: req.modelName, mode: 'insensitive' as Prisma.QueryMode } }] : []),
            { description: { contains: req.description, mode: 'insensitive' as Prisma.QueryMode } },
          ],
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

    // 3. SETORES DE CALÇADOS (PRE_FABRICADO, EXPEDICAO, MONTAGEM)
    // Se o operador solicitou PAR COMPLETO ('PAR'), calcular min(Saldo E, Saldo D)
    if (req.footSide === 'PAR') {
      const baseFilter = {
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
      };

      const [leftItems, rightItems] = await Promise.all([
        prisma.stockItem.findMany({
          where: { ...baseFilter, footSide: 'E' },
          include: { locations: { include: { location: true } } },
        }),
        prisma.stockItem.findMany({
          where: { ...baseFilter, footSide: 'D' },
          include: { locations: { include: { location: true } } },
        }),
      ]);

      const totalE = leftItems.reduce((acc, i) => acc + (i.quantity || 0), 0);
      const totalD = rightItems.reduce((acc, i) => acc + (i.quantity || 0), 0);
      const fullPairs = Math.min(totalE, totalD);

      const locSet = new Set<string>();
      for (const item of leftItems) {
        for (const locLink of item.locations) {
          if (locLink.location?.name && (locLink.quantity || 0) > 0) {
            locSet.add(`${locLink.location.name} (E: ${locLink.quantity})`);
          }
        }
      }
      for (const item of rightItems) {
        for (const locLink of item.locations) {
          if (locLink.location?.name && (locLink.quantity || 0) > 0) {
            locSet.add(`${locLink.location.name} (D: ${locLink.quantity})`);
          }
        }
      }

      return {
        quantity: fullPairs,
        locations: Array.from(locSet),
        pairsDetail: { esq: totalE, dir: totalD },
      };
    }

    // Requisição de Pé Individual ('E' ou 'D') ou sem especificação
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
          footSide: item.footSide || null,
        },
        factoryUnitId
      );

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
        const created = await tx.materialRequisition.create({
          data: {
            code,
            requestSector: item.requestSector as SectorType,
            sku: item.sku || null,
            modelName: item.modelName || null,
            description: item.description,
            sizeGrade: item.sizeGrade || null,
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

    return await prisma.$transaction(async (tx) => {
      const req = await tx.materialRequisition.findFirst({
        where: { id, factoryUnitId },
      });

      if (!req) {
        throw new Error('Requisição não encontrada.');
      }

      if (req.status !== 'PENDENTE' && req.status !== 'ATENDIDA_PARCIAL') {
        throw new Error('Apenas requisições pendentes ou atendidas parcialmente podem receber baixa.');
      }

      const pendingQty = req.quantityRequested - req.quantityFulfilled;
      if (dto.quantity > pendingQty) {
        throw new Error(`A quantidade informada (${dto.quantity}) excede a pendência da requisição (${pendingQty}).`);
      }

      let sourceLocationId = dto.locationId || null;

      // 1. CORTE: Matéria-Prima
      if (req.requestSector === 'CORTE') {
        const material = await tx.material.findFirst({
          where: {
            factoryUnitId,
            OR: [
              ...(req.sku ? [{ code: { equals: req.sku, mode: 'insensitive' as Prisma.QueryMode } }] : []),
              { name: { contains: req.description, mode: 'insensitive' as Prisma.QueryMode } },
            ],
            quantity: { gte: dto.quantity },
          },
          include: { locations: true },
        });

        if (!material) {
          throw new Error('Saldo insuficiente na matéria-prima do Corte para atender esta requisição.');
        }

        await tx.material.update({
          where: { id: material.id },
          data: { quantity: { decrement: dto.quantity } },
        });

        const targetLocId = sourceLocationId || material.locations[0]?.locationId;
        if (targetLocId) {
          const locLink = material.locations.find((l) => l.locationId === targetLocId);
          if (locLink) {
            await tx.materialLocation.update({
              where: {
                materialId_locationId: {
                  materialId: material.id,
                  locationId: targetLocId,
                },
              },
              data: {
                quantity: Math.max(0, (locLink.quantity || 0) - dto.quantity),
              },
            });
          }
        }

        await tx.stockMovement.create({
          data: {
            factoryUnitId,
            sector: 'CORTE',
            type: 'SAIDA_REQUISICAO',
            quantity: dto.quantity,
            sourceLocationId: targetLocId || null,
            origem: 'Atendimento de Requisição',
            reason: `Atendimento digital da requisição ${req.code}${dto.observation ? ` - ${dto.observation}` : ''}`,
            operatorId: operatorId || null,
            operatorName: operatorName || 'Operador',
          },
        });
      } else if (req.footSide === 'PAR') {
        // 2. PAR COMPLETO: Debitar coordenadamente Pé Esquerdo ('E') E Pé Direito ('D')
        const baseFilter = {
          factoryUnitId,
          sector: req.requestSector,
          quantity: { gte: dto.quantity },
          OR: [
            ...(req.sku ? [
              { sku: { equals: req.sku, mode: 'insensitive' as Prisma.QueryMode } },
              { pieceCode: { equals: req.sku, mode: 'insensitive' as Prisma.QueryMode } },
            ] : []),
            ...(req.modelName ? [{ productName: { equals: req.modelName, mode: 'insensitive' as Prisma.QueryMode } }] : []),
            { description: { contains: req.description, mode: 'insensitive' as Prisma.QueryMode } },
          ],
          ...(req.sizeGrade ? { sizeGrade: { equals: req.sizeGrade, mode: 'insensitive' as Prisma.QueryMode } } : {}),
        };

        const leftItem = await tx.stockItem.findFirst({
          where: { ...baseFilter, footSide: 'E' },
          include: { locations: true },
        });

        const rightItem = await tx.stockItem.findFirst({
          where: { ...baseFilter, footSide: 'D' },
          include: { locations: true },
        });

        if (!leftItem || !rightItem) {
          throw new Error('Saldo insuficiente de pares completos (E ou D ausente) para atender a requisição.');
        }

        // Debitar Pé Esquerdo
        await tx.stockItem.update({
          where: { id: leftItem.id },
          data: { quantity: { decrement: dto.quantity } },
        });
        if (leftItem.locations[0]?.locationId) {
          await tx.stockItemLocation.update({
            where: {
              stockItemId_locationId: {
                stockItemId: leftItem.id,
                locationId: leftItem.locations[0].locationId,
              },
            },
            data: {
              quantity: Math.max(0, (leftItem.locations[0].quantity || 0) - dto.quantity),
            },
          });
        }
        await tx.stockMovement.create({
          data: {
            factoryUnitId,
            stockItemId: leftItem.id,
            sector: req.requestSector,
            type: 'SAIDA_REQUISICAO',
            quantity: dto.quantity,
            sourceLocationId: leftItem.locations[0]?.locationId || null,
            origem: 'Atendimento de Requisição (Pé Esquerdo)',
            reason: `Atendimento de par da requisição ${req.code}${dto.observation ? ` - ${dto.observation}` : ''}`,
            operatorId: operatorId || null,
            operatorName: operatorName || 'Operador',
          },
        });

        // Debitar Pé Direito
        await tx.stockItem.update({
          where: { id: rightItem.id },
          data: { quantity: { decrement: dto.quantity } },
        });
        if (rightItem.locations[0]?.locationId) {
          await tx.stockItemLocation.update({
            where: {
              stockItemId_locationId: {
                stockItemId: rightItem.id,
                locationId: rightItem.locations[0].locationId,
              },
            },
            data: {
              quantity: Math.max(0, (rightItem.locations[0].quantity || 0) - dto.quantity),
            },
          });
        }
        await tx.stockMovement.create({
          data: {
            factoryUnitId,
            stockItemId: rightItem.id,
            sector: req.requestSector,
            type: 'SAIDA_REQUISICAO',
            quantity: dto.quantity,
            sourceLocationId: rightItem.locations[0]?.locationId || null,
            origem: 'Atendimento de Requisição (Pé Direito)',
            reason: `Atendimento de par da requisição ${req.code}${dto.observation ? ` - ${dto.observation}` : ''}`,
            operatorId: operatorId || null,
            operatorName: operatorName || 'Operador',
          },
        });
      } else {
        // 3. Multi-Setor Padrão (APOIO ou Pé Individual)
        const stockItem = await tx.stockItem.findFirst({
          where: {
            factoryUnitId,
            sector: req.requestSector,
            quantity: { gte: dto.quantity },
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
          include: { locations: true },
        });

        if (!stockItem) {
          throw new Error(`Saldo insuficiente no setor ${req.requestSector} para atender esta requisição.`);
        }

        await tx.stockItem.update({
          where: { id: stockItem.id },
          data: { quantity: { decrement: dto.quantity } },
        });

        const targetLocId = sourceLocationId || stockItem.locations[0]?.locationId;
        if (targetLocId) {
          const locLink = stockItem.locations.find((l) => l.locationId === targetLocId);
          if (locLink) {
            await tx.stockItemLocation.update({
              where: {
                stockItemId_locationId: {
                  stockItemId: stockItem.id,
                  locationId: targetLocId,
                },
              },
              data: {
                quantity: Math.max(0, (locLink.quantity || 0) - dto.quantity),
              },
            });
          }
        }

        await tx.stockMovement.create({
          data: {
            factoryUnitId,
            stockItemId: stockItem.id,
            sector: req.requestSector,
            type: 'SAIDA_REQUISICAO',
            quantity: dto.quantity,
            sourceLocationId: targetLocId || null,
            origem: 'Atendimento de Requisição',
            reason: `Atendimento digital da requisição ${req.code}${dto.observation ? ` - ${dto.observation}` : ''}`,
            operatorId: operatorId || null,
            operatorName: operatorName || 'Operador',
          },
        });
      }

      const newFulfilled = req.quantityFulfilled + dto.quantity;
      const newStatus = newFulfilled >= req.quantityRequested ? 'ATENDIDA_TOTAL' : 'ATENDIDA_PARCIAL';

      const updatedRequisition = await tx.materialRequisition.update({
        where: { id: req.id },
        data: {
          quantityFulfilled: newFulfilled,
          status: newStatus,
        },
      });

      return updatedRequisition;
    });
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
