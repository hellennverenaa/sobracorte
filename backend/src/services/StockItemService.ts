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

          // Auditoria em Movement (histórico oficial de matérias-primas do Corte)
          await tx.movement.create({
            data: {
              factoryUnitId,
              materialId: materialRecord.id,
              type: 'entrada',
              quantity: item.quantity,
              materialCode: materialRecord.code,
              materialName: materialRecord.name,
              materialCategory: materialRecord.type,
              materialUnit: materialRecord.unit,
              locationName: loc.name,
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
            unit: (item as any).unit ? (item as any).unit.trim().toUpperCase() : 'UND',
            observation: item.observation || '',
          };

          let sectorSpecificData = {};

          switch (item.sector) {
            case 'APOIO':
              sectorSpecificData = {
                componentType: 'PECA_CORTADA' as ComponentType,
                pieceCode: item.pieceCode.trim().toUpperCase(),
                productName: item.productName ? item.productName.trim().toUpperCase() : null,
                description: item.description.trim().toUpperCase(),
                materialColor: item.materialColor.trim().toUpperCase(),
                sizeGrade: item.sizeGrade.trim().toUpperCase(),
              };
              break;

            case 'PRE_FABRICADO':
              sectorSpecificData = {
                componentType: 'SOLADO' as ComponentType,
                type: (item.type || 'EVA').trim().toUpperCase(),
                sku: (item.sku || item.productName).trim().toUpperCase(),
                productName: item.productName.trim().toUpperCase(),
                color: item.color.replace(/\s+/g, '').replace(/[^A-Za-z0-9\/\-]/g, '').toUpperCase(),
                sizeGrade: item.sizeGrade.trim().toUpperCase(),
                footSide: item.footSide || null,
              };
              break;

            case 'DISTRIBUICAO':
            case 'EXPEDICAO':
              const distType = (item.type || 'CABEDAL').trim().toUpperCase();
              sectorSpecificData = {
                componentType: distType === 'SOLA_PROCESSADA' ? ('SOLADO' as ComponentType) : ('CABEDAL' as ComponentType),
                type: distType,
                sku: item.sku.trim().toUpperCase(),
                productName: item.productName ? item.productName.trim().toUpperCase() : null,
                color: item.color.replace(/\s+/g, '').replace(/[^A-Za-z0-9\/\-]/g, '').toUpperCase(),
                sizeGrade: item.sizeGrade.trim().toUpperCase(),
                footSide: item.footSide || null,
              };
              break;

            case 'MONTAGEM':
              sectorSpecificData = {
                componentType: 'PE_PRONTO' as ComponentType,
                sku: item.sku.trim().toUpperCase(),
                productName: item.productName ? item.productName.trim().toUpperCase() : null,
                color: item.color ? item.color.replace(/\s+/g, '').replace(/[^A-Za-z0-9\/\-]/g, '').toUpperCase() : null,
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
              destinationLocationName: loc.name,
              itemCode: stockItem.sku || stockItem.pieceCode || null,
              itemName: stockItem.description || stockItem.productName || null,
              itemCategory: stockItem.componentType || stockItem.type || null,
              itemUnit: stockItem.unit || 'UND',
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

    const rawSearch = q ? q.trim() : '';
    const searchTerms = rawSearch
      ? rawSearch.split(/[,\s\n;]+/).map((t) => t.trim()).filter(Boolean)
      : [];

    const buildMaterialWhere = () => {
      const base: any = { factoryUnitId };
      if (searchTerms.length === 0) return base;
      return {
        ...base,
        OR: searchTerms.flatMap((term) => [
          { code: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { type: { contains: term, mode: 'insensitive' } },
        ]),
      };
    };

    const buildSectorWhere = (sec: SectorType) => {
      const base: any = { factoryUnitId };
      if (sec === 'DISTRIBUICAO' || sec === 'EXPEDICAO') {
        base.sector = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
      } else {
        base.sector = sec;
      }
      if (searchTerms.length === 0) return base;

      switch (sec) {
        case 'APOIO':
          return {
            ...base,
            OR: searchTerms.flatMap((term) => [
              { pieceCode: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
              { materialColor: { contains: term, mode: 'insensitive' } },
              { sizeGrade: { contains: term, mode: 'insensitive' } },
            ]),
          };
        case 'PRE_FABRICADO':
          return {
            ...base,
            OR: searchTerms.flatMap((term) => [
              { sku: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { type: { contains: term, mode: 'insensitive' } },
              { color: { contains: term, mode: 'insensitive' } },
              { sizeGrade: { contains: term, mode: 'insensitive' } },
            ]),
          };
        case 'DISTRIBUICAO':
        case 'EXPEDICAO':
          return {
            ...base,
            OR: searchTerms.flatMap((term) => [
              { sku: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { type: { contains: term, mode: 'insensitive' } },
              { color: { contains: term, mode: 'insensitive' } },
              { sizeGrade: { contains: term, mode: 'insensitive' } },
            ]),
          };
        case 'MONTAGEM':
          return {
            ...base,
            OR: searchTerms.flatMap((term) => [
              { sku: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { color: { contains: term, mode: 'insensitive' } },
              { sizeGrade: { contains: term, mode: 'insensitive' } },
            ]),
          };
        default:
          return base;
      }
    };

    let targetSector = sector || 'CORTE';
    if (targetSector === 'EXPEDICAO' || targetSector === ('CABEDAIS' as any)) {
      targetSector = 'DISTRIBUICAO';
    }

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
      prisma.stockItem.count({ where: buildSectorWhere('DISTRIBUICAO') }),
      (targetSector === 'DISTRIBUICAO' || (targetSector as string) === 'EXPEDICAO')
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('DISTRIBUICAO'),
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
        where: {
          factoryUnitId,
          ...(context.role !== 'admin'
            ? {
                OR: [
                  ...(targetSector === 'DISTRIBUICAO'
                    ? [{ sector: 'DISTRIBUICAO' as SectorType }, { sector: 'EXPEDICAO' as SectorType }]
                    : targetSector === 'CORTE'
                    ? [{ sector: 'CORTE' as SectorType }, { sector: null }]
                    : [{ sector: targetSector as SectorType }]),
                ],
              }
            : {}),
        },
        select: { id: true, name: true, sector: true },
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
          ? activeLocations.map((l: any) => `${l.location.name} (${Number(l.quantity)} ${mat.unit || 'M²'})`).join(' | ')
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
        const unit = item.unit || 'UND';
        const locationStr =
          activeLocations.length > 0
            ? activeLocations.map((l: any) => `${l.location.name} (${Number(l.quantity)} ${unit})`).join(' | ')
            : 'Não definido';
        return {
          ...item,
          locationDisplay: locationStr,
        };
      });

    const isDistribuicao = targetSector === 'DISTRIBUICAO' || (targetSector as string) === 'EXPEDICAO';

    const activeSectorCount =
      targetSector === 'CORTE'
        ? corteCount
        : targetSector === 'APOIO'
        ? apoioCount
        : targetSector === 'PRE_FABRICADO'
        ? preFabCount
        : isDistribuicao
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
              : isDistribuicao
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
        totalDistribuicao: expedicaoCount,
        totalExpedicao: expedicaoCount,
        totalMontagem: montagemCount,
      },
      sectors: {
        corte: { total: corteCount, data: targetSector === 'CORTE' ? formattedActiveItems : [] },
        apoio: { total: apoioCount, data: targetSector === 'APOIO' ? formattedActiveItems : [] },
        preFabricado: { total: preFabCount, data: targetSector === 'PRE_FABRICADO' ? formattedActiveItems : [] },
        distribuicao: { total: expedicaoCount, data: isDistribuicao ? formattedActiveItems : [] },
        expedicao: { total: expedicaoCount, data: isDistribuicao ? formattedActiveItems : [] },
        montagem: { total: montagemCount, data: targetSector === 'MONTAGEM' ? formattedActiveItems : [] },
      },
      filterOptions: {
        locations: locations.map((l) => ({ id: l.id, name: l.name, sector: l.sector })),
        origins: origins.map((o) => ({ id: o.id, name: o.name })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      },
    };
  }

  /**
   * Sugestões de autocomplete inteligente por setor
   */
  async getSearchSuggestions(sector: SectorType, query: string, factoryUnitId: number) {
    const rawQ = query ? query.trim() : '';

    if (sector === 'CORTE') {
      const materials = await prisma.material.findMany({
        where: {
          factoryUnitId,
          ...(rawQ
            ? {
                OR: [
                  { code: { contains: rawQ, mode: 'insensitive' } },
                  { name: { contains: rawQ, mode: 'insensitive' } },
                  { type: { contains: rawQ, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        take: 20,
        orderBy: { updatedAt: 'desc' },
      });

      return materials.map((m) => ({
        sku: m.code,
        modelName: m.type || 'CORTE',
        description: m.name,
        sizeGrades: [] as string[],
        color: '',
        footSide: null,
        availableQuantity: Number(m.quantity || 0),
      }));
    }

    const items = await prisma.stockItem.findMany({
      where: {
        factoryUnitId,
        sector,
        quantity: { gt: 0 },
        ...(rawQ
          ? {
              OR: [
                { sku: { contains: rawQ, mode: 'insensitive' } },
                { pieceCode: { contains: rawQ, mode: 'insensitive' } },
                { productName: { contains: rawQ, mode: 'insensitive' } },
                { description: { contains: rawQ, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });

    // Agrupar por SKU / pieceCode para retornar modelos e grades disponíveis
    const groupMap = new Map<string, {
      sku: string;
      modelName: string;
      description: string;
      sizeGrades: Set<string>;
      color: string;
      footSides: Set<string>;
      availableQuantity: number;
    }>();

    for (const item of items) {
      const codeKey = (item.sku || item.pieceCode || item.productName || 'SEM_CODIGO').toUpperCase();
      const existing = groupMap.get(codeKey);

      const mName = item.productName || (item.sector === 'APOIO' ? 'MOLDE / PEÇA' : codeKey);
      const desc = item.description || item.name || item.materialColor || 'COMPONENTE';

      if (!existing) {
        groupMap.set(codeKey, {
          sku: codeKey,
          modelName: mName,
          description: desc,
          sizeGrades: new Set(item.sizeGrade ? [item.sizeGrade] : []),
          color: item.color || item.materialColor || '',
          footSides: new Set(item.footSide ? [item.footSide] : []),
          availableQuantity: Number(item.quantity || 0),
        });
      } else {
        if (item.sizeGrade) existing.sizeGrades.add(item.sizeGrade);
        if (item.footSide) existing.footSides.add(item.footSide);
        existing.availableQuantity += Number(item.quantity || 0);
      }
    }

    return Array.from(groupMap.values()).slice(0, 20).map((g) => ({
      sku: g.sku,
      modelName: g.modelName,
      description: g.description,
      sizeGrades: Array.from(g.sizeGrades),
      color: g.color,
      footSides: Array.from(g.footSides),
      availableQuantity: g.availableQuantity,
    }));
  }

  /**
   * Consulta agregada de combinações / cores já cadastradas (Autocomplete)
   */
  async getCombinations(sector: SectorType, query: string, factoryUnitId: number): Promise<string[]> {
    const rawQ = query ? query.trim() : '';

    let sectorCondition: any = sector;
    if (sector === 'DISTRIBUICAO' || sector === 'EXPEDICAO') {
      sectorCondition = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
    }

    const items = await prisma.stockItem.findMany({
      where: {
        factoryUnitId,
        sector: sectorCondition,
        color: {
          not: null,
          ...(rawQ ? { contains: rawQ, mode: 'insensitive' } : {}),
        },
      },
      select: {
        color: true,
      },
      distinct: ['color'],
      orderBy: {
        color: 'asc',
      },
      take: 100,
    });

    const uniqueColors = new Set<string>();
    for (const item of items) {
      const clean = item.color
        ? item.color.replace(/\s+/g, '').replace(/[^A-Za-z0-9\/\-]/g, '').toUpperCase()
        : '';
      if (clean && clean.length > 0) {
        uniqueColors.add(clean);
      }
    }

    return Array.from(uniqueColors).sort();
  }
}

