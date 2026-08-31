import { prisma } from '../prisma';
import { CreateStockMovementDTO, MovementHistoryFilterDTO, OperatorContext } from '../types/stock.dto';
import { Prisma } from '../generated/prisma';

export class StockMovementService {
  /**
   * Registra uma movimentação de estoque (Saída, Refugo, Transferência) com auditoria
   */
  async createMovement(dto: CreateStockMovementDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;
    const { stockItemId, sector, type, quantity, locationId, destinationLocationId, origem, reason } = dto;

    return await prisma.$transaction(async (tx) => {
      // 1. Se o setor for explicitamente CORTE, buscar na tabela Material
      if (sector === 'CORTE') {
        const material = await tx.material.findFirst({
          where: { id: stockItemId, factoryUnitId },
          include: { locations: true },
        });

        if (!material) {
          throw new Error('Matéria-prima do Corte não encontrada.');
        }

        if ((type === 'SAIDA' || type === 'REFUGO') && material.quantity < quantity) {
          throw new Error(`Saldo insuficiente. Saldo disponível: ${material.quantity}`);
        }

        if (type === 'ENTRADA') {
          await tx.material.update({
            where: { id: material.id },
            data: { quantity: { increment: quantity } },
          });

          const targetLocationId = locationId || (material.locations[0]?.locationId);
          if (targetLocationId) {
            await tx.materialLocation.upsert({
              where: {
                materialId_locationId: {
                  materialId: material.id,
                  locationId: targetLocationId,
                },
              },
              update: {
                quantity: { increment: quantity },
              },
              create: {
                materialId: material.id,
                locationId: targetLocationId,
                factoryUnitId,
                quantity,
              },
            });
          }
        } else if (type === 'SAIDA' || type === 'REFUGO') {
          await tx.material.update({
            where: { id: material.id },
            data: { quantity: { decrement: quantity } },
          });

          const targetLocationId = locationId || (material.locations[0]?.locationId);
          if (targetLocationId) {
            const locLink = material.locations.find((l) => l.locationId === targetLocationId);
            if (locLink) {
              await tx.materialLocation.update({
                where: {
                  materialId_locationId: {
                    materialId: material.id,
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

          const sourceLocId = locationId || material.locations[0]?.locationId;
          if (!sourceLocId) {
            throw new Error('A localização de origem não foi identificada.');
          }

          if (sourceLocId === destinationLocationId) {
            throw new Error('A localização de origem e destino devem ser diferentes.');
          }

          const sourceLocLink = material.locations.find((l) => l.locationId === sourceLocId);
          if (!sourceLocLink || (sourceLocLink.quantity || 0) < quantity) {
            throw new Error('Saldo insuficiente na prateleira de origem para transferência.');
          }

          // Debitar da origem
          await tx.materialLocation.update({
            where: {
              materialId_locationId: {
                materialId: material.id,
                locationId: sourceLocId,
              },
            },
            data: {
              quantity: (sourceLocLink.quantity || 0) - quantity,
            },
          });

          // Creditar no destino
          await tx.materialLocation.upsert({
            where: {
              materialId_locationId: {
                materialId: material.id,
                locationId: destinationLocationId,
              },
            },
            update: {
              quantity: { increment: quantity },
            },
            create: {
              materialId: material.id,
              locationId: destinationLocationId,
              factoryUnitId,
              quantity,
            },
          });
        }

        // Auditoria em StockMovement
        const movement = await tx.stockMovement.create({
          data: {
            factoryUnitId,
            sector: 'CORTE',
            type,
            quantity,
            sourceLocationId: locationId || null,
            destinationLocationId: destinationLocationId || null,
            origem: origem || (type === 'ENTRADA' ? 'Entrada Adicional' : (type === 'REFUGO' ? 'Baixa por Refugo' : (type === 'TRANSFERENCIA' ? 'Transferência de Localização' : 'Consumo / Saída'))),
            reason: reason || '',
            operatorId: operatorId || null,
            operatorName: operatorName || 'Operador',
          },
        });

        return {
          success: true,
          movementId: movement.id,
          materialId: material.id,
          type: movement.type,
          quantity: movement.quantity,
        };
      }

      // 2. Se não for Material, busca na tabela StockItem (Demais setores)
      const item = await tx.stockItem.findFirst({
        where: { id: stockItemId, factoryUnitId },
        include: { locations: true },
      });

      if (!item) {
        throw new Error('Item de estoque ou matéria-prima não encontrado.');
      }

      if ((type === 'SAIDA' || type === 'REFUGO') && item.quantity < quantity) {
        throw new Error(`Saldo insuficiente. Saldo disponível: ${item.quantity}`);
      }

      // Atualizar saldo do StockItem
      if (type === 'ENTRADA') {
        const newQty = item.quantity + quantity;
        await tx.stockItem.update({
          where: { id: item.id },
          data: { quantity: newQty },
        });

        const targetLocationId = locationId || (item.locations[0]?.locationId);
        if (targetLocationId) {
          await tx.stockItemLocation.upsert({
            where: {
              stockItemId_locationId: {
                stockItemId: item.id,
                locationId: targetLocationId,
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
        }
      } else if (type === 'SAIDA' || type === 'REFUGO') {
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

      // Registrar auditoria atômica em StockMovement
      const movement = await tx.stockMovement.create({
        data: {
          factoryUnitId,
          stockItemId: item.id,
          sector: item.sector,
          type,
          quantity,
          sourceLocationId: locationId || null,
          destinationLocationId: destinationLocationId || null,
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
    };

    if (type) {
      if (type === 'SAIDA') {
        where.type = { in: ['SAIDA', 'CASAMENTO_PAR'] };
      } else {
        where.type = type;
      }
    }

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
