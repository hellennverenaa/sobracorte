import { assertStockSectorAccess, assertGeneralStockAccess, isStockMaster } from '../auth/stockAccess';
import { movementSnapshot } from './movementSnapshot';
import { prisma } from '../prisma';
import { BatchCreateStockItemDTO, OperatorContext, StockItemUnionDTO } from '../types/stock.dto';
import { SectorType, ComponentType } from '../generated/prisma';
import { normalizeUnit, validateQuantity, UnitValidationError } from '../utils/unitHelper';
import { assertStockLocationSector, lockStockIdentityWrites, normalizeStockColor, normalizeStockSector, rejectDuplicateStockItem } from './stockIdentity';
export { DuplicateStockItemError } from './stockIdentity';

export class StockItemService {
  /**
   * Cadastro em lote com transação ACID e persistência oficial:
   * Todos os setores gravam no modelo canônico StockItem.
   */
  async createBatch(dto: BatchCreateStockItemDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;

    return await prisma.$transaction(async (tx) => {
      const createdItems = [];

      await lockStockIdentityWrites(tx, factoryUnitId);

      const items = dto.items.flatMap((item) => {
        if ((item.sector === 'PRE_FABRICADO' || item.sector === 'DISTRIBUICAO' || item.sector === 'MONTAGEM') && item.footSide === 'PAR') {
          return [{ ...item, footSide: 'E' as const }, { ...item, footSide: 'D' as const }];
        }
        return [item];
      });

      for (const item of items) {
        assertStockSectorAccess(context, item.sector);
        validateQuantity(item.quantity, item.unit, item.sector);
        if ('minStock' in item) validateQuantity(item.minStock, item.unit, item.sector, true);
        if (item.sector === 'CORTE') {
          const category = await tx.categoryConfig.findFirst({ where: { factoryUnitId, name: item.type, OR: [{ sector: 'CORTE' }, { sector: null }] } });
          if (category?.unitLocked && normalizeUnit(item.unit) !== category.defaultUnitCode) throw new UnitValidationError('Unidade bloqueada pela categoria.');
        }
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
              sector: normalizeStockSector(item.sector) as SectorType,
              factoryUnitId,
            },
          });
        }

        assertStockLocationSector(loc, item.sector);
        assertGeneralStockAccess(context, loc);

        const baseData = {
          factoryUnitId,
          sector: normalizeStockSector(item.sector) as SectorType,
          quantity: item.quantity,
          unit: normalizeUnit((item as any).unit, item.sector),
          observation: item.observation || '',
        };

        let sectorSpecificData = {};

        switch (item.sector) {
          case 'CORTE':
            sectorSpecificData = {
              componentType: 'MATERIA_PRIMA' as ComponentType,
              code: item.code.trim().toUpperCase(),
              name: item.name.trim().toUpperCase(),
              type: (item.type || 'GERAL').trim().toUpperCase(),
              minStock: item.minStock || 0,
            };
            break;
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
              color: normalizeStockColor(item.color),
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
              color: normalizeStockColor(item.color),
              sizeGrade: item.sizeGrade.trim().toUpperCase(),
              footSide: item.footSide || null,
            };
            break;

          case 'MONTAGEM':
            sectorSpecificData = {
              componentType: 'PE_PRONTO' as ComponentType,
              sku: item.sku.trim().toUpperCase(),
              productName: item.productName ? item.productName.trim().toUpperCase() : null,
              color: normalizeStockColor(item.color) || null,
              sizeGrade: item.sizeGrade.trim().toUpperCase(),
              footSide: item.footSide,
            };
            break;
        }

        await rejectDuplicateStockItem(tx, factoryUnitId, item.sector === 'CORTE' ? item : { ...baseData, ...sectorSpecificData });
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
            ...movementSnapshot(stockItem),
            destinationStockItemId: stockItem.id, destinationSector: stockItem.sector,
            origem: 'Saldo Inicial / Entrada no Setor',
            reason: item.observation || (item.sector === 'CORTE' ? 'Entrada em lote no Estoque de Corte' : 'Entrada em lote via terminal de chão de fábrica'),
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
   * Todos os setores são lidos de StockItem.
   */
  async searchUnified(
    params: {
      q?: string;
      sector?: SectorType | 'TODOS';
      page?: number;
      limit?: number;
      locationId?: number;
      type?: string;
      stockStatus?: 'with_balance' | 'zero_balance';
    },
    context: OperatorContext
  ) {
    const { factoryUnitId } = context;
    const { q, sector, page = 1, limit = 50, locationId, type, stockStatus } = params;
    const skip = (page - 1) * limit;
    if (!sector || sector === 'TODOS') {
      return this.searchAllSectors(params, context);
    }
    const targetSector = normalizeStockSector(sector) as SectorType;

    const rawSearch = q ? q.trim() : '';
    const searchTerms = rawSearch
      ? rawSearch.split(/[,\s\n;]+/).map((t) => t.trim()).filter(Boolean)
      : [];

    const applyInventoryFilters = (where: any, itemSector: SectorType) => {
      if (normalizeStockSector(itemSector) !== targetSector) return where;

      const filtered = { ...where };
      if (locationId) filtered.locations = { some: { factoryUnitId, locationId } };
      if (type && ['CORTE', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO'].includes(itemSector)) {
        filtered.type = { equals: type, mode: 'insensitive' };
      }
      if (stockStatus === 'with_balance') filtered.quantity = { gt: 0 };
      if (stockStatus === 'zero_balance') filtered.quantity = 0;
      return filtered;
    };

    const buildMaterialWhere = () => applyInventoryFilters({
      factoryUnitId,
      ...(searchTerms.length ? { OR: searchTerms.flatMap((term) => [
          { code: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { type: { contains: term, mode: 'insensitive' } },
        ]) } : {}),
    }, 'CORTE');

    const buildSectorWhere = (sec: SectorType) => {
      const base: any = { factoryUnitId };
      if (sec === 'DISTRIBUICAO' || sec === 'EXPEDICAO') {
        base.sector = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
      } else {
        base.sector = sec;
      }
      if (searchTerms.length === 0) return applyInventoryFilters(base, sec);

      switch (sec) {
        case 'APOIO':
          return applyInventoryFilters({
            ...base,
            OR: searchTerms.flatMap((term) => [
              { pieceCode: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
              { materialColor: { contains: term, mode: 'insensitive' } },
              { sizeGrade: { contains: term, mode: 'insensitive' } },
            ]),
          }, sec);
        case 'PRE_FABRICADO':
          return applyInventoryFilters({
            ...base,
            OR: searchTerms.flatMap((term) => [
              { sku: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { type: { contains: term, mode: 'insensitive' } },
              { color: { contains: term, mode: 'insensitive' } },
              { sizeGrade: { contains: term, mode: 'insensitive' } },
            ]),
          }, sec);
        case 'DISTRIBUICAO':
        case 'EXPEDICAO':
          return applyInventoryFilters({
            ...base,
            OR: searchTerms.flatMap((term) => [
              { sku: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { type: { contains: term, mode: 'insensitive' } },
              { color: { contains: term, mode: 'insensitive' } },
              { sizeGrade: { contains: term, mode: 'insensitive' } },
            ]),
          }, sec);
        case 'MONTAGEM':
          return applyInventoryFilters({
            ...base,
            OR: searchTerms.flatMap((term) => [
              { sku: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { color: { contains: term, mode: 'insensitive' } },
              { sizeGrade: { contains: term, mode: 'insensitive' } },
            ]),
          }, sec);
        default:
          return applyInventoryFilters(base, sec);
      }
    };

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
      // Corte também usa o estoque canônico.
      prisma.stockItem.count({ where: { ...buildMaterialWhere(), sector: 'CORTE' } }),
      targetSector === 'CORTE'
        ? prisma.stockItem.findMany({
            where: { ...buildMaterialWhere(), sector: 'CORTE' },
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
          OR: [
            { sector: targetSector as SectorType },
            ...(isStockMaster(context) ? [{ sector: null }] : []),
            ...(targetSector === 'DISTRIBUICAO' ? [{ sector: 'EXPEDICAO' as SectorType }] : []),
          ],
        },
        select: { id: true, name: true, sector: true },
        orderBy: { name: 'asc' },
      }),
      prisma.originConfig.findMany({
        where: { factoryUnitId, ...(!isStockMaster(context) ? { OR: [{ sector: targetSector as SectorType }, { sector: null }, ...(targetSector === 'DISTRIBUICAO' ? [{ sector: 'EXPEDICAO' as SectorType }] : [])] } : {}) },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.categoryConfig.findMany({
        where: { factoryUnitId, ...(!isStockMaster(context) ? { OR: [{ sector: targetSector as SectorType }, { sector: null }, ...(targetSector === 'DISTRIBUICAO' ? [{ sector: 'EXPEDICAO' as SectorType }] : [])] } : {}) },
        select: { id: true, name: true, sector: true },
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
          location: { id: l.location.id, name: l.location.name, sector: l.location.sector },
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

  private async searchAllSectors(
    params: {
      q?: string;
      sector?: SectorType | 'TODOS';
      page?: number;
      limit?: number;
      locationId?: number;
      type?: string;
      stockStatus?: 'with_balance' | 'zero_balance';
    },
    context: OperatorContext,
  ) {
    const { factoryUnitId } = context;
    const { q, page = 1, limit = 50, locationId, type, stockStatus } = params;
    const searchTerms = q?.trim()
      ? q.trim().split(/[,\s\n;]+/).map(term => term.trim()).filter(Boolean)
      : [];
    const baseWhere: any = {
      factoryUnitId,
      ...(locationId ? { locations: { some: { factoryUnitId, locationId } } } : {}),
      ...(type ? { type: { equals: type, mode: 'insensitive' } } : {}),
      ...(stockStatus === 'with_balance' ? { quantity: { gt: 0 } } : {}),
      ...(stockStatus === 'zero_balance' ? { quantity: 0 } : {}),
    };
    const searchFields: Record<string, string[]> = {
      CORTE: ['code', 'name', 'type'],
      APOIO: ['pieceCode', 'productName', 'description', 'materialColor', 'sizeGrade'],
      PRE_FABRICADO: ['sku', 'productName', 'type', 'color', 'sizeGrade'],
      DISTRIBUICAO: ['sku', 'productName', 'type', 'color', 'sizeGrade'],
      MONTAGEM: ['sku', 'productName', 'color', 'sizeGrade'],
    };
    const sectors: SectorType[] = ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'];
    const whereForSector = (sector: SectorType) => {
      const sectorWhere: any = {
        ...baseWhere,
        sector: sector === 'DISTRIBUICAO' ? { in: ['DISTRIBUICAO', 'EXPEDICAO'] } : sector,
      };
      if (searchTerms.length) {
        sectorWhere.AND = [{
          OR: searchTerms.flatMap(term => searchFields[sector].map(field => ({
            [field]: { contains: term, mode: 'insensitive' },
          }))),
        }];
      }
      return sectorWhere;
    };
    const where: any = {
      ...baseWhere,
      OR: sectors.map(sector => {
        const sectorCriteria = { ...whereForSector(sector) };
        delete sectorCriteria.factoryUnitId;
        delete sectorCriteria.locations;
        delete sectorCriteria.type;
        delete sectorCriteria.quantity;
        return sectorCriteria;
      }),
    };

    const [total, rows, corteCount, apoioCount, preFabCount, distribuicaoCount, montagemCount, locations, origins, categories] = await Promise.all([
      prisma.stockItem.count({ where }),
      prisma.stockItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { locations: { include: { location: true } } },
      }),
      prisma.stockItem.count({ where: whereForSector('CORTE') }),
      prisma.stockItem.count({ where: whereForSector('APOIO') }),
      prisma.stockItem.count({ where: whereForSector('PRE_FABRICADO') }),
      prisma.stockItem.count({ where: whereForSector('DISTRIBUICAO') }),
      prisma.stockItem.count({ where: whereForSector('MONTAGEM') }),
      prisma.location.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true, sector: true },
        orderBy: { name: 'asc' },
      }),
      prisma.originConfig.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true, sector: true },
        orderBy: { name: 'asc' },
      }),
      prisma.categoryConfig.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true, sector: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const formattedItems = rows.map((item: any) => {
      const itemLocations = item.locations || [];
      const activeLocations = itemLocations.filter((link: any) => Number(link.quantity) > 0);
      const locationDisplay = activeLocations.length
        ? activeLocations.map((link: any) => `${link.location.name} (${Number(link.quantity)} ${item.unit || 'UND'})`).join(' | ')
        : (itemLocations[0]?.location?.name || 'Não definido');
      if (item.sector === 'CORTE') {
        return {
          id: item.id,
          sector: item.sector,
          code: item.code,
          name: item.name,
          unit: item.unit,
          type: item.type,
          quantity: item.quantity,
          minStock: item.minStock,
          observation: item.observation || '',
          createdAt: item.createdAt,
          locations: itemLocations.map((link: any) => ({
            locationId: link.locationId,
            quantity: link.quantity,
            location: { id: link.location.id, name: link.location.name, sector: link.location.sector },
          })),
          locationDisplay,
        };
      }
      return { ...item, locationDisplay };
    });
    const pageSectorItems = (sector: string) => formattedItems.filter(item => normalizeStockSector(item.sector) === normalizeStockSector(sector));
    const totalItems = corteCount + apoioCount + preFabCount + distribuicaoCount + montagemCount;

    return {
      items: formattedItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
      metrics: {
        totalItems,
        totalCorte: corteCount,
        totalApoio: apoioCount,
        totalPreFabricado: preFabCount,
        totalDistribuicao: distribuicaoCount,
        totalExpedicao: distribuicaoCount,
        totalMontagem: montagemCount,
      },
      sectors: {
        todos: { total, data: formattedItems },
        corte: { total: corteCount, data: pageSectorItems('CORTE') },
        apoio: { total: apoioCount, data: pageSectorItems('APOIO') },
        preFabricado: { total: preFabCount, data: pageSectorItems('PRE_FABRICADO') },
        distribuicao: { total: distribuicaoCount, data: pageSectorItems('DISTRIBUICAO') },
        expedicao: { total: distribuicaoCount, data: pageSectorItems('DISTRIBUICAO') },
        montagem: { total: montagemCount, data: pageSectorItems('MONTAGEM') },
      },
      filterOptions: {
        locations: locations.map((item: any) => ({ id: item.id, name: item.name, sector: item.sector })),
        origins: origins.map((item: any) => ({ id: item.id, name: item.name, sector: item.sector })),
        categories: categories.map((item: any) => ({ id: item.id, name: item.name, sector: item.sector })),
      },
    };
  }

  /**
   * Sugestões de autocomplete inteligente por setor
   */
  async getSearchSuggestions(sector: SectorType | 'TODOS', query: string, factoryUnitId: number) {
    const rawQ = query ? query.trim() : '';

    if (sector === 'TODOS') {
      const terms = rawQ.split(/[\s,;]+/).map(term => term.trim()).filter(Boolean);
      const searchableFields = ['code', 'name', 'type', 'sku', 'pieceCode', 'productName', 'description', 'materialColor', 'color', 'sizeGrade'];
      const where: any = {
        factoryUnitId,
        sector: { in: ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'] },
        quantity: { gt: 0 },
        ...(terms.length ? {
          AND: terms.map(term => ({
            OR: searchableFields.map(field => ({ [field]: { contains: term, mode: 'insensitive' } })),
          })),
        } : {}),
      };
      const items = await prisma.stockItem.findMany({
        where,
        take: 50,
        orderBy: { updatedAt: 'desc' },
      });
      return items.map(item => ({
        sector: item.sector,
        sku: item.sku || item.pieceCode || item.code || item.productName || '',
        modelName: item.productName || item.type || '',
        description: item.description || item.name || item.materialColor || '',
        sizeGrades: item.sizeGrade ? [item.sizeGrade] : [],
        color: item.color || item.materialColor || '',
        footSides: item.footSide ? [item.footSide] : [],
        availableQuantity: Number(item.quantity || 0),
      }));
    }

    if (sector === 'CORTE') {
      const materials = await prisma.stockItem.findMany({
        where: {
          factoryUnitId,
          sector: 'CORTE',
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
  async getCombinations(sector: SectorType | 'TODOS', query: string, factoryUnitId: number): Promise<string[]> {
    const rawQ = query ? query.trim() : '';

    if (sector === 'TODOS') {
      const items = await prisma.stockItem.findMany({
        where: {
          factoryUnitId,
          sector: { in: ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'] },
          OR: [
            { color: { not: null, ...(rawQ ? { contains: rawQ, mode: 'insensitive' } : {}) } },
            { materialColor: { not: null, ...(rawQ ? { contains: rawQ, mode: 'insensitive' } : {}) } },
          ],
        },
        select: { color: true, materialColor: true },
        take: 500,
      });
      const values = items.flatMap(item => [item.color, item.materialColor]);
      return [...new Set(values.map(value => value?.replace(/\s+/g, '').replace(/[^A-Za-z0-9\/\-]/g, '').toUpperCase()).filter(Boolean) as string[])].sort();
    }

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
