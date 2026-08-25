import { prisma } from '../prisma';
import { BatchCreateStockItemDTO, OperatorContext, StockItemUnionDTO } from '../types/stock.dto';
import { SectorType, ComponentType } from '../generated/prisma';

export class StockItemService {
  /**
   * Cadastro em lote com transação ACID e auditoria obrigatória
   */
  async createBatch(dto: BatchCreateStockItemDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;

    return await prisma.$transaction(async (tx) => {
      const createdItems = [];

      for (const item of dto.items) {
        const locationName = item.location.trim().toUpperCase();

        // 1. Localizar ou criar a prateleira/localização
        let loc = await tx.location.findUnique({
          where: {
            factoryUnitId_name: {
              factoryUnitId,
              name: locationName,
            },
          },
        });

        if (!loc) {
          loc = await tx.location.create({
            data: {
              name: locationName,
              factoryUnitId,
            },
          });
        }

        // 2. Preparar campos de domínio específicos por setor
        const baseData = {
          factoryUnitId,
          sector: item.sector as SectorType,
          quantity: item.quantity,
          observation: item.observation || '',
        };

        let sectorSpecificData = {};

        switch (item.sector) {
          case 'CORTE':
            sectorSpecificData = {
              componentType: 'MATERIA_PRIMA' as ComponentType,
              code: item.code.trim().toUpperCase(),
              name: item.name.trim().toUpperCase(),
              unit: item.unit.trim().toUpperCase(),
              type: item.type.trim().toUpperCase(),
              minStock: item.minStock,
            };
            break;

          case 'APOIO':
            sectorSpecificData = {
              componentType: 'PECA_CORTADA' as ComponentType,
              pieceCode: item.pieceCode.trim().toUpperCase(),
              description: item.description.trim().toUpperCase(),
              materialColor: item.materialColor.trim().toUpperCase(),
              sizeGrade: item.sizeGrade.trim().toUpperCase(),
            };
            break;

          case 'PRE_FABRICADO':
            sectorSpecificData = {
              componentType: 'SOLADO' as ComponentType,
              productName: item.productName.trim().toUpperCase(),
              color: item.color.trim().toUpperCase(),
              sizeGrade: item.sizeGrade.trim().toUpperCase(),
            };
            break;

          case 'EXPEDICAO':
            sectorSpecificData = {
              componentType: 'CABEDAL' as ComponentType,
              sku: item.sku.trim().toUpperCase(),
              color: item.color.trim().toUpperCase(),
              sizeGrade: item.sizeGrade.trim().toUpperCase(),
            };
            break;

          case 'MONTAGEM':
            sectorSpecificData = {
              componentType: 'PE_PRONTO' as ComponentType,
              sku: item.sku.trim().toUpperCase(),
              sizeGrade: item.sizeGrade.trim().toUpperCase(),
              footSide: item.footSide,
            };
            break;
        }

        // 3. Criar o StockItem
        const stockItem = await tx.stockItem.create({
          data: {
            ...baseData,
            ...sectorSpecificData,
          },
        });

        // 4. Criar vínculo com a Localização / Prateleira
        await tx.stockItemLocation.create({
          data: {
            stockItemId: stockItem.id,
            locationId: loc.id,
            factoryUnitId,
            quantity: item.quantity,
          },
        });

        // 5. Auditoria de Entrada em StockMovement
        await tx.stockMovement.create({
          data: {
            factoryUnitId,
            stockItemId: stockItem.id,
            sector: item.sector as SectorType,
            type: 'ENTRADA',
            quantity: item.quantity,
            destinationLocationId: loc.id,
            origem: 'Saldo Inicial / Entrada no Setor',
            reason: item.observation || 'Entrada em lote via terminal de chão de fábrica',
            operatorId: operatorId || null,
            operatorName: operatorName || 'Sistema / Operador',
          },
        });

        createdItems.push({
          id: stockItem.id,
          sector: stockItem.sector,
          quantity: stockItem.quantity,
          location: loc.name,
        });
      }

      return {
        success: true,
        insertedCount: createdItems.length,
        items: createdItems,
      };
    });
  }

  /**
   * Busca consolidada Round-Trip Único para todos os 5 setores
   */
  async searchUnified(
    params: { q?: string; sector?: SectorType; page?: number; limit?: number },
    context: OperatorContext
  ) {
    const { factoryUnitId } = context;
    const { q, sector, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const searchTerm = q ? q.trim() : '';

    const buildSectorWhere = (sec: SectorType) => {
      const base: any = { factoryUnitId, sector: sec };
      if (!searchTerm) return base;

      switch (sec) {
        case 'CORTE':
          return {
            ...base,
            OR: [
              { code: { contains: searchTerm, mode: 'insensitive' } },
              { name: { contains: searchTerm, mode: 'insensitive' } },
              { type: { contains: searchTerm, mode: 'insensitive' } },
            ],
          };
        case 'APOIO':
          return {
            ...base,
            OR: [
              { pieceCode: { contains: searchTerm, mode: 'insensitive' } },
              { description: { contains: searchTerm, mode: 'insensitive' } },
              { materialColor: { contains: searchTerm, mode: 'insensitive' } },
              { sizeGrade: { contains: searchTerm, mode: 'insensitive' } },
            ],
          };
        case 'PRE_FABRICADO':
          return {
            ...base,
            OR: [
              { productName: { contains: searchTerm, mode: 'insensitive' } },
              { color: { contains: searchTerm, mode: 'insensitive' } },
              { sizeGrade: { contains: searchTerm, mode: 'insensitive' } },
            ],
          };
        case 'EXPEDICAO':
          return {
            ...base,
            OR: [
              { sku: { contains: searchTerm, mode: 'insensitive' } },
              { color: { contains: searchTerm, mode: 'insensitive' } },
              { sizeGrade: { contains: searchTerm, mode: 'insensitive' } },
            ],
          };
        case 'MONTAGEM':
          return {
            ...base,
            OR: [
              { sku: { contains: searchTerm, mode: 'insensitive' } },
              { sizeGrade: { contains: searchTerm, mode: 'insensitive' } },
            ],
          };
      }
    };

    // Execução paralela de buscas e contagens por setor
    const [
      corteCount,
      corteItems,
      apoioCount,
      apoioItems,
      preFabCount,
      preFabItems,
      expedicaoCount,
      expedicaoItems,
      montagemCount,
      montagemItems,
      locations,
    ] = await Promise.all([
      prisma.stockItem.count({ where: buildSectorWhere('CORTE') }),
      (!sector || sector === 'CORTE')
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('CORTE'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('APOIO') }),
      (!sector || sector === 'APOIO')
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('APOIO'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('PRE_FABRICADO') }),
      (!sector || sector === 'PRE_FABRICADO')
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('PRE_FABRICADO'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('EXPEDICAO') }),
      (!sector || sector === 'EXPEDICAO')
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('EXPEDICAO'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('MONTAGEM') }),
      (!sector || sector === 'MONTAGEM')
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('MONTAGEM'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      prisma.location.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const formatLocations = (items: any[]) =>
      items.map((item) => {
        const activeLocations = item.locations
          ? item.locations.filter((l: any) => Number(l.quantity) > 0)
          : [];
        const locationStr =
          activeLocations.length > 0
            ? activeLocations.map((l: any) => l.location.name).join(' | ')
            : 'Não definido';
        return {
          ...item,
          locationDisplay: locationStr,
        };
      });

    return {
      metrics: {
        totalItems:
          corteCount + apoioCount + preFabCount + expedicaoCount + montagemCount,
        totalCorte: corteCount,
        totalApoio: apoioCount,
        totalPreFabricado: preFabCount,
        totalExpedicao: expedicaoCount,
        totalMontagem: montagemCount,
      },
      sectors: {
        corte: { total: corteCount, data: formatLocations(corteItems) },
        apoio: { total: apoioCount, data: formatLocations(apoioItems) },
        preFabricado: { total: preFabCount, data: formatLocations(preFabItems) },
        expedicao: { total: expedicaoCount, data: formatLocations(expedicaoItems) },
        montagem: { total: montagemCount, data: formatLocations(montagemItems) },
      },
      filterOptions: {
        locations: locations.map((l) => l.name),
      },
    };
  }
}
