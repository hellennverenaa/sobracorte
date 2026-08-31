import { prisma } from '../prisma';
import { BatchCreateStockItemDTO, OperatorContext, StockItemUnionDTO } from '../types/stock.dto';
import { SectorType, ComponentType } from '../generated/prisma';

export class StockItemService {
  /**
   * Cadastro em lote com transação ACID e persistência oficial:
   * - Setor CORTE -> grava diretamente na tabela Material
   * - Outros Setores -> grava na tabela StockItem
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

        if (item.sector === 'CORTE') {
          // 📦 SETOR CORTE: Persistência oficial na tabela Material (4.000+ matérias-primas)
          const materialCode = item.code.trim().toUpperCase();
          const existingMaterial = await tx.material.findUnique({
            where: {
              factoryUnitId_code: {
                factoryUnitId,
                code: materialCode,
              },
            },
          });

          let materialRecord;
          if (existingMaterial) {
            materialRecord = await tx.material.update({
              where: { id: existingMaterial.id },
              data: {
                quantity: { increment: item.quantity },
                name: item.name ? item.name.trim().toUpperCase() : existingMaterial.name,
                unit: item.unit ? item.unit.trim().toUpperCase() : existingMaterial.unit,
                type: item.type ? item.type.trim().toUpperCase() : existingMaterial.type,
                observation: item.observation || existingMaterial.observation,
                minStock: item.minStock !== undefined ? item.minStock : existingMaterial.minStock,
              },
            });
          } else {
            materialRecord = await tx.material.create({
              data: {
                factoryUnitId,
                code: materialCode,
                name: item.name.trim().toUpperCase(),
                quantity: item.quantity,
                unit: (item.unit || 'UN').trim().toUpperCase(),
                type: (item.type || 'GERAL').trim().toUpperCase(),
                observation: item.observation || '',
                minStock: item.minStock || 0,
              },
            });
          }

          // Upsert MaterialLocation
          await tx.materialLocation.upsert({
            where: {
              materialId_locationId: {
                materialId: materialRecord.id,
                locationId: loc.id,
              },
            },
            update: {
              quantity: { increment: item.quantity },
            },
            create: {
              materialId: materialRecord.id,
              locationId: loc.id,
              factoryUnitId,
              quantity: item.quantity,
            },
          });

          // Auditoria em StockMovement
          await tx.stockMovement.create({
            data: {
              factoryUnitId,
              sector: 'CORTE',
              type: 'ENTRADA',
              quantity: item.quantity,
              destinationLocationId: loc.id,
              origem: 'Saldo Inicial / Entrada no Setor',
              reason: item.observation || 'Entrada em lote no Estoque de Corte',
              operatorId: operatorId || null,
              operatorName: operatorName || 'Sistema / Operador',
            },
          });

          createdItems.push({
            id: materialRecord.id,
            sector: 'CORTE',
            quantity: materialRecord.quantity,
            location: loc.name,
          });
        } else {
          // 📦 DEMAIS SETORES: Persistência na tabela StockItem
          const baseData = {
            factoryUnitId,
            sector: item.sector as SectorType,
            quantity: item.quantity,
            observation: item.observation || '',
          };

          let sectorSpecificData = {};

          switch (item.sector) {
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
                footSide: item.footSide || null,
              };
              break;

            case 'EXPEDICAO':
              sectorSpecificData = {
                componentType: 'CABEDAL' as ComponentType,
                sku: item.sku.trim().toUpperCase(),
                color: item.color.trim().toUpperCase(),
                sizeGrade: item.sizeGrade.trim().toUpperCase(),
                footSide: item.footSide || null,
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

          const stockItem = await tx.stockItem.create({
            data: {
              ...baseData,
              ...sectorSpecificData,
            },
          });

          await tx.stockItemLocation.create({
            data: {
              stockItemId: stockItem.id,
              locationId: loc.id,
              factoryUnitId,
              quantity: item.quantity,
            },
          });

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
   * - Setor CORTE: lê da tabela oficial Material
   * - Demais setores: leem da tabela StockItem
   */
  async searchUnified(
    params: { q?: string; sector?: SectorType; page?: number; limit?: number },
    context: OperatorContext
  ) {
    const { factoryUnitId } = context;
    const { q, sector, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const searchTerm = q ? q.trim() : '';

    const buildMaterialWhere = () => {
      const base: any = { factoryUnitId };
      if (!searchTerm) return base;
      return {
        ...base,
        OR: [
          { code: { contains: searchTerm, mode: 'insensitive' } },
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { type: { contains: searchTerm, mode: 'insensitive' } },
        ],
      };
    };

    const buildSectorWhere = (sec: SectorType) => {
      const base: any = { factoryUnitId, sector: sec };
      if (!searchTerm) return base;

      switch (sec) {
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
        default:
          return base;
      }
    };

    const targetSector = sector || 'CORTE';

    // Execução paralela de buscas e contagens por setor (Zero N+1 Queries)
    const [
      corteCount,
      corteMaterials,
      apoioCount,
      apoioItems,
      preFabCount,
      preFabItems,
      expedicaoCount,
      expedicaoItems,
      montagemCount,
      montagemItems,
      locations,
      origins,
      categories,
    ] = await Promise.all([
      // Contagem e lista paginada na tabela oficial Material (4.000+ matérias-primas)
      prisma.material.count({ where: buildMaterialWhere() }),
      targetSector === 'CORTE'
        ? prisma.material.findMany({
            where: buildMaterialWhere(),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      // Demais setores na tabela StockItem
      prisma.stockItem.count({ where: buildSectorWhere('APOIO') }),
      targetSector === 'APOIO'
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('APOIO'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('PRE_FABRICADO') }),
      targetSector === 'PRE_FABRICADO'
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('PRE_FABRICADO'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('EXPEDICAO') }),
      targetSector === 'EXPEDICAO'
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('EXPEDICAO'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('MONTAGEM') }),
      targetSector === 'MONTAGEM'
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
      prisma.originConfig.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.categoryConfig.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const formattedCorteItems = corteMaterials.map((mat) => {
      const activeLocations = mat.locations
        ? mat.locations.filter((l: any) => Number(l.quantity) > 0)
        : [];
      const locationStr =
        activeLocations.length > 0
          ? activeLocations.map((l: any) => l.location.name).join(' | ')
          : (mat.locations && mat.locations.length > 0 ? mat.locations[0].location.name : 'Não definido');
      return {
        id: mat.id,
        sector: 'CORTE',
        code: mat.code,
        name: mat.name,
        unit: mat.unit,
        type: mat.type,
        quantity: mat.quantity,
        minStock: mat.minStock,
        observation: mat.observation || '',
        createdAt: mat.createdAt,
        locations: mat.locations ? mat.locations.map((l: any) => ({
          locationId: l.locationId,
          quantity: l.quantity,
          location: { id: l.location.id, name: l.location.name },
        })) : [],
        locationDisplay: locationStr,
      };
    });

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

    const activeSectorCount =
      targetSector === 'CORTE'
        ? corteCount
        : targetSector === 'APOIO'
        ? apoioCount
        : targetSector === 'PRE_FABRICADO'
        ? preFabCount
        : targetSector === 'EXPEDICAO'
        ? expedicaoCount
        : montagemCount;

    const formattedActiveItems =
      targetSector === 'CORTE'
        ? formattedCorteItems
        : formatLocations(
            targetSector === 'APOIO'
              ? apoioItems
              : targetSector === 'PRE_FABRICADO'
              ? preFabItems
              : targetSector === 'EXPEDICAO'
              ? expedicaoItems
              : montagemItems
          );

    return {
      items: formattedActiveItems,
      pagination: {
        total: activeSectorCount,
        page,
        limit,
        totalPages: Math.ceil(activeSectorCount / limit) || 1,
      },
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
        corte: { total: corteCount, data: targetSector === 'CORTE' ? formattedActiveItems : [] },
        apoio: { total: apoioCount, data: targetSector === 'APOIO' ? formattedActiveItems : [] },
        preFabricado: { total: preFabCount, data: targetSector === 'PRE_FABRICADO' ? formattedActiveItems : [] },
        expedicao: { total: expedicaoCount, data: targetSector === 'EXPEDICAO' ? formattedActiveItems : [] },
        montagem: { total: montagemCount, data: targetSector === 'MONTAGEM' ? formattedActiveItems : [] },
      },
      filterOptions: {
        locations: locations.map((l) => ({ id: l.id, name: l.name })),
        origins: origins.map((o) => ({ id: o.id, name: o.name })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      },
    };
  }
}
