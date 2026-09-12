import { prisma } from '../prisma';
import { CreateStockMovementDTO, MovementHistoryFilterDTO, OperatorContext } from '../types/stock.dto';
import { Prisma, SectorType } from '../generated/prisma';

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

        const matQty = Number(material.quantity);
        if ((type === 'SAIDA' || type === 'REFUGO') && matQty < quantity - 0.0001) {
          throw new Error(`Saldo insuficiente. Saldo disponível: ${matQty}`);
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
                  quantity: Math.max(0, Number(locLink.quantity || 0) - quantity),
                },
              });
            }
          }
        } else if (type === 'TRANSFERENCIA') {
          if (!destinationLocationId) {
            throw new Error('A localização de destino é obrigatória para transferências.');
          }

          const destLocation = await tx.location.findFirst({
            where: { id: destinationLocationId, factoryUnitId },
          });
          if (!destLocation) {
            throw new Error('A localização de destino não foi encontrada nesta unidade fabril.');
          }

          if (destLocation.sector && destLocation.sector !== 'CORTE') {
            if (context.role !== 'admin') {
              throw new Error('Acesso Negado: Transferência entre setores diferentes é permitida exclusivamente para o Administrador Master.');
            }
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

        // Auditoria em Movement (histórico oficial de matérias-primas do Corte)
        const isCrossSectorMat = type === 'TRANSFERENCIA' && destinationLocationId ? await (async () => {
          const dl = await tx.location.findFirst({ where: { id: destinationLocationId, factoryUnitId } });
          return Boolean(dl?.sector && dl.sector !== 'CORTE');
        })() : false;

        const movement = await tx.movement.create({
          data: {
            factoryUnitId,
            materialId: material.id,
            type: type.toLowerCase(),
            quantity,
            origem: isCrossSectorMat
              ? `Transferência Intersetorial (CORTE) autorizada por Admin Master`
              : (origem || (type === 'ENTRADA' ? 'Entrada Adicional' : (type === 'REFUGO' ? 'Baixa por Refugo' : (type === 'TRANSFERENCIA' ? 'Transferência de Localização' : 'Consumo / Saída')))),
            reason: reason || (isCrossSectorMat ? 'Remanejamento intersetorial autorizado por Admin Master' : ''),
            operatorId: operatorId || null,
            operatorName: operatorName || 'Operador',
          },
        });

        return {
          success: true,
          movementId: movement.id,
          materialId: material.id,
          type: movement.type.toUpperCase(),
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

      if (item.sector !== 'CORTE' && !Number.isInteger(quantity)) {
        throw new Error(`A quantidade para o setor ${item.sector} deve ser um número inteiro (sem decimais).`);
      }

      const itemQty = Number(item.quantity);
      if ((type === 'SAIDA' || type === 'REFUGO') && itemQty < quantity - 0.0001) {
        throw new Error(`Saldo insuficiente. Saldo disponível: ${itemQty}`);
      }

      // Atualizar saldo do StockItem
      if (type === 'ENTRADA') {
        const newQty = Number(item.quantity) + quantity;
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
        const newQty = Math.max(0, Number(item.quantity) - quantity);
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
                quantity: Math.max(0, Number(locLink.quantity || 0) - quantity),
              },
            });
          }
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
          targetSectorForMovement = destLocation.sector as SectorType;
        }

        const sourceLocLink = item.locations.find((l) => l.locationId === sourceLocId);
        const sourceLocQty = Number(sourceLocLink?.quantity || 0);
        if (!sourceLocLink || sourceLocQty < quantity - 0.0001) {
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
            quantity: Math.max(0, sourceLocQty - quantity),
          },
        });

        // Se for transferência intersetorial por Admin Master:
        if (isCrossSector && destLocation.sector) {
          if (quantity >= Number(item.quantity) - 0.0001) {
            // Transferência total: atualiza o setor do próprio item
            await tx.stockItem.update({
              where: { id: item.id },
              data: {
                sector: destLocation.sector,
                observation: `Transferido do setor ${item.sector} para ${destLocation.sector}. ${reason || ''}`.trim(),
              },
            });
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
          } else {
            // Transferência parcial: subtrai saldo do item de origem e cria novo StockItem no setor de destino
            await tx.stockItem.update({
              where: { id: item.id },
              data: {
                quantity: { decrement: quantity },
              },
            });

            const newStockItem = await tx.stockItem.create({
              data: {
                factoryUnitId,
                sector: destLocation.sector,
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
   * Consulta paginada do histórico completo de auditoria
   */
  async getHistory(filters: MovementHistoryFilterDTO, context: OperatorContext) {
    const { factoryUnitId } = context;
    const { sector, stockItemId, operatorId, type, page, limit } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {
      factoryUnitId,
      ...(sector ? {
        sector: (sector === 'DISTRIBUICAO' || (sector as string) === 'EXPEDICAO')
          ? { in: ['DISTRIBUICAO' as SectorType, 'EXPEDICAO' as SectorType] }
          : sector
      } : {}),
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
      totalPages: Math.ceil(total / limit),
      data: movements,
    };
  }
}
