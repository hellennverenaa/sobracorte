import { prisma } from '../prisma';
import { CreateStockMovementDTO, MovementHistoryFilterDTO, OperatorContext } from '../types/stock.dto';
import { Prisma } from '../generated/prisma';

export class StockMovementService {
  /**
   * Registra uma movimentação de estoque (Saída, Refugo, Transferência) com auditoria
   */
  async createMovement(dto: CreateStockMovementDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;
    const { stockItemId, type, quantity, locationId, destinationLocationId, origem, reason } = dto;

    return await prisma.$transaction(async (tx) => {
      // 1. Buscar o item de estoque com validação de tenant
      const item = await tx.stockItem.findFirst({
        where: { id: stockItemId, factoryUnitId },
        include: { locations: true },
      });

      if (!item) {
        throw new Error('Item de estoque não encontrado.');
      }

      if ((type === 'SAIDA' || type === 'REFUGO') && item.quantity < quantity) {
        throw new Error(`Saldo insuficiente. Saldo disponível: ${item.quantity}`);
      }

      // 2. Atualizar saldo do item
      if (type === 'SAIDA' || type === 'REFUGO') {
        const newQty = item.quantity - quantity;
        await tx.stockItem.update({
          where: { id: item.id },
          data: { quantity: newQty },
        });

        // Atualizar saldo na localização de origem
        const targetLocationId = locationId || (item.locations[0]?.locationId);
        if (targetLocationId) {
          const locLink = item.locations.find((l) => l.locationId === targetLocationId);
          if (locLink) {
            await tx.stockItemLocation.update({
              where: {
                stockItemId_locationId: {
                  stockItemId: item.id,
                  locationId: targetLocationId,
                },
              },
              data: {
                quantity: Math.max(0, (locLink.quantity || 0) - quantity),
              },
            });
          }
        }
      } else if (type === 'TRANSFERENCIA') {
        if (!destinationLocationId) {
          throw new Error('A localização de destino é obrigatória para transferências.');
        }

        const sourceLocId = locationId || item.locations[0]?.locationId;
        if (!sourceLocId) {
          throw new Error('A localização de origem não foi identificada.');
        }

        if (sourceLocId === destinationLocationId) {
          throw new Error('A localização de origem e destino devem ser diferentes.');
        }

        const sourceLocLink = item.locations.find((l) => l.locationId === sourceLocId);
        if (!sourceLocLink || (sourceLocLink.quantity || 0) < quantity) {
          throw new Error('Saldo insuficiente na prateleira de origem para transferência.');
        }

        // Debitar da origem
        await tx.stockItemLocation.update({
          where: {
            stockItemId_locationId: {
              stockItemId: item.id,
              locationId: sourceLocId,
            },
          },
          data: {
            quantity: (sourceLocLink.quantity || 0) - quantity,
          },
        });

        // Creditar no destino
        await tx.stockItemLocation.upsert({
          where: {
            stockItemId_locationId: {
              stockItemId: item.id,
              locationId: destinationLocationId,
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

      // 3. Registrar auditoria atômica em StockMovement
      const movement = await tx.stockMovement.create({
        data: {
          factoryUnitId,
          stockItemId: item.id,
          sector: item.sector,
          type,
          quantity,
          sourceLocationId: locationId || null,
          destinationLocationId: destinationLocationId || null,
          origem: origem || (type === 'REFUGO' ? 'Baixa por Refugo' : 'Consumo / Saída'),
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
   * Consulta paginada do histórico completo de auditoria
   */
  async getHistory(filters: MovementHistoryFilterDTO, context: OperatorContext) {
    const { factoryUnitId } = context;
    const { sector, stockItemId, operatorId, type, page, limit } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {
      factoryUnitId,
      ...(sector ? { sector } : {}),
      ...(stockItemId ? { stockItemId } : {}),
      ...(operatorId ? { operatorId } : {}),
      ...(type ? { type } : {}),
    };

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: movements,
    };
  }
}
