import { assertStockSectorAccess, assertGeneralStockAccess, sectorAccessWhere } from '../auth/stockAccess';
import { movementSnapshot } from './movementSnapshot';
import { prisma } from '../prisma';
import { CreateStockMovementDTO, MovementHistoryFilterDTO, OperatorContext } from '../types/stock.dto';
import { Prisma, SectorType } from '../generated/prisma';
import { assertStockLocationSector, lockStockIdentityWrites, normalizeStockSector } from './stockIdentity';
import { requiresIntegerQuantity } from '../utils/unitHelper';

export class StockMovementService {
  /**
   * Registra uma movimentação de estoque (Saída, Refugo, Transferência) com auditoria
   */
  async createMovement(dto: CreateStockMovementDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;
    const { stockItemId, sector, type, quantity, locationId, destinationLocationId, origem, reason } = dto;

    return await prisma.$transaction(async (tx) => {
      await lockStockIdentityWrites(tx, factoryUnitId);
      // Todos os setores, inclusive CORTE, usam o modelo canônico.
      const item = await tx.stockItem.findFirst({
        where: { id: stockItemId, factoryUnitId },
        include: { locations: { include: { location: true } } },
      });

      if (!item) {
        throw new Error('Item de estoque ou matéria-prima não encontrado.');
      }

      assertStockSectorAccess(context, item.sector);

      if (requiresIntegerQuantity(item.unit, item.sector) && !Number.isInteger(quantity)) {
        throw new Error(`A quantidade para a unidade ${item.unit || 'UN'} deve ser um número inteiro (sem decimais).`);
      }

      if (sector && normalizeStockSector(sector) !== normalizeStockSector(item.sector)) {
        throw new Error('O item não pertence ao setor informado para a movimentação.');
      }
      const targetLocationId = locationId || item.locations[0]?.locationId;
      if (targetLocationId) {
        const location = await tx.location.findFirst({ where: { id: targetLocationId, factoryUnitId } });
        if (!location) throw new Error('A localização não foi encontrada nesta unidade fabril.');
        assertStockLocationSector(location, item.sector);
        if (type === 'TRANSFERENCIA' || type === 'ENTRADA') assertGeneralStockAccess(context, location);
      }

      // Atualizar saldo do StockItem
      if (type === 'ENTRADA') {
        if (!targetLocationId) {
          throw new Error('A localização é obrigatória para registrar a entrada.');
        }

        await tx.stockItem.update({
          where: { id_factoryUnitId: { id: item.id, factoryUnitId } },
          data: { quantity: { increment: quantity } },
        });

        await tx.stockItemLocation.upsert({
          where: {
            stockItemId_locationId_factoryUnitId: {
              stockItemId: item.id,
              locationId: targetLocationId,
              factoryUnitId,
            },
          },
          update: {
            quantity: { increment: quantity },
          },
          create: {
            stockItemId: item.id,
            locationId: targetLocationId,
            factoryUnitId,
            quantity,
          },
        });
      } else if (type === 'SAIDA' || type === 'REFUGO') {
        if (!targetLocationId) {
          throw new Error('A localização de origem é obrigatória para registrar a baixa.');
        }

        // Decremento atômico condicional na localização
        const locUpdate = await tx.stockItemLocation.updateMany({
          where: {
            stockItemId: item.id,
            locationId: targetLocationId,
            factoryUnitId,
            quantity: { gte: quantity },
          },
          data: {
            quantity: { decrement: quantity },
          },
        });

        if (locUpdate.count === 0) {
          throw new Error(`Saldo insuficiente na prateleira selecionada para realizar a baixa.`);
        }

        // Decremento atômico condicional no StockItem
        const itemUpdate = await tx.stockItem.updateMany({
          where: {
            id: item.id,
            factoryUnitId,
            quantity: { gte: quantity },
          },
          data: {
            quantity: { decrement: quantity },
          },
        });

        if (itemUpdate.count === 0) {
          throw new Error(`Saldo total insuficiente para realizar a baixa.`);
        }
      }

      if (type === 'TRANSFERENCIA') {
        if (!destinationLocationId) {
          throw new Error('A localização de destino é obrigatória para transferências.');
        }

        const destLocation = await tx.location.findFirst({
          where: { id: destinationLocationId, factoryUnitId },
        });
        if (!destLocation) {
          throw new Error('A localização de destino não foi encontrada nesta unidade fabril.');
        }

        const sourceLocId = locationId || item.locations[0]?.locationId;
        if (!sourceLocId) {
          throw new Error('A localização de origem não foi identificada.');
        }

        if (sourceLocId === destinationLocationId) {
          throw new Error('A localização de origem e destino devem ser diferentes.');
        }

        assertStockLocationSector(destLocation, item.sector);
        assertGeneralStockAccess(context, destLocation);

        // Debitar da prateleira de origem com decremento condicional
        const sourceLocUpdate = await tx.stockItemLocation.updateMany({
          where: {
            stockItemId: item.id,
            locationId: sourceLocId,
            factoryUnitId,
            quantity: { gte: quantity },
          },
          data: {
            quantity: { decrement: quantity },
          },
        });

        if (sourceLocUpdate.count === 0) {
          throw new Error('Saldo insuficiente na prateleira de origem para transferência.');
        }

        // Transferência intra-setor normal: credita no destino para o mesmo item
        await tx.stockItemLocation.upsert({
          where: {
            stockItemId_locationId_factoryUnitId: {
              stockItemId: item.id,
              locationId: destinationLocationId,
              factoryUnitId,
            },
          },
          update: {
            quantity: { increment: quantity },
          },
          create: {
            stockItemId: item.id,
            locationId: destinationLocationId,
            factoryUnitId,
            quantity,
          },
        });
      }

      // Buscar nomes das localizações para snapshot imutável
      let sourceLocationName: string | null = null;
      let destinationLocationName: string | null = null;

      const sourceLocId = type === 'ENTRADA' ? null : targetLocationId;
      if (sourceLocId) {
        const srcLoc = await tx.location.findFirst({
          where: { id: sourceLocId, factoryUnitId },
          select: { name: true },
        });
        sourceLocationName = srcLoc?.name || null;
      }

      const snapshotDestinationId = type === 'ENTRADA' ? targetLocationId : destinationLocationId;
      if (snapshotDestinationId) {
        const dstLoc = await tx.location.findFirst({
          where: { id: snapshotDestinationId, factoryUnitId },
          select: { name: true },
        });
        destinationLocationName = dstLoc?.name || null;
      }

      // Registrar auditoria atômica em StockMovement
      const movement = await tx.stockMovement.create({
        data: {
          factoryUnitId,
          stockItemId: item.id,
          sector: item.sector,
          type,
          quantity,
          sourceLocationId: type === 'ENTRADA' ? null : targetLocationId || null,
          sourceStockItemId: type === 'ENTRADA' ? null : item.id,
          destinationStockItemId: type === 'TRANSFERENCIA' || type === 'ENTRADA' ? item.id : null,
          sourceSector: type === 'ENTRADA' ? null : item.sector,
          destinationSector: type === 'TRANSFERENCIA' || type === 'ENTRADA' ? item.sector : null,
          destinationLocationId: type === 'ENTRADA' ? targetLocationId : destinationLocationId || null,
          sourceLocationName,
          destinationLocationName,
          ...movementSnapshot(item),
          origem: origem || (type === 'ENTRADA' ? 'Entrada Adicional' : (type === 'REFUGO' ? 'Baixa por Refugo' : (type === 'TRANSFERENCIA' ? 'Transferência de Localização' : 'Consumo / Saída'))),
          reason: reason || '',
          operatorId: operatorId || null,
          operatorName: operatorName || 'Operador',
        },
      });

      return {
        success: true,
        movementId: movement.id,
        stockItemId: item.id,
        type: movement.type,
        quantity: movement.quantity,
      };
    });
  }

  /**
   * Consulta paginada do histórico completo de auditoria unificada (Corte + Multi-Setores)
   */
  async getHistory(filters: MovementHistoryFilterDTO, context: OperatorContext) {
    const { factoryUnitId } = context;
    const { sector, stockItemId, operatorId, type, page, limit } = filters;
    const skip = (page - 1) * limit;
    const stockWhere: Prisma.StockMovementWhereInput = {
      factoryUnitId,
      ...(sector ? {
        sector: (sector === 'DISTRIBUICAO' || (sector as string) === 'EXPEDICAO')
          ? { in: ['DISTRIBUICAO' as SectorType, 'EXPEDICAO' as SectorType] }
          : sector,
      } : {}),
      AND: [sectorAccessWhere(context), ...(stockItemId ? [{ OR: [{ stockItemId }, { sourceStockItemId: stockItemId }, { destinationStockItemId: stockItemId }] }] : [])],
      ...(operatorId ? {
        OR: [
          { operatorId: { contains: operatorId, mode: 'insensitive' } },
          { operatorName: { contains: operatorId, mode: 'insensitive' } },
        ],
      } : {}),
    };

    if (type) {
      if (type === 'SAIDA') {
        stockWhere.type = { in: ['SAIDA', 'CASAMENTO_PAR', 'SAIDA_REQUISICAO'] };
      } else {
        stockWhere.type = type;
      }
    }

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where: stockWhere }),
      prisma.stockMovement.findMany({
        where: stockWhere,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          stockItem: {
            select: {
              id: true,
              sector: true,
              code: true,
              name: true,
              pieceCode: true,
              productName: true,
              sku: true,
              sizeGrade: true,
              color: true,
              footSide: true,
              type: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      data: movements,
    };
  }
}
