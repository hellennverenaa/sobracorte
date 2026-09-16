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
      // 1. Se o setor for explicitamente CORTE, processar na tabela Material
      if (sector === 'CORTE') {
        const material = await tx.material.findFirst({
          where: { id: stockItemId, factoryUnitId },
          include: { locations: { include: { location: true } } },
        });

        if (!material) {
          throw new Error('Matéria-prima do Corte não encontrada.');
        }

        const targetLocationId = locationId || material.locations[0]?.locationId;

        if (type === 'ENTRADA') {
          if (!targetLocationId) {
            throw new Error('A localização é obrigatória para registrar a entrada.');
          }

          await tx.material.update({
            where: { id_factoryUnitId: { id: material.id, factoryUnitId } },
            data: { quantity: { increment: quantity } },
          });

          await tx.materialLocation.upsert({
            where: {
              materialId_locationId_factoryUnitId: {
                materialId: material.id,
                locationId: targetLocationId,
                factoryUnitId,
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
        } else if (type === 'SAIDA' || type === 'REFUGO') {
          if (!targetLocationId) {
            throw new Error('A localização de origem é obrigatória para registrar a baixa.');
          }

          // 1.1 Decremento atômico condicional na prateleira física
          const locUpdate = await tx.materialLocation.updateMany({
            where: {
              materialId: material.id,
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

          // 1.2 Decremento atômico condicional no saldo total
          const matUpdate = await tx.material.updateMany({
            where: {
              id: material.id,
              factoryUnitId,
              quantity: { gte: quantity },
            },
            data: {
              quantity: { decrement: quantity },
            },
          });

          if (matUpdate.count === 0) {
            throw new Error(`Saldo total insuficiente para realizar a baixa.`);
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

          // Debitar da prateleira de origem com decremento condicional
          const sourceUpdate = await tx.materialLocation.updateMany({
            where: {
              materialId: material.id,
              locationId: sourceLocId,
              factoryUnitId,
              quantity: { gte: quantity },
            },
            data: {
              quantity: { decrement: quantity },
            },
          });

          if (sourceUpdate.count === 0) {
            throw new Error('Saldo insuficiente na prateleira de origem para transferência.');
          }

          // Creditar na prateleira de destino via upsert
          await tx.materialLocation.upsert({
            where: {
              materialId_locationId_factoryUnitId: {
                materialId: material.id,
                locationId: destinationLocationId,
                factoryUnitId,
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

        const locForSnapId = destinationLocationId || locationId || material.locations[0]?.locationId;
        const locForSnap = locForSnapId ? await tx.location.findFirst({ where: { id: locForSnapId, factoryUnitId }, select: { name: true } }) : null;

        const movement = await tx.movement.create({
          data: {
            factoryUnitId,
            materialId: material.id,
            type: type.toLowerCase(),
            quantity,
            materialCode: material.code,
            materialName: material.name,
            materialCategory: material.type,
            materialUnit: material.unit,
            locationName: locForSnap?.name || null,
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
          targetSectorForMovement = destLocation.sector as SectorType;
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
          if (quantity >= Number(item.quantity) - 0.0001) {
            // Transferência total: atualiza o setor do próprio item
            await tx.stockItem.update({
              where: { id_factoryUnitId: { id: item.id, factoryUnitId } },
              data: {
                sector: destLocation.sector,
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

    const isCorteOnly = sector === 'CORTE';
    const isAllSectors = !sector || sector === ('TODOS' as any);

    const typeMapToLegacy: Record<string, string[]> = {
      ENTRADA: ['entrada'],
      SAIDA: ['saida', 'refugo'],
      REFUGO: ['refugo'],
      TRANSFERENCIA: ['transferencia'],
      CASAMENTO_PAR: ['never_match'],
      CRIACAO_CONFIGURACAO: ['never_match'],
      EDICAO_CONFIGURACAO: ['never_match'],
      EXCLUSAO_CONFIGURACAO: ['never_match'],
    };

    const typeMapToUnified: Record<string, string> = {
      entrada: 'ENTRADA',
      saida: 'SAIDA',
      refugo: 'REFUGO',
      transferencia: 'TRANSFERENCIA',
    };

    const formatLegacyMovement = (m: any) => {
      const primaryLoc = m.locationName || m.material?.locations?.[0]?.location?.name || null;
      return {
        id: `corte_${m.id}`,
        factoryUnitId: m.factoryUnitId,
        stockItemId: m.materialId,
        sector: 'CORTE' as SectorType,
        type: (typeMapToUnified[m.type?.toLowerCase()] || m.type?.toUpperCase() || 'ENTRADA') as any,
        quantity: m.quantity,
        sourceLocationId: null,
        destinationLocationId: null,
        sourceLocationName: null,
        destinationLocationName: primaryLoc,
        itemCode: m.material?.code || m.materialCode || null,
        itemName: m.material?.name || m.materialName || null,
        itemCategory: m.material?.type || m.materialCategory || 'CORTE',
        itemUnit: m.material?.unit || m.materialUnit || 'M²',
        origem: m.origem || 'Corte / Produção',
        reason: m.reason || m.origem || '',
        operatorId: m.operatorId,
        operatorName: m.operatorName || 'Operador Corte',
        createdAt: m.createdAt,
        updatedAt: m.createdAt,
        stockItem: m.material ? {
          id: m.material.id,
          sector: 'CORTE' as SectorType,
          code: m.material.code,
          name: m.material.name,
          pieceCode: null,
          productName: m.material.name,
          sku: m.material.code,
          sizeGrade: null,
          color: null,
          footSide: null,
          type: m.material.type,
        } : (m.materialCode || m.materialName ? {
          id: m.materialId || 0,
          sector: 'CORTE' as SectorType,
          code: m.materialCode || null,
          name: m.materialName || null,
          pieceCode: null,
          productName: m.materialName || null,
          sku: m.materialCode || null,
          sizeGrade: null,
          color: null,
          footSide: null,
          type: m.materialCategory || 'CORTE',
        } : null),
      };
    };

    if (isCorteOnly) {
      const legacyWhere: Prisma.MovementWhereInput = {
        factoryUnitId,
        ...(stockItemId ? { materialId: stockItemId } : {}),
        ...(operatorId ? {
          OR: [
            { operatorId: { contains: operatorId, mode: 'insensitive' } },
            { operatorName: { contains: operatorId, mode: 'insensitive' } },
          ],
        } : {}),
      };

      if (type) {
        const mappedTypes = typeMapToLegacy[type];
        if (mappedTypes) {
          legacyWhere.type = mappedTypes.length === 1 ? mappedTypes[0] : { in: mappedTypes };
        } else {
          legacyWhere.type = type.toLowerCase();
        }
      }

      const [total, movements] = await Promise.all([
        prisma.movement.count({ where: legacyWhere }),
        prisma.movement.findMany({
          where: legacyWhere,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            material: {
              include: {
                locations: {
                  include: { location: true },
                },
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
        data: movements.map(formatLegacyMovement),
      };
    }

    if (isAllSectors) {
      const stockWhere: Prisma.StockMovementWhereInput = {
        factoryUnitId,
        ...(stockItemId ? { stockItemId } : {}),
        ...(operatorId ? {
          OR: [
            { operatorId: { contains: operatorId, mode: 'insensitive' } },
            { operatorName: { contains: operatorId, mode: 'insensitive' } },
          ],
        } : {}),
      };

      const legacyWhere: Prisma.MovementWhereInput = {
        factoryUnitId,
        ...(stockItemId ? { materialId: stockItemId } : {}),
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

        const mappedTypes = typeMapToLegacy[type];
        if (mappedTypes) {
          legacyWhere.type = mappedTypes.length === 1 ? mappedTypes[0] : { in: mappedTypes };
        } else {
          legacyWhere.type = type.toLowerCase();
        }
      }

      const fetchWindow = skip + limit;

      const [stockCount, legacyCount, stockMovements, legacyMovements] = await Promise.all([
        prisma.stockMovement.count({ where: stockWhere }),
        prisma.movement.count({ where: legacyWhere }),
        prisma.stockMovement.findMany({
          where: stockWhere,
          take: fetchWindow,
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
        prisma.movement.findMany({
          where: legacyWhere,
          take: fetchWindow,
          orderBy: { createdAt: 'desc' },
          include: {
            material: {
              include: {
                locations: {
                  include: { location: true },
                },
              },
            },
          },
        }),
      ]);

      const total = stockCount + legacyCount;
      const combined = [
        ...stockMovements.map((s) => ({ ...s, id: s.id })),
        ...legacyMovements.map(formatLegacyMovement),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const paginatedData = combined.slice(skip, skip + limit);

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        data: paginatedData,
      };
    }

    // Setores individuais não-Corte (Apoio, Pré-Fabricado, Distribuição, Montagem, Configurações)
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
