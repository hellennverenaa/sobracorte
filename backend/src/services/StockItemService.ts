import { assertStockSectorAccess, assertGeneralStockAccess, isStockMaster } from '../auth/stockAccess';
import { movementSnapshot } from './movementSnapshot';
import { prisma } from '../prisma';
import { BatchCreateStockItemDTO, OperatorContext, StockItemUnionDTO } from '../types/stock.dto';
import { Prisma, SectorType, ComponentType } from '../generated/prisma';
import { normalizeUnit, validateQuantity, UnitValidationError } from '../utils/unitHelper';
import { assertStockLocationCategory, assertStockLocationSector, lockStockIdentityWrites, normalizeStockColor, normalizeStockSector, rejectDuplicateStockItem, StockCategoryError, StockOriginError } from './stockIdentity';
import { categoryScopeWhere } from './categoryScope';
import {
  assertStockLocationSubsector,
  assertStockSubsectorAccess,
  assertSubsectorCategoryAllowed,
  locationScopeWhere,
  stockItemScopeWhere,
} from '../auth/subsectorAccess';
export { DuplicateStockItemError } from './stockIdentity';

// Esses setores já exigiam um tipo de material; categoria continua opcional em APOIO e MONTAGEM.
const CATEGORY_REQUIRED_SECTORS = new Set(['CORTE', 'PRE_FABRICADO', 'DISTRIBUICAO']);

function withAndCondition<T extends Record<string, any>>(where: T, condition: object): T {
  if (Object.keys(condition).length === 0) return where;
  const conditions = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  return { ...where, AND: [...conditions, condition] };
}

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

      for (const originalItem of dto.items) {
        assertStockSectorAccess(context, originalItem.sector);
        const item: any = originalItem;
        const subsector = item.subsectorId
          ? await tx.subsectorConfig.findFirst({
              where: { id: item.subsectorId, factoryUnitId, active: true },
              select: {
                id: true,
                sector: true,
                categoryMode: true,
                categoryLinks: { select: { categoryConfigId: true } },
              },
            })
          : null;
        if (item.subsectorId && !subsector) {
          throw new StockCategoryError('O subsetor informado não existe, está arquivado ou pertence a outra unidade fabril.');
        }
        if (subsector) assertStockSubsectorAccess(context, subsector, item.sector);
        if (CATEGORY_REQUIRED_SECTORS.has(item.sector) && !item.categoryId) {
          throw new StockCategoryError(`Selecione uma categoria configurada para o setor ${item.sector}.`);
        }
        const category = item.categoryId
          ? await tx.categoryConfig.findFirst({
            where: { id: item.categoryId, factoryUnitId, ...categoryScopeWhere(item.sector) },
          })
          : null;
        if (item.categoryId && !category) {
          throw new StockCategoryError('A categoria selecionada não existe nesta unidade ou não se aplica ao setor do cadastro.');
        }
        assertSubsectorCategoryAllowed(subsector, item.categoryId, Boolean(subsector));

        const allowedComponentBySector: Record<string, ComponentType[]> = {
          CORTE: ['MATERIA_PRIMA'],
          APOIO: ['PECA_CORTADA', 'CABEDAL'],
          PRE_FABRICADO: ['SOLADO'],
          DISTRIBUICAO: ['CABEDAL', 'SOLADO'],
          EXPEDICAO: ['CABEDAL', 'SOLADO'],
          MONTAGEM: ['PE_PRONTO'],
        };
        if (category?.componentType && !allowedComponentBySector[item.sector]?.includes(category.componentType)) {
          throw new StockCategoryError('A classificação da categoria não é compatível com o setor escolhido.');
        }
        if (category && item.type && String(item.type).trim().toUpperCase() !== category.name.trim().toUpperCase()) {
          throw new StockCategoryError('O tipo do material deve corresponder à categoria selecionada.');
        }

        const selectedOrigin = String(item.origem || '').trim();
        const normalizedItemSector = normalizeStockSector(item.sector) as SectorType;
        const originSectors: SectorType[] = normalizedItemSector === 'DISTRIBUICAO'
          ? ['DISTRIBUICAO', 'EXPEDICAO']
          : [normalizedItemSector];
        const configuredOrigin = selectedOrigin
          ? await tx.originConfig.findFirst({
            where: {
              factoryUnitId,
              name: selectedOrigin.toLocaleUpperCase('pt-BR'),
              OR: [{ sector: null }, ...originSectors.map(sector => ({ sector }))],
            },
            select: { name: true },
          })
          : null;
        if (selectedOrigin && !configuredOrigin) {
          throw new StockOriginError('A origem selecionada não está cadastrada para o setor deste item. Atualize as origens em Configurações.');
        }

        if (category?.unitLocked && !category.defaultUnitCode) {
          throw new UnitValidationError(`A categoria ${category.name} está configurada para bloquear a unidade, mas não possui uma unidade padrão.`);
        }
        const sectorDefaultUnit = item.sector === 'CORTE' ? 'M²' : 'UN';
        const effectiveUnit = normalizeUnit(
          category?.unitLocked ? category.defaultUnitCode : item.unit || category?.defaultUnitCode || sectorDefaultUnit,
          item.sector,
        );

        let apoioComponentType: ComponentType = 'PECA_CORTADA';
        if (item.sector === 'APOIO') {
          apoioComponentType = (category?.componentType || item.componentType || 'PECA_CORTADA') as ComponentType;
          if (apoioComponentType !== 'PECA_CORTADA' && apoioComponentType !== 'CABEDAL') {
            throw new StockCategoryError('No setor Peças Cortadas, selecione uma categoria do tipo Peça Cortada ou Cabedal.');
          }
          if (category?.componentType && item.componentType && category.componentType !== item.componentType) {
            throw new StockCategoryError('O tipo do item não corresponde ao tipo definido na categoria selecionada.');
          }
        }

        validateQuantity(item.quantity, effectiveUnit, item.sector);
        if ('minStock' in item) validateQuantity(item.minStock, effectiveUnit, item.sector, true);

        const shouldSplitPair = item.footSide === 'PAR' && (
          item.sector === 'PRE_FABRICADO' || item.sector === 'DISTRIBUICAO'
          || item.sector === 'EXPEDICAO' || item.sector === 'MONTAGEM'
          || (item.sector === 'APOIO' && apoioComponentType === 'CABEDAL')
        );
        const items = shouldSplitPair
          ? [{ ...item, footSide: 'E' }, { ...item, footSide: 'D' }]
          : [item];

        for (const expandedItem of items) {
          const locationName = expandedItem.location.trim().toUpperCase();
          let loc = await tx.location.findUnique({
            where: { factoryUnitId_name: { factoryUnitId, name: locationName } },
            include: { categoryLinks: { select: { categoryId: true } } },
          });

          if (!loc && expandedItem.categoryId) {
            throw new StockCategoryError('A localização selecionada não existe ou não está vinculada à categoria. Cadastre e vincule-a em Configurações.');
          }
          if (!loc) {
            loc = await tx.location.create({
              data: {
                name: locationName,
                sector: normalizeStockSector(expandedItem.sector) as SectorType,
                subsectorId: expandedItem.subsectorId || null,
                factoryUnitId,
              },
              include: { categoryLinks: { select: { categoryId: true } } },
            });
          }

          assertStockLocationSector(loc, expandedItem.sector);
          assertStockLocationSubsector(loc, expandedItem.subsectorId);
          assertStockLocationCategory(loc, expandedItem.categoryId);
          assertGeneralStockAccess(context, loc);

          const baseData = {
            factoryUnitId,
            sector: normalizeStockSector(expandedItem.sector) as SectorType,
            subsectorId: expandedItem.subsectorId || null,
            categoryId: expandedItem.categoryId || null,
            quantity: expandedItem.quantity,
            unit: effectiveUnit,
            observation: expandedItem.observation || '',
          };

          let sectorSpecificData: Record<string, any> = {};
          switch (expandedItem.sector) {
            case 'CORTE':
              sectorSpecificData = {
                componentType: (category?.componentType || 'MATERIA_PRIMA') as ComponentType,
                code: expandedItem.code.trim().toUpperCase(),
                name: expandedItem.name.trim().toUpperCase(),
                type: (category?.name || expandedItem.type || '').trim().toUpperCase(),
                minStock: expandedItem.minStock || 0,
              };
              break;
            case 'APOIO':
              if (apoioComponentType === 'CABEDAL') {
                sectorSpecificData = {
                  componentType: 'CABEDAL' as ComponentType,
                  type: (category?.name || expandedItem.type || '').trim().toUpperCase() || null,
                  sku: expandedItem.sku.trim().toUpperCase(),
                  productName: expandedItem.productName ? expandedItem.productName.trim().toUpperCase() : null,
                  description: expandedItem.description ? expandedItem.description.trim().toUpperCase() : 'CABEDAL',
                  color: normalizeStockColor(expandedItem.color || expandedItem.materialColor),
                  sizeGrade: expandedItem.sizeGrade.trim().toUpperCase(),
                  footSide: expandedItem.footSide,
                };
              } else {
                sectorSpecificData = {
                  componentType: 'PECA_CORTADA' as ComponentType,
                  type: (expandedItem.type || category?.name || null)?.trim().toUpperCase() || null,
                  pieceCode: expandedItem.pieceCode.trim().toUpperCase(),
                  productName: expandedItem.productName ? expandedItem.productName.trim().toUpperCase() : null,
                  description: expandedItem.description.trim().toUpperCase(),
                  materialColor: expandedItem.materialColor.trim().toUpperCase(),
                  sizeGrade: expandedItem.sizeGrade.trim().toUpperCase(),
                  footSide: null,
                };
              }
              break;
            case 'PRE_FABRICADO':
              sectorSpecificData = {
                componentType: (category?.componentType || 'SOLADO') as ComponentType,
                type: (category?.name || expandedItem.type || '').trim().toUpperCase(),
                sku: (expandedItem.sku || expandedItem.productName).trim().toUpperCase(),
                productName: expandedItem.productName.trim().toUpperCase(),
                color: normalizeStockColor(expandedItem.color),
                sizeGrade: expandedItem.sizeGrade.trim().toUpperCase(),
                footSide: expandedItem.footSide === 'PAR' ? null : expandedItem.footSide || null,
              };
              break;
            case 'DISTRIBUICAO':
            case 'EXPEDICAO': {
              const distType = (category?.name || expandedItem.type || (expandedItem.sector === 'EXPEDICAO' ? 'CABEDAL' : '')).trim().toUpperCase();
              const materialComponentType = category?.componentType || (distType === 'SOLA_PROCESSADA' ? 'SOLADO' : 'CABEDAL');
              sectorSpecificData = {
                componentType: materialComponentType as ComponentType,
                type: distType,
                sku: expandedItem.sku.trim().toUpperCase(),
                productName: expandedItem.productName ? expandedItem.productName.trim().toUpperCase() : null,
                color: normalizeStockColor(expandedItem.color),
                sizeGrade: expandedItem.sizeGrade.trim().toUpperCase(),
                footSide: expandedItem.footSide === 'PAR' ? null : expandedItem.footSide || null,
              };
              break;
            }
            case 'MONTAGEM':
              sectorSpecificData = {
                componentType: (category?.componentType || 'PE_PRONTO') as ComponentType,
                type: (category?.name || expandedItem.type || '').trim().toUpperCase() || null,
                sku: expandedItem.sku.trim().toUpperCase(),
                productName: expandedItem.productName ? expandedItem.productName.trim().toUpperCase() : null,
                color: normalizeStockColor(expandedItem.color) || null,
                sizeGrade: expandedItem.sizeGrade.trim().toUpperCase(),
                footSide: expandedItem.footSide === 'PAR' ? null : expandedItem.footSide,
              };
              break;
          }

          const itemForIdentity = { ...baseData, ...sectorSpecificData };
          await rejectDuplicateStockItem(tx, factoryUnitId, itemForIdentity);
          const stockItem = await tx.stockItem.create({ data: itemForIdentity });

          await tx.stockItemLocation.create({
            data: { stockItemId: stockItem.id, locationId: loc.id, factoryUnitId, quantity: expandedItem.quantity },
          });

          await tx.stockMovement.create({
            data: {
              factoryUnitId,
              stockItemId: stockItem.id,
              subsectorId: stockItem.subsectorId,
              sector: expandedItem.sector as SectorType,
              type: 'ENTRADA',
              quantity: expandedItem.quantity,
              destinationLocationId: loc.id,
              destinationLocationName: loc.name,
              ...movementSnapshot(stockItem),
              destinationStockItemId: stockItem.id,
              destinationSector: stockItem.sector,
              origem: configuredOrigin?.name || 'Saldo Inicial / Entrada no Setor',
              reason: expandedItem.observation || (expandedItem.sector === 'CORTE' ? 'Entrada em lote no Estoque de Corte' : 'Entrada em lote via terminal de chão de fábrica'),
              operatorId: operatorId || null,
              operatorName: operatorName || 'Sistema / Operador',
            },
          });

          createdItems.push({ id: stockItem.id, sector: stockItem.sector, quantity: stockItem.quantity, location: loc.name });
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
      modelName?: string;
      materialColor?: string;
    },
    context: OperatorContext
  ) {
    const { factoryUnitId } = context;
    const itemScope = stockItemScopeWhere(context);
    const { q, sector, page = 1, limit = 50, locationId, type, stockStatus, modelName, materialColor } = params;
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
      if (normalizeStockSector(itemSector) !== targetSector) return withAndCondition(where, itemScope);

      const filtered = { ...where };
      if (locationId) filtered.locations = { some: { factoryUnitId, locationId } };
      if (type && ['CORTE', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO'].includes(itemSector)) {
        filtered.type = { equals: type, mode: 'insensitive' };
      }
      if (modelName) filtered.productName = { contains: modelName, mode: 'insensitive' };
      if (materialColor) {
        const materialColorMatches = itemSector === 'CORTE'
          ? [{ name: { contains: materialColor, mode: 'insensitive' } }]
          : itemSector === 'APOIO'
            ? [
                { materialColor: { contains: materialColor, mode: 'insensitive' } },
                { color: { contains: materialColor, mode: 'insensitive' } },
              ]
            : [{ color: { contains: materialColor, mode: 'insensitive' } }];
        filtered.AND = [...(Array.isArray(filtered.AND) ? filtered.AND : []), { OR: materialColorMatches }];
      }
      if (stockStatus === 'with_balance') filtered.quantity = { gt: 0 };
      if (stockStatus === 'zero_balance') filtered.quantity = 0;
      return withAndCondition(filtered, itemScope);
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
              { sku: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
              { materialColor: { contains: term, mode: 'insensitive' } },
              { color: { contains: term, mode: 'insensitive' } },
              { type: { contains: term, mode: 'insensitive' } },
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
            include: { subsector: { select: { id: true, name: true, sector: true, active: true } }, locations: { include: { location: true } } },
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
            include: { subsector: { select: { id: true, name: true, sector: true, active: true } }, locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('PRE_FABRICADO') }),
      targetSector === 'PRE_FABRICADO'
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('PRE_FABRICADO'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { subsector: { select: { id: true, name: true, sector: true, active: true } }, locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('DISTRIBUICAO') }),
      (targetSector === 'DISTRIBUICAO' || (targetSector as string) === 'EXPEDICAO')
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('DISTRIBUICAO'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { subsector: { select: { id: true, name: true, sector: true, active: true } }, locations: { include: { location: true } } },
          })
        : [],
      prisma.stockItem.count({ where: buildSectorWhere('MONTAGEM') }),
      targetSector === 'MONTAGEM'
        ? prisma.stockItem.findMany({
            where: buildSectorWhere('MONTAGEM'),
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { subsector: { select: { id: true, name: true, sector: true, active: true } }, locations: { include: { location: true } } },
          })
        : [],
      prisma.location.findMany({
        where: withAndCondition({
          factoryUnitId,
          OR: [
            { sector: targetSector as SectorType },
            ...(isStockMaster(context) ? [{ sector: null }] : []),
            ...(targetSector === 'DISTRIBUICAO' ? [{ sector: 'EXPEDICAO' as SectorType }] : []),
          ],
        }, locationScopeWhere(context)),
        // `categoryMode` foi adicionado de forma aditiva. A busca principal
        // continua compatível com bases que ainda não receberam a migração;
        // a validação de vínculos permanece baseada nos links legados.
        select: { id: true, name: true, sector: true, subsectorId: true, categoryId: true, categoryLinks: { select: { categoryId: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.originConfig.findMany({
        where: {
          factoryUnitId,
          OR: [
            { sector: targetSector },
            { sector: null },
            ...(targetSector === 'DISTRIBUICAO' ? [{ sector: 'EXPEDICAO' as SectorType }] : []),
          ],
        },
        select: { id: true, name: true, sector: true },
        orderBy: { name: 'asc' },
      }),
      prisma.categoryConfig.findMany({
        where: { factoryUnitId, ...(!isStockMaster(context) ? categoryScopeWhere(targetSector) : {}) },
        select: { id: true, name: true, sector: true, sectors: true, componentType: true },
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
        subsectorId: mat.subsectorId,
        subsector: mat.subsector,
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
          location: { id: l.location.id, name: l.location.name, sector: l.location.sector, subsectorId: l.location.subsectorId },
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
        locations: locations.map((l: any) => ({ id: l.id, name: l.name, sector: l.sector, subsectorId: l.subsectorId, categoryMode: l.categoryMode, categoryId: l.categoryId, categoryLinks: l.categoryLinks })),
        origins: origins.map((o) => ({ id: o.id, name: o.name, sector: o.sector })),
        categories: categories.map((c) => ({ id: c.id, name: c.name, sector: c.sector, sectors: c.sectors, componentType: c.componentType })),
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
      modelName?: string;
      materialColor?: string;
    },
    context: OperatorContext,
  ) {
    const { factoryUnitId } = context;
    const { q, page = 1, limit = 50, locationId, type, stockStatus, modelName, materialColor } = params;
    const searchTerms = q?.trim()
      ? q.trim().split(/[,\s\n;]+/).map(term => term.trim()).filter(Boolean)
      : [];
    const baseWhere: any = withAndCondition({
      factoryUnitId,
      ...(locationId ? { locations: { some: { factoryUnitId, locationId } } } : {}),
      ...(type ? { type: { equals: type, mode: 'insensitive' } } : {}),
      ...(modelName ? { productName: { contains: modelName, mode: 'insensitive' } } : {}),
      ...(materialColor ? { AND: [{ OR: [
        { materialColor: { contains: materialColor, mode: 'insensitive' } },
        { color: { contains: materialColor, mode: 'insensitive' } },
        { name: { contains: materialColor, mode: 'insensitive' } },
      ] }] } : {}),
      ...(stockStatus === 'with_balance' ? { quantity: { gt: 0 } } : {}),
      ...(stockStatus === 'zero_balance' ? { quantity: 0 } : {}),
    }, stockItemScopeWhere(context));
    const searchFields: Record<string, string[]> = {
      CORTE: ['code', 'name', 'type'],
      APOIO: ['pieceCode', 'sku', 'productName', 'description', 'materialColor', 'color', 'type', 'sizeGrade'],
      PRE_FABRICADO: ['sku', 'productName', 'type', 'color', 'sizeGrade'],
      DISTRIBUICAO: ['sku', 'productName', 'type', 'color', 'sizeGrade'],
      MONTAGEM: ['sku', 'productName', 'color', 'sizeGrade'],
    };
    const sectors: SectorType[] = ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'];
    const sectorSearchWhere = (sector: SectorType) => {
      const sectorWhere: any = {
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
    const whereForSector = (sector: SectorType) => {
      const sectorWhere = sectorSearchWhere(sector);
      const andConditions = [
        ...(Array.isArray(baseWhere.AND) ? baseWhere.AND : []),
        ...(Array.isArray(sectorWhere.AND) ? sectorWhere.AND : []),
      ];
      return {
        ...baseWhere,
        ...sectorWhere,
        ...(andConditions.length ? { AND: andConditions } : {}),
      };
    };
    const where: any = {
      ...baseWhere,
      OR: sectors.map(sectorSearchWhere),
    };

    const [total, rows, corteCount, apoioCount, preFabCount, distribuicaoCount, montagemCount, locations, origins, categories] = await Promise.all([
      prisma.stockItem.count({ where }),
      prisma.stockItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { subsector: { select: { id: true, name: true, sector: true, active: true } }, locations: { include: { location: true } } },
      }),
      prisma.stockItem.count({ where: whereForSector('CORTE') }),
      prisma.stockItem.count({ where: whereForSector('APOIO') }),
      prisma.stockItem.count({ where: whereForSector('PRE_FABRICADO') }),
      prisma.stockItem.count({ where: whereForSector('DISTRIBUICAO') }),
      prisma.stockItem.count({ where: whereForSector('MONTAGEM') }),
      prisma.location.findMany({
        where: withAndCondition({ factoryUnitId }, locationScopeWhere(context)),
        // Ver comentário acima: não incluir a coluna opcional na consulta
        // crítica de carregamento do estoque antes da migração ser aplicada.
        select: { id: true, name: true, sector: true, subsectorId: true, categoryId: true, categoryLinks: { select: { categoryId: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.originConfig.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true, sector: true },
        orderBy: { name: 'asc' },
      }),
      prisma.categoryConfig.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true, sector: true, sectors: true, componentType: true },
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
          subsectorId: item.subsectorId,
          subsector: item.subsector,
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
            location: { id: link.location.id, name: link.location.name, sector: link.location.sector, subsectorId: link.location.subsectorId },
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
        locations: locations.map((item: any) => ({ id: item.id, name: item.name, sector: item.sector, subsectorId: item.subsectorId, categoryMode: item.categoryMode, categoryId: item.categoryId, categoryLinks: item.categoryLinks })),
        origins: origins.map((item: any) => ({ id: item.id, name: item.name, sector: item.sector })),
        categories: categories.map((item: any) => ({ id: item.id, name: item.name, sector: item.sector, sectors: item.sectors, componentType: item.componentType })),
      },
    };
  }

  /**
   * Sugestões de autocomplete inteligente por setor
   */
  async getSearchSuggestions(
    sector: SectorType | 'TODOS',
    query: string,
    factoryUnitId: number,
    componentType?: 'CABEDAL' | 'PECA_CORTADA',
    context?: OperatorContext,
  ) {
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
      if (context) Object.assign(where, withAndCondition(where, stockItemScopeWhere(context)));
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
          AND: context ? [stockItemScopeWhere(context)] : undefined,
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

    const apoioIdentifierField = componentType === 'CABEDAL' ? 'sku' : 'pieceCode';
    const items = await prisma.stockItem.findMany({
      where: {
        factoryUnitId,
        sector,
        AND: context ? [stockItemScopeWhere(context)] : undefined,
        ...(sector === 'APOIO' ? {
          quantity: { gt: 0 },
          ...(componentType ? { componentType } : {}),
        } : { quantity: { gt: 0 } }),
        ...(rawQ
          ? {
              OR: sector === 'APOIO'
                ? componentType
                  ? [{ [apoioIdentifierField]: { equals: rawQ, mode: 'insensitive' } }]
                  : [
                      { sku: { equals: rawQ, mode: 'insensitive' } },
                      { pieceCode: { equals: rawQ, mode: 'insensitive' } },
                    ]
                : [
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

    if (sector === 'APOIO') {
      return items
        .map(item => ({
          id: item.id,
          componentType: item.componentType,
          sku: item.componentType === 'CABEDAL' ? item.sku || '' : item.pieceCode || '',
          modelName: item.productName || '',
          description: item.description || item.name || item.materialColor || '',
          sizeGrades: item.sizeGrade ? [item.sizeGrade] : [],
          color: item.color || item.materialColor || '',
          footSides: item.footSide ? [item.footSide] : [],
          availableQuantity: Number(item.quantity || 0),
        }))
        .filter(item => item.sku);
    }

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
  async getCombinations(sector: SectorType | 'TODOS', query: string, factoryUnitId: number, context?: OperatorContext): Promise<string[]> {
    const rawQ = query ? query.trim() : '';

    if (sector === 'TODOS') {
      const items = await prisma.stockItem.findMany({
        where: withAndCondition({
          factoryUnitId,
          sector: { in: ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'] },
          OR: [
            { color: { not: null, ...(rawQ ? { contains: rawQ, mode: 'insensitive' } : {}) } },
            { materialColor: { not: null, ...(rawQ ? { contains: rawQ, mode: 'insensitive' } : {}) } },
          ],
        }, context ? stockItemScopeWhere(context) : {}) as Prisma.StockItemWhereInput,
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
      where: withAndCondition({
        factoryUnitId,
        sector: sectorCondition,
        color: {
          not: null,
          ...(rawQ ? { contains: rawQ, mode: 'insensitive' } : {}),
        },
      }, context ? stockItemScopeWhere(context) : {}) as Prisma.StockItemWhereInput,
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
