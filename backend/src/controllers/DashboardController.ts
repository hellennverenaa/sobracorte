import { requestStockAccess, assignedStockSector, sectorAccessWhere, StockAccessError } from '../auth/stockAccess';
import { pairCompatibilitySql } from '../services/pairCompatibilitySql';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { normalizeUnit } from '../utils/unitHelper';

export class DashboardController {
  /**
   * Endpoint Central Consolidado: Single Round-Trip para o Dashboard Multi-Setor
   * Retorna { stats, setores, volumePorSetor, distribuicao, origemSobras, topSobrasEntrada } em 1 única requisição HTTP
   */
  async getSummary(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const assignedSector = assignedStockSector(requestStockAccess(req));
      const scope = sectorAccessWhere(requestStockAccess(req));
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalMaterialsCount,
        totalStockItemsCount,
        lowStockMaterialsCount,
        lowStockStockItemsCount,
        stockMovementsCount,
        corteMovementsCount,
        stockEntriesCount,
        corteEntriesCount,
        stockExitsCount,
        corteExitsCount,
        materialDistribution,
        stockOrigem,
        corteOrigem,
        stagnantMaterialsCount,
        stagnantStockItemsCount,
        // Agregações por setor (Volume e Contagens)
        corteQtyAgg,
        apoioCount,
        apoioQtyAgg,
        preFabCount,
        preFabQtyAgg,
        expedicaoCount,
        expedicaoQtyAgg,
        montagemCount,
        montagemQtyAgg,
        paresCasadosCount,
        paresRequisicaoCount,
        paresFormaveisRaw,
        feetSidesRaw,
        // Entradas / Saídas / Parados por setor
        apoioEntriesCount,
        preFabEntriesCount,
        expedicaoEntriesCount,
        montagemEntriesCount,
        apoioExitsCount,
        preFabExitsCount,
        expedicaoExitsCount,
        montagemExitsCount,
        apoioStagnantCount,
        preFabStagnantCount,
        expedicaoStagnantCount,
        montagemStagnantCount,
        // Top 5 Entradas de Sobras (Corte & Multi-Setor)
        topCorteEntradas,
        topStockEntradas,
        // 🚀 SQL Window Function: Top 5 Materiais Acumulados particionados por Unidade de Medida
        topRankedMaterialsByUnit,
      ] = await Promise.all([
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: 'CORTE' } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: { not: 'CORTE' } } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: 'CORTE', quantity: { lte: 10 } } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: { not: 'CORTE' }, quantity: { lte: 10 } } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: { not: 'CORTE' } } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'CORTE' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: { not: 'CORTE' }, type: 'ENTRADA' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'CORTE', type: 'ENTRADA' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: { not: 'CORTE' }, type: { in: ['SAIDA', 'REFUGO', 'CASAMENTO_PAR', 'SAIDA_REQUISICAO'] } } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'CORTE', type: { in: ['SAIDA', 'REFUGO', 'SAIDA_REQUISICAO'] } } }),
        prisma.stockItem.groupBy({
          by: ['type'],
          where: { factoryUnitId, AND: [scope], sector: 'CORTE' },
          _count: { _all: true },
        }),
        prisma.stockMovement.groupBy({
          by: ['sector', 'origem'],
          where: {
            factoryUnitId, AND: [scope],
            sector: { not: 'CORTE' },
            type: 'ENTRADA',
            origem: { not: null },
          },
          _sum: { quantity: true },
          _count: { _all: true },
        }),
        prisma.stockMovement.groupBy({
          by: ['origem'],
          where: {
            factoryUnitId, AND: [scope],
            sector: 'CORTE', type: 'ENTRADA',
            origem: { not: null },
          },
          _sum: { quantity: true },
          _count: { _all: true },
        }),
        prisma.stockItem.count({
          where: {
            factoryUnitId, AND: [scope], sector: 'CORTE',
            quantity: { gt: 0 },
            updatedAt: { lte: thirtyDaysAgo }
          }
        }),
        prisma.stockItem.count({
          where: {
            factoryUnitId, AND: [scope],
            quantity: { gt: 0 },
            updatedAt: { lte: thirtyDaysAgo }
          }
        }),
        // Quantidades por setor
        prisma.stockItem.aggregate({
          where: { factoryUnitId, AND: [scope], sector: 'CORTE' },
          _sum: { quantity: true }
        }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: 'APOIO' } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, AND: [scope], sector: 'APOIO' }, _sum: { quantity: true } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: 'PRE_FABRICADO' } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, AND: [scope], sector: 'PRE_FABRICADO' }, _sum: { quantity: true } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] } } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, AND: [scope], sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] } }, _sum: { quantity: true } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: 'MONTAGEM', quantity: { gt: 0 } } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, AND: [scope], sector: 'MONTAGEM', quantity: { gt: 0 } }, _sum: { quantity: true } }),
        prisma.stockMovement.aggregate({ where: { factoryUnitId, AND: [scope], type: 'CASAMENTO_PAR' }, _sum: { quantity: true } }),
        prisma.stockMovement.aggregate({ where: { factoryUnitId, AND: [scope], sector: 'MONTAGEM', type: 'SAIDA_REQUISICAO', origem: { contains: 'Atendimento de Requisição (Pé' } }, _sum: { quantity: true } }),
        // Consulta Otimizada de Pares Formáveis Agrupados por Setor (Montagem, Pré-Fabricado, Distribuição)
        prisma.$queryRaw<Array<{ sector: string; totalFormable: number }>>`
          SELECT 
            e.sector::text AS sector,
            COALESCE(SUM(LEAST(e.quantity, d.quantity)), 0) AS "totalFormable"
          FROM sobra_corte."StockItem" e
          INNER JOIN sobra_corte."StockItem" d
            ON ${pairCompatibilitySql}
          WHERE e."factoryUnitId" = ${factoryUnitId} AND (${assignedSector}::text IS NULL OR (CASE WHEN e.sector::text = 'EXPEDICAO' THEN 'DISTRIBUICAO' ELSE e.sector::text END) = ${assignedSector}::text)
            AND e.sector IN ('MONTAGEM', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO')
            AND e."footSide" = 'E'
            AND d."footSide" = 'D'
            AND e.quantity > 0
            AND d.quantity > 0
          GROUP BY e.sector
        `,
        // Consulta Agrupada de Pés Esquerdos e Direitos por Setor
        prisma.stockItem.groupBy({
          by: ['sector', 'footSide'],
          where: {
            factoryUnitId, AND: [scope],
            footSide: { in: ['E', 'D'] },
            quantity: { gt: 0 },
          },
          _sum: { quantity: true },
        }),
        // Entradas por setor
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'APOIO', type: 'ENTRADA' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'PRE_FABRICADO', type: 'ENTRADA' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] }, type: 'ENTRADA' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'MONTAGEM', type: 'ENTRADA' } }),
        // Saídas por setor
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'APOIO', type: { in: ['SAIDA', 'REFUGO', 'SAIDA_REQUISICAO'] } } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'PRE_FABRICADO', type: { in: ['SAIDA', 'REFUGO', 'SAIDA_REQUISICAO'] } } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] }, type: { in: ['SAIDA', 'REFUGO', 'SAIDA_REQUISICAO'] } } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'MONTAGEM', type: { in: ['SAIDA', 'REFUGO', 'CASAMENTO_PAR', 'SAIDA_REQUISICAO'] } } }),
        // Parados >30d por setor
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: 'APOIO', quantity: { gt: 0 }, updatedAt: { lte: thirtyDaysAgo } } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: 'PRE_FABRICADO', quantity: { gt: 0 }, updatedAt: { lte: thirtyDaysAgo } } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: { in: ['DISTRIBUICAO', 'EXPEDICAO'] }, quantity: { gt: 0 }, updatedAt: { lte: thirtyDaysAgo } } }),
        prisma.stockItem.count({ where: { factoryUnitId, AND: [scope], sector: 'MONTAGEM', quantity: { gt: 0 }, updatedAt: { lte: thirtyDaysAgo } } }),
        // Agrupamento de maiores entradas acumuladas
        prisma.stockMovement.groupBy({
          by: ['stockItemId', 'itemUnit'],
          where: { factoryUnitId, AND: [scope], sector: 'CORTE', type: 'ENTRADA' },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 10
        }),
        prisma.stockMovement.groupBy({
          by: ['stockItemId', 'sector', 'itemUnit'],
          where: { factoryUnitId, AND: [scope], sector: { not: 'CORTE' }, type: 'ENTRADA', stockItemId: { not: null } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 10
        }),
        // 🚀 SQL Window Function: Top 5 Materiais Acumulados particionados por Setor e Unidade de Medida (Multi-Setor)
        prisma.$queryRaw<Array<{
          id: number;
          code: string;
          name: string;
          quantity: string | number;
          sector: string;
          unitId: number | null;
          unit: string;
          type: string | null;
          position: number | bigint;
          global_position: number | bigint;
        }>>`
          SELECT 
            ranked.id, 
            ranked.code, 
            ranked.name, 
            ranked.quantity, 
            ranked.sector,
            ranked."unitId", 
            ranked.unit, 
            ranked.type, 
            ranked.position,
            ranked.global_position
          FROM (
            SELECT 
              base.id,
              base.code,
              base.name,
              base.quantity,
              base.sector,
              base."unitId",
              base.unit,
              base.type,
              ROW_NUMBER() OVER (
                PARTITION BY base.sector, base.unit 
                ORDER BY base.quantity DESC, base.id ASC
              ) AS position,
              ROW_NUMBER() OVER (
                PARTITION BY base.unit 
                ORDER BY base.quantity DESC, base.id ASC
              ) AS global_position
            FROM (
              SELECT 
                m.id, 
                m.code, 
                m.name, 
                m.quantity, 
                'CORTE'::text AS sector,
                u.id AS "unitId", 
                COALESCE(u.symbol, UPPER(TRIM(COALESCE(m.unit, 'M²')))) AS unit, 
                m.type
              FROM sobra_corte."StockItem" m
              LEFT JOIN sobra_corte."UnitConfig" u 
                ON (LOWER(TRIM(u.symbol)) = LOWER(TRIM(m.unit)) OR LOWER(TRIM(u.name)) = LOWER(TRIM(m.unit)))
                AND u."factoryUnitId" = m."factoryUnitId"
              WHERE m."factoryUnitId" = ${factoryUnitId} AND (${assignedSector}::text IS NULL OR (CASE WHEN m.sector::text = 'EXPEDICAO' THEN 'DISTRIBUICAO' ELSE m.sector::text END) = ${assignedSector}::text) AND m.sector = 'CORTE'
                AND m.quantity > 0

              UNION ALL

              SELECT 
                s.id, 
                COALESCE(s.code, s."pieceCode", s.sku, s."productName", 'ITEM-' || s.id::text) AS code,
                COALESCE(
                  s.name, 
                  s.description, 
                  s."productName", 
                  s.sku, 
                  CASE 
                    WHEN s.sector = 'MONTAGEM' THEN 'Calçado Montagem'
                    WHEN s.sector = 'PRE_FABRICADO' THEN 'Sola Pré-Fabricado'
                    WHEN s.sector = 'APOIO' THEN 'Componente Apoio'
                    ELSE 'Item Estoque'
                  END
                ) || CASE 
                  WHEN s."sizeGrade" IS NOT NULL AND s."sizeGrade" != '' AND s."footSide" IS NOT NULL THEN ' (Tam ' || s."sizeGrade" || ' - Pé ' || s."footSide"::text || ')'
                  WHEN s."sizeGrade" IS NOT NULL AND s."sizeGrade" != '' THEN ' (Tam ' || s."sizeGrade" || ')'
                  WHEN s."footSide" IS NOT NULL THEN ' (Pé ' || s."footSide"::text || ')'
                  ELSE ''
                END AS name,
                s.quantity,
                s.sector::text AS sector,
                u.id AS "unitId",
                COALESCE(u.symbol, UPPER(TRIM(COALESCE(s.unit, 'UND')))) AS unit,
                COALESCE(s.type, s.color, s.sector::text) AS type
              FROM sobra_corte."StockItem" s
              LEFT JOIN sobra_corte."UnitConfig" u 
                ON (LOWER(TRIM(u.symbol)) = LOWER(TRIM(s.unit)) OR LOWER(TRIM(u.name)) = LOWER(TRIM(s.unit)))
                AND u."factoryUnitId" = s."factoryUnitId"
              WHERE s."factoryUnitId" = ${factoryUnitId} AND (${assignedSector}::text IS NULL OR (CASE WHEN s.sector::text = 'EXPEDICAO' THEN 'DISTRIBUICAO' ELSE s.sector::text END) = ${assignedSector}::text) AND s.sector <> 'CORTE'
                AND s.quantity > 0
            ) base
          ) ranked
          WHERE ranked.position <= 5 OR ranked.global_position <= 5
          ORDER BY ranked.sector ASC, ranked.unit ASC, ranked.position ASC
        `,
      ]);

      const distribuicaoPorSetorUnidadeRaw = await prisma.$queryRaw<Array<{
        sector: string;
        unit: string;
        totalQuantity: string | number;
        itemsCount: number | bigint;
      }>>`
        SELECT
          s.sector::text AS sector,
          UPPER(TRIM(COALESCE(u.symbol, s.unit, CASE WHEN s.sector = 'CORTE' THEN 'M²' ELSE 'UND' END))) AS unit,
          SUM(s.quantity) AS "totalQuantity",
          COUNT(*)::integer AS "itemsCount"
        FROM sobra_corte."StockItem" s
        LEFT JOIN LATERAL (
          SELECT u.symbol
          FROM sobra_corte."UnitConfig" u
          WHERE u."factoryUnitId" = s."factoryUnitId"
            AND (LOWER(TRIM(u.symbol)) = LOWER(TRIM(s.unit)) OR LOWER(TRIM(u.name)) = LOWER(TRIM(s.unit)))
          ORDER BY u.id
          LIMIT 1
        ) u ON TRUE
        WHERE s."factoryUnitId" = ${factoryUnitId} AND (${assignedSector}::text IS NULL OR (CASE WHEN s.sector::text = 'EXPEDICAO' THEN 'DISTRIBUICAO' ELSE s.sector::text END) = ${assignedSector}::text) AND s.quantity > 0
        GROUP BY s.sector, UPPER(TRIM(COALESCE(u.symbol, s.unit, CASE WHEN s.sector = 'CORTE' THEN 'M²' ELSE 'UND' END)))
        ORDER BY s.sector, unit
      `;

      const totalEntries = stockEntriesCount + corteEntriesCount;
      const totalExits = stockExitsCount + corteExitsCount;
      const taxaReaproveitamento = totalEntries > 0 ? Math.min(100, Math.round((totalExits / totalEntries) * 100)) : 0;
      const totalParadosSemGiro = stagnantMaterialsCount + stagnantStockItemsCount;
      const distribuicaoPorSetorUnidade = (distribuicaoPorSetorUnidadeRaw || []).map(d => ({
        sector: String(d.sector),
        unit: normalizeUnit(d.unit, d.sector),
        totalQuantity: Number(d.totalQuantity) || 0,
        itemsCount: Number(d.itemsCount) || 0,
      }));
      const quantitiesBySector = (sector: string) => {
        const totals: Record<string, number> = {};
        for (const row of distribuicaoPorSetorUnidade) {
          if (row.sector !== sector && !(sector === 'DISTRIBUICAO' && row.sector === 'EXPEDICAO')) continue;
          totals[row.unit] = (totals[row.unit] || 0) + row.totalQuantity;
        }
        return totals;
      };
      const singleUnitTotal = (sector: string) => {
        const values = quantitiesBySector(sector);
        const units = Object.keys(values);
        return units.length === 1 ? values[units[0]] : null;
      };

      // 1. Mapeamento de Pares Formáveis e Pés E / D por Setor
      const formableMap = new Map<string, number>();
      for (const row of paresFormaveisRaw || []) {
        formableMap.set(String(row.sector), Number(row.totalFormable) || 0);
      }

      const feetMap = new Map<string, { E: number; D: number }>();
      for (const row of feetSidesRaw || []) {
        if (!row.sector) continue;
        const s = String(row.sector);
        const side = row.footSide === 'E' ? 'E' : (row.footSide === 'D' ? 'D' : null);
        if (!side) continue;
        const prev = feetMap.get(s) || { E: 0, D: 0 };
        prev[side] += Number(row._sum?.quantity) || 0;
        feetMap.set(s, prev);
      }

      const preFabFormable = formableMap.get('PRE_FABRICADO') || 0;
      const preFabFeet = feetMap.get('PRE_FABRICADO') || { E: 0, D: 0 };

      const expedicaoFormable = (formableMap.get('DISTRIBUICAO') || 0) + (formableMap.get('EXPEDICAO') || 0);
      const expedicaoFeet = {
        E: (feetMap.get('DISTRIBUICAO')?.E || 0) + (feetMap.get('EXPEDICAO')?.E || 0),
        D: (feetMap.get('DISTRIBUICAO')?.D || 0) + (feetMap.get('EXPEDICAO')?.D || 0),
      };

      const montagemFormable = formableMap.get('MONTAGEM') || 0;
      const montagemFeet = feetMap.get('MONTAGEM') || { E: 0, D: 0 };

      const totalParesFormaveisGlobal = montagemFormable + preFabFormable + expedicaoFormable;
      const totalParesCasados = Math.floor(
        ((Number(paresCasadosCount._sum?.quantity) || 0) +
         (Number(paresRequisicaoCount._sum?.quantity) || 0)) / 2
      );

      // 1. Métricas / KPIs consolidados globais
      const stats = {
        totalMaterials: totalMaterialsCount,
        totalMultiSetorItems: totalStockItemsCount,
        totalItems: totalMaterialsCount + totalStockItemsCount,
        lowStock: lowStockMaterialsCount + lowStockStockItemsCount,
        totalMovements: stockMovementsCount + corteMovementsCount,
        totalEntries,
        totalExits,
        taxaReaproveitamento,
        totalParadosSemGiro,
        totalParesFormaveis: totalParesFormaveisGlobal,
        totalParesCasados,
      };

      // 2. Métricas Setorizadas (Cards de Detalhes dos 5 Setores)
      const [
        corteStockEntries,
        corteStockExits,
        corteStockExitsAgg,
        apoioStockExitsAgg,
      ] = await Promise.all([
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'CORTE', type: 'ENTRADA' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, AND: [scope], sector: 'CORTE', type: { in: ['SAIDA', 'REFUGO', 'SAIDA_REQUISICAO'] } } }),
        prisma.stockMovement.groupBy({ by: ['itemUnit'], where: { factoryUnitId, AND: [scope], sector: 'CORTE', type: { in: ['SAIDA', 'REFUGO', 'SAIDA_REQUISICAO'] } }, _sum: { quantity: true } }),
        prisma.stockMovement.groupBy({ by: ['itemUnit'], where: { factoryUnitId, AND: [scope], sector: 'APOIO', type: { in: ['SAIDA', 'REFUGO', 'SAIDA_REQUISICAO'] } }, _sum: { quantity: true } }),
      ]);

      const corteTotalEntries = corteStockEntries;
      const corteTotalExits = corteStockExits;
      const exitVolumes = (groups: typeof corteStockExitsAgg, sector: string) => {
        const totals: Record<string, number> = {};
        for (const group of groups) {
          const unit = normalizeUnit(group.itemUnit, sector);
          totals[unit] = (totals[unit] || 0) + Number(group._sum.quantity || 0);
        }
        return totals;
      };
      const corteExitsByUnit = exitVolumes(corteStockExitsAgg, 'CORTE');
      const apoioExitsByUnit = exitVolumes(apoioStockExitsAgg, 'APOIO');
      const singleExitVolume = (totals: Record<string, number>) => Object.keys(totals).length === 1 ? Object.values(totals)[0] : null;
      const corteTotalExitsVolume = singleExitVolume(corteExitsByUnit);
      const apoioTotalExitsVolume = singleExitVolume(apoioExitsByUnit);
      const montagemTotalEntries = montagemEntriesCount;
      const montagemTotalExits = montagemExitsCount;

      const setores = {
        corte: {
          itemsCount: totalMaterialsCount,
          totalQuantity: singleUnitTotal('CORTE'),
          quantitiesByUnit: quantitiesBySector('CORTE'),
          unit: Object.keys(quantitiesBySector('CORTE')).length === 1 ? Object.keys(quantitiesBySector('CORTE'))[0] : null,
          totalEntries: corteTotalEntries,
          totalExits: corteTotalExits,
          totalExitsVolume: corteTotalExitsVolume,
          exitsByUnit: corteExitsByUnit,
          taxaReaproveitamento: corteTotalEntries > 0 ? Math.min(100, Math.round((corteTotalExits / corteTotalEntries) * 100)) : 0,
          totalParadosSemGiro: stagnantMaterialsCount,
        },
        apoio: {
          itemsCount: apoioCount,
          totalQuantity: singleUnitTotal('APOIO'),
          quantitiesByUnit: quantitiesBySector('APOIO'),
          unit: 'PÇS',
          totalEntries: apoioEntriesCount,
          totalExits: apoioExitsCount,
          totalExitsVolume: apoioTotalExitsVolume,
          exitsByUnit: apoioExitsByUnit,
          taxaReaproveitamento: apoioEntriesCount > 0 ? Math.min(100, Math.round((apoioExitsCount / apoioEntriesCount) * 100)) : 0,
          totalParadosSemGiro: apoioStagnantCount,
        },
        preFabricado: {
          itemsCount: preFabCount,
          totalQuantity: singleUnitTotal('PRE_FABRICADO'),
          quantitiesByUnit: quantitiesBySector('PRE_FABRICADO'),
          unit: 'PARES/PÉS',
          totalEntries: preFabEntriesCount,
          totalExits: preFabExitsCount,
          taxaReaproveitamento: preFabEntriesCount > 0 ? Math.min(100, Math.round((preFabExitsCount / preFabEntriesCount) * 100)) : 0,
          totalParadosSemGiro: preFabStagnantCount,
          peEsq: preFabFeet.E,
          peDir: preFabFeet.D,
          paresFormaveis: preFabFormable,
          paresCasados: 0,
        },
        expedicao: {
          itemsCount: expedicaoCount,
          totalQuantity: singleUnitTotal('EXPEDICAO'),
          quantitiesByUnit: quantitiesBySector('EXPEDICAO'),
          unit: 'PÇS/UN',
          totalEntries: expedicaoEntriesCount,
          totalExits: expedicaoExitsCount,
          taxaReaproveitamento: expedicaoEntriesCount > 0 ? Math.min(100, Math.round((expedicaoExitsCount / expedicaoEntriesCount) * 100)) : 0,
          totalParadosSemGiro: expedicaoStagnantCount,
          peEsq: expedicaoFeet.E,
          peDir: expedicaoFeet.D,
          paresFormaveis: expedicaoFormable,
          paresCasados: 0,
        },
        distribuicao: {
          itemsCount: expedicaoCount,
          totalQuantity: singleUnitTotal('DISTRIBUICAO'),
          quantitiesByUnit: quantitiesBySector('DISTRIBUICAO'),
          unit: 'PÇS/UN',
          totalEntries: expedicaoEntriesCount,
          totalExits: expedicaoExitsCount,
          taxaReaproveitamento: expedicaoEntriesCount > 0 ? Math.min(100, Math.round((expedicaoExitsCount / expedicaoEntriesCount) * 100)) : 0,
          totalParadosSemGiro: expedicaoStagnantCount,
          peEsq: expedicaoFeet.E,
          peDir: expedicaoFeet.D,
          paresFormaveis: expedicaoFormable,
          paresCasados: 0,
        },
        montagem: {
          itemsCount: montagemCount,
          totalQuantity: singleUnitTotal('MONTAGEM'),
          quantitiesByUnit: quantitiesBySector('MONTAGEM'),
          unit: 'PÉS',
          totalEntries: montagemTotalEntries,
          totalExits: montagemTotalExits,
          taxaReaproveitamento: montagemTotalEntries > 0 ? Math.min(100, Math.round((montagemTotalExits / montagemTotalEntries) * 100)) : 0,
          totalParadosSemGiro: montagemStagnantCount,
          peEsq: montagemFeet.E,
          peDir: montagemFeet.D,
          paresCasados: totalParesCasados,
          paresFormaveis: montagemFormable,
        },
      };

      // 3. Distribuição do Volume por Setor
      const volumePorSetor = [
        { sector: 'CORTE', label: 'Corte (Matéria-Prima)', count: totalMaterialsCount, quantity: null, color: '#047857' },
        { sector: 'APOIO', label: 'Apoio (Moldes/Peças)', count: apoioCount, quantity: null, color: '#0284c7' },
        { sector: 'PRE_FABRICADO', label: 'Pré-Fabricado (Solas)', count: preFabCount, quantity: null, color: '#f59e0b' },
        { sector: 'DISTRIBUICAO', label: 'Distribuição (Cabedais/Solas)', count: expedicaoCount, quantity: null, color: '#8b5cf6' },
        { sector: 'MONTAGEM', label: 'Montagem (Pés Órfãos)', count: montagemCount, quantity: null, color: '#ec4899' },
      ];

      // 4. Mesclagem e ordenação da origem das sobras (global e por setor)
      const globalOrigemMap = new Map<string, { count: number }>();
      const sectorOrigemMap: Record<string, Map<string, { count: number }>> = {
        CORTE: new Map(),
        APOIO: new Map(),
        PRE_FABRICADO: new Map(),
        DISTRIBUICAO: new Map(),
        EXPEDICAO: new Map(),
        MONTAGEM: new Map(),
      };

      for (const item of corteOrigem) {
        if (item.origem) {
          const norm = item.origem.trim();
          const count = Number(item._count?._all) || 1;

          const gPrev = globalOrigemMap.get(norm) || { count: 0 };
          globalOrigemMap.set(norm, { count: gPrev.count + count });

          const cPrev = sectorOrigemMap.CORTE.get(norm) || { count: 0 };
          sectorOrigemMap.CORTE.set(norm, { count: cPrev.count + count });
        }
      }

      // StockMovement por setor
      for (const item of stockOrigem) {
        if (item.origem) {
          const norm = item.origem.trim();
          const count = Number(item._count?._all) || 1;
          const sec = item.sector || 'CORTE';

          const gPrev = globalOrigemMap.get(norm) || { count: 0 };
          globalOrigemMap.set(norm, { count: gPrev.count + count });

          if (!sectorOrigemMap[sec]) {
            sectorOrigemMap[sec] = new Map();
          }
          const sPrev = sectorOrigemMap[sec].get(norm) || { count: 0 };
          sectorOrigemMap[sec].set(norm, { count: sPrev.count + count });
        }
      }

      // Cálculo percentual global
      const totalGlobalEntries = Array.from(globalOrigemMap.values()).reduce((acc, v) => acc + v.count, 0);
      const origemSobras = Array.from(globalOrigemMap.entries())
        .map(([origem, val]) => ({
          origem,
          name: origem,
          count: val.count,
          percentage: totalGlobalEntries > 0 ? (val.count / totalGlobalEntries) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Cálculo percentual por setor
      const origensPorSetor: Record<string, Array<{ origem: string; name: string; count: number; percentage: number }>> = {};
      for (const [sec, map] of Object.entries(sectorOrigemMap)) {
        const totalSectorEntries = Array.from(map.values()).reduce((acc, v) => acc + v.count, 0);
        origensPorSetor[sec] = Array.from(map.entries())
          .map(([origem, val]) => ({
            origem,
            name: origem,
            count: val.count,
            percentage: totalSectorEntries > 0 ? (val.count / totalSectorEntries) * 100 : 0,
          }))
          .sort((a, b) => b.count - a.count);
      }

      // 5. Hidratação dos Top 5 Entradas de Sobras (Corte + Multi-Setor)
      const stockItemIds = [...new Set([...topCorteEntradas, ...topStockEntradas]
        .map(e => e.stockItemId).filter((id): id is number => id !== null))];
      const stockItemsList = stockItemIds.length > 0
        ? await prisma.stockItem.findMany({
            where: { factoryUnitId, AND: [scope], id: { in: stockItemIds } },
            select: { id: true, code: true, name: true, pieceCode: true, description: true, productName: true, sku: true, unit: true, sector: true },
          })
        : [];
      const stockItemMap = new Map(stockItemsList.map(s => [s.id, s]));

      const topSobrasEntrada: Array<{
        id: string | number;
        code: string;
        name: string;
        sector: string;
        totalQuantity: number;
        unit: string;
        origin: string;
      }> = [];

      for (const leg of topCorteEntradas) {
        const mat = leg.stockItemId ? stockItemMap.get(leg.stockItemId) : null;
        if (mat?.sector === 'CORTE') {
          topSobrasEntrada.push({
            id: `mat_${mat.id}`,
            code: mat.code || '-',
            name: mat.name || '-',
            sector: 'CORTE',
            totalQuantity: Number(leg._sum?.quantity) || 0,
            unit: normalizeUnit(leg.itemUnit, 'CORTE'),
            origin: 'Corte / Produção'
          });
        }
      }

      for (const stk of topStockEntradas) {
        if (!stk.stockItemId) continue;
        const item = stockItemMap.get(stk.stockItemId);
        if (item) {
          topSobrasEntrada.push({
            id: `stk_${item.id}`,
            code: item.code || item.pieceCode || item.sku || item.productName || `Item #${item.id}`,
            name: item.name || item.description || item.productName || item.sku || 'Componente',
            sector: stk.sector || item.sector || 'APOIO',
            totalQuantity: Number(stk._sum?.quantity) || 0,
            unit: normalizeUnit(stk.itemUnit, stk.sector),
            origin: 'Geração no Setor'
          });
        }
      }

      // Ordenar decrescente pela quantidade acumulada de entradas
      topSobrasEntrada.sort((a, b) => a.unit.localeCompare(b.unit) || b.totalQuantity - a.totalQuantity);

      // 6. Estruturação do Top 5 particionado por Setor e por Unidade via Window Function (Multi-Setor)
      const topMateriaisPorSetorEUnidade: Record<string, Record<string, Array<{
        id: number;
        code: string;
        name: string;
        quantity: number;
        sector: string;
        unitId: number | null;
        unit: string;
        type: string;
        position: number;
      }>>> = {
        TODOS: {},
        CORTE: {},
        APOIO: {},
        PRE_FABRICADO: {},
        DISTRIBUICAO: {},
        EXPEDICAO: {},
        MONTAGEM: {},
      };

      const topMateriaisPorUnidade: Record<string, Array<{
        id: number;
        code: string;
        name: string;
        quantity: number;
        sector: string;
        unitId: number | null;
        unit: string;
        type: string;
        position: number;
      }>> = {};

      const unidadesSetPorSetor: Record<string, Set<string>> = {
        TODOS: new Set(),
        CORTE: new Set(),
        APOIO: new Set(),
        PRE_FABRICADO: new Set(),
        DISTRIBUICAO: new Set(),
        EXPEDICAO: new Set(),
        MONTAGEM: new Set(),
      };

      const topMateriaisList: any[] = [];

      for (const row of topRankedMaterialsByUnit || []) {
        const sec = String(row.sector || 'CORTE').toUpperCase().trim();
        const u = String(row.unit || (sec === 'CORTE' ? 'M²' : 'UND')).toUpperCase().trim();
        const item = {
          id: row.id,
          code: row.code,
          name: row.name,
          quantity: Number(row.quantity) || 0,
          sector: sec,
          unitId: row.unitId ? Number(row.unitId) : null,
          unit: u,
          type: row.type || '',
          position: Number(row.position) || 1,
          globalPosition: Number(row.global_position) || 1,
        };

        topMateriaisList.push(item);

        // Ranking Setorial (Top 5 do Setor)
        if (Number(row.position) <= 5) {
          if (!topMateriaisPorSetorEUnidade[sec]) topMateriaisPorSetorEUnidade[sec] = {};
          if (!topMateriaisPorSetorEUnidade[sec][u]) topMateriaisPorSetorEUnidade[sec][u] = [];
          topMateriaisPorSetorEUnidade[sec][u].push(item);
          unidadesSetPorSetor[sec]?.add(u);

          if (sec === 'DISTRIBUICAO') {
            if (!topMateriaisPorSetorEUnidade.EXPEDICAO) topMateriaisPorSetorEUnidade.EXPEDICAO = {};
            if (!topMateriaisPorSetorEUnidade.EXPEDICAO[u]) topMateriaisPorSetorEUnidade.EXPEDICAO[u] = [];
            topMateriaisPorSetorEUnidade.EXPEDICAO[u].push(item);
            unidadesSetPorSetor.EXPEDICAO?.add(u);
          }
        }

        // Ranking Global (Top 5 Fabril na Unidade)
        if (Number(row.global_position) <= 5) {
          if (!topMateriaisPorUnidade[u]) topMateriaisPorUnidade[u] = [];
          if (!topMateriaisPorSetorEUnidade.TODOS[u]) topMateriaisPorSetorEUnidade.TODOS[u] = [];

          if (!topMateriaisPorUnidade[u].some(e => e.id === item.id && e.sector === item.sector)) {
            topMateriaisPorUnidade[u].push(item);
            topMateriaisPorSetorEUnidade.TODOS[u].push(item);
            unidadesSetPorSetor.TODOS.add(u);
          }
        }
      }

      // Distribuição global por unidade, derivada do agrupamento setorial acima.
      const distribuicaoPorUnidade = Array.from(distribuicaoPorSetorUnidade.reduce((map, row) => {
        const current = map.get(row.unit) || { unit: row.unit, totalQuantity: 0, itemsCount: 0 };
        current.totalQuantity += row.totalQuantity;
        current.itemsCount += row.itemsCount;
        map.set(row.unit, current);
        return map;
      }, new Map<string, { unit: string; totalQuantity: number; itemsCount: number }>()).values());

      // Ordenador de unidades para dar preferência intuitiva a M² (Corte) e UND/PAR (outros setores)
      const sortUnits = (units: string[]) => {
        return units.sort((a, b) => {
          if (a === 'M²' || a === 'M2') return -1;
          if (b === 'M²' || b === 'M2') return 1;
          if (a === 'UND') return -1;
          if (b === 'UND') return 1;
          return a.localeCompare(b);
        });
      };

      const unidadesPorSetor: Record<string, string[]> = {};
      for (const [sec, set] of Object.entries(unidadesSetPorSetor)) {
        unidadesPorSetor[sec] = sortUnits(Array.from(set));
      }

      const unidadesDisponiveis = sortUnits(Array.from(unidadesSetPorSetor.TODOS));

      return res.json({
        stats,
        setores,
        volumePorSetor,
        distribuicao: materialDistribution,
        distribuicaoPorUnidade,
        origemSobras,
        origensPorSetor,
        topSobrasEntrada,
        topMateriais: topMateriaisList,
        topMateriaisPorUnidade,
        topMateriaisPorSetorEUnidade,
        unidadesDisponiveis,
        unidadesPorSetor,
      });
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro analítico ao processar resumo consolidado do dashboard:', error);
      return res.status(500).json({ error: 'Erro interno ao carregar indicadores do dashboard.' });
    }
  }
}
