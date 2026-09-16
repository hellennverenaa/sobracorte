import { prisma } from '../prisma';
import { CreateStockMovementDTO, MovementHistoryFilterDTO, OperatorContext } from '../types/stock.dto';
import { Prisma, SectorType } from '../generated/prisma';
import { DuplicateStockItemError, findStockIdentityMatches, lockStockIdentityWrites, normalizeStockSector, stockIdentity } from './stockIdentity';
import { normalizeUnit } from '../utils/unitHelper';

export class StockMovementService {
  /**
   * Registra uma movimentação de estoque (Saída, Refugo, Transferência) com auditoria
   */
  async createMovement(dto: CreateStockMovementDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;
    const { stockItemId, sector, type, quantity, locationId, destinationLocationId, origem, reason } = dto;

    return await prisma.$transaction(async (tx) => {
      if (type === 'TRANSFERENCIA') await lockStockIdentityWrites(tx, factoryUnitId);
      // Todos os setores, inclusive CORTE, usam o modelo canônico.
      const item = await tx.stockItem.findFirst({
        where: { id: stockItemId, factoryUnitId },
        include: { locations: { include: { location: true } } },
      });

      if (!item) {
        throw new Error('Item de estoque ou matéria-prima não encontrado.');
      }

      if (item.sector !== 'CORTE' && !Number.isInteger(quantity)) {
        throw new Error(`A quantidade para o setor ${item.sector} deve ser um número inteiro (sem decimais).`);
      }

      const targetLocationId = locationId || item.locations[0]?.locationId;

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

      let isCrossSector = false;
      let targetSectorForMovement: SectorType = item.sector;
      let effectiveStockItemId = item.id;

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

        const normDestSector = destLocation.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : destLocation.sector;
        const normItemSector = item.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : item.sector;
        isCrossSector = Boolean(destLocation.sector && normDestSector !== normItemSector);

        if (isCrossSector) {
          if (context.role !== 'admin') {
            throw new Error('Acesso Negado: Transferência entre setores diferentes é permitida exclusivamente para o Administrador Master.');
          }
          targetSectorForMovement = normalizeStockSector(destLocation.sector!) as SectorType;
        }

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

        // Se for transferência intersetorial por Admin Master:
        if (isCrossSector && destLocation.sector) {
          const destinationData = { ...item, sector: targetSectorForMovement };
          const identity = stockIdentity(destinationData);
          const required = targetSectorForMovement === 'CORTE' ? ['code', 'name', 'type']
            : targetSectorForMovement === 'APOIO' ? ['pieceCode', 'description', 'materialColor', 'sizeGrade']
            : targetSectorForMovement === 'CONSUMO' ? ['productName'] : ['sku', 'sizeGrade'];
          if (required.some(field => !identity[field])) {
            throw new Error('O item não possui os campos de identificação necessários para o setor de destino.');
          }
          const matches = await findStockIdentityMatches(tx, factoryUnitId, destinationData);
          if (matches.length > 1) {
            throw new DuplicateStockItemError('Existem itens duplicados no setor de destino. Regularize os cadastros antes da transferência.');
          }
          const existingDestination = matches[0];
          if (existingDestination) {
            if (normalizeUnit(existingDestination.unit || undefined, targetSectorForMovement) !== normalizeUnit(item.unit || undefined, targetSectorForMovement)) {
              throw new Error('O item equivalente no destino possui uma unidade de medida incompatível.');
            }
            const debit = await tx.stockItem.updateMany({
              where: { id: item.id, factoryUnitId, quantity: { gte: quantity } },
              data: { quantity: { decrement: quantity } },
            });
            if (!debit.count) throw new Error('Saldo total insuficiente para realizar a transferência.');
            await tx.stockItem.update({
              where: { id_factoryUnitId: { id: existingDestination.id, factoryUnitId } },
              data: { quantity: { increment: quantity } },
            });
            await tx.stockItemLocation.upsert({
              where: { stockItemId_locationId_factoryUnitId: { stockItemId: existingDestination.id, locationId: destinationLocationId, factoryUnitId } },
              update: { quantity: { increment: quantity } },
              create: { stockItemId: existingDestination.id, locationId: destinationLocationId, factoryUnitId, quantity },
            });
            effectiveStockItemId = existingDestination.id;
          } else if (quantity >= Number(item.quantity) - 0.0001) {
            // Transferência total: atualiza o setor do próprio item
            await tx.stockItem.update({
              where: { id_factoryUnitId: { id: item.id, factoryUnitId } },
              data: {
                sector: targetSectorForMovement,
                observation: `Transferido do setor ${item.sector} para ${destLocation.sector}. ${reason || ''}`.trim(),
              },
            });
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
          } else {
            // Transferência parcial: subtrai saldo do item de origem e cria novo StockItem no setor de destino
            const itemDecUpdate = await tx.stockItem.updateMany({
              where: {
                id: item.id,
                factoryUnitId,
                quantity: { gte: quantity },
              },
              data: {
                quantity: { decrement: quantity },
              },
            });

            if (itemDecUpdate.count === 0) {
              throw new Error('Saldo total insuficiente para realizar a transferência parcial.');
            }

            const newStockItem = await tx.stockItem.create({
              data: {
                factoryUnitId,
                sector: targetSectorForMovement,
                quantity,
                code: item.code,
                name: item.name,
                unit: item.unit,
                type: item.type,
                pieceCode: item.pieceCode,
                description: item.description,
                materialColor: item.materialColor,
                productName: item.productName,
                sku: item.sku,
                color: item.color,
                sizeGrade: item.sizeGrade,
                footSide: item.footSide,
                componentType: item.componentType,
                observation: `Transferido do setor ${item.sector}. ${reason || ''}`.trim(),
              },
            });

            await tx.stockItemLocation.create({
              data: {
                stockItemId: newStockItem.id,
                locationId: destinationLocationId,
                factoryUnitId,
                quantity,
              },
            });

            effectiveStockItemId = newStockItem.id;
          }
        } else {
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
      }

      // Buscar nomes das localizações para snapshot imutável
      let sourceLocationName: string | null = null;
      let destinationLocationName: string | null = null;

      const sourceLocId = locationId || (type === 'TRANSFERENCIA' ? (item.locations[0]?.locationId) : null);
      if (sourceLocId) {
        const srcLoc = await tx.location.findFirst({
          where: { id: sourceLocId, factoryUnitId },
          select: { name: true },
        });
        sourceLocationName = srcLoc?.name || null;
      }

      if (destinationLocationId) {
        const dstLoc = await tx.location.findFirst({
          where: { id: destinationLocationId, factoryUnitId },
          select: { name: true },
        });
        destinationLocationName = dstLoc?.name || null;
      }

      // Registrar auditoria atômica em StockMovement
      const movement = await tx.stockMovement.create({
        data: {
          factoryUnitId,
          stockItemId: effectiveStockItemId,
          sector: isCrossSector ? targetSectorForMovement : item.sector,
          type,
          quantity,
          sourceLocationId: locationId || null,
          destinationLocationId: destinationLocationId || null,
          sourceLocationName,
          destinationLocationName,
          itemCode: item.sku || item.code || item.pieceCode || null,
          itemName: item.description || item.name || item.productName || null,
          itemCategory: item.type || item.componentType || null,
          itemUnit: item.unit || null,
          origem: isCrossSector
            ? `Transferência Intersetorial (${item.sector} ➔ ${targetSectorForMovement}) autorizada por Admin Master`
            : (origem || (type === 'ENTRADA' ? 'Entrada Adicional' : (type === 'REFUGO' ? 'Baixa por Refugo' : (type === 'TRANSFERENCIA' ? 'Transferência de Localização' : 'Consumo / Saída')))),
          reason: reason || (isCrossSector ? 'Remanejamento intersetorial autorizado por Admin Master' : ''),
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
      ...(stockItemId ? { stockItemId } : {}),
      ...(operatorId ? {
        OR: [
          { operatorId: { contains: operatorId, mode: 'insensitive' } },
          { operatorName: { contains: operatorId, mode: 'insensitive' } },
        ],
      } : {}),
    };

    if (type) {
      if (type === 'SAIDA') {
        stockWhere.type = { in: ['SAIDA', 'CASAMENTO_PAR'] };
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
