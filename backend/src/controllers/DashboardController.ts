import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class DashboardController {
  /**
   * Endpoint Central Consolidado: Single Round-Trip para o Dashboard Multi-Setor
   * Retorna { stats, setores, volumePorSetor, distribuicao, origemSobras, topSobrasEntrada } em 1 única requisição HTTP
   */
  async getSummary(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalMaterialsCount,
        totalStockItemsCount,
        lowStockMaterialsCount,
        lowStockStockItemsCount,
        stockMovementsCount,
        legacyMovementsCount,
        stockEntriesCount,
        legacyEntriesCount,
        stockExitsCount,
        legacyExitsCount,
        materialDistribution,
        stockOrigem,
        legacyOrigem,
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
        montagemEsqAgg,
        montagemDirAgg,
        paresCasadosCount,
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
        topLegacyEntradas,
        topStockEntradas,
      ] = await Promise.all([
        prisma.material.count({ where: { factoryUnitId } }),
        prisma.stockItem.count({ where: { factoryUnitId } }),
        prisma.material.count({ where: { factoryUnitId, quantity: { lte: 10 } } }),
        prisma.stockItem.count({ where: { factoryUnitId, quantity: { lte: 10 } } }),
        prisma.stockMovement.count({ where: { factoryUnitId } }),
        prisma.movement.count({ where: { factoryUnitId } }),
        prisma.stockMovement.count({ where: { factoryUnitId, type: 'ENTRADA' } }),
        prisma.movement.count({ where: { factoryUnitId, type: 'entrada' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, type: { in: ['SAIDA', 'REFUGO', 'CASAMENTO_PAR'] } } }),
        prisma.movement.count({ where: { factoryUnitId, type: 'saida' } }),
        prisma.material.groupBy({
          by: ['type'],
          where: { factoryUnitId },
          _sum: { quantity: true },
        }),
        prisma.stockMovement.groupBy({
          by: ['sector', 'origem'],
          where: {
            factoryUnitId,
            type: 'ENTRADA',
            origem: { not: null },
          },
          _sum: { quantity: true },
          _count: { _all: true },
        }),
        prisma.movement.groupBy({
          by: ['origem'],
          where: {
            factoryUnitId,
            type: 'entrada',
            origem: { not: null },
          },
          _sum: { quantity: true },
          _count: { _all: true },
        }),
        prisma.material.count({
          where: {
            factoryUnitId,
            quantity: { gt: 0 },
            updatedAt: { lte: thirtyDaysAgo }
          }
        }),
        prisma.stockItem.count({
          where: {
            factoryUnitId,
            quantity: { gt: 0 },
            updatedAt: { lte: thirtyDaysAgo }
          }
        }),
        // Quantidades por setor
        prisma.material.aggregate({
          where: { factoryUnitId },
          _sum: { quantity: true }
        }),
        prisma.stockItem.count({ where: { factoryUnitId, sector: 'APOIO' } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, sector: 'APOIO' }, _sum: { quantity: true } }),
        prisma.stockItem.count({ where: { factoryUnitId, sector: 'PRE_FABRICADO' } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, sector: 'PRE_FABRICADO' }, _sum: { quantity: true } }),
        prisma.stockItem.count({ where: { factoryUnitId, sector: 'EXPEDICAO' } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, sector: 'EXPEDICAO' }, _sum: { quantity: true } }),
        prisma.stockItem.count({ where: { factoryUnitId, sector: 'MONTAGEM', quantity: { gt: 0 } } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, sector: 'MONTAGEM', quantity: { gt: 0 } }, _sum: { quantity: true } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, sector: 'MONTAGEM', footSide: 'E', quantity: { gt: 0 } }, _sum: { quantity: true } }),
        prisma.stockItem.aggregate({ where: { factoryUnitId, sector: 'MONTAGEM', footSide: 'D', quantity: { gt: 0 } }, _sum: { quantity: true } }),
        prisma.stockMovement.aggregate({ where: { factoryUnitId, type: 'CASAMENTO_PAR' }, _sum: { quantity: true } }),
        // Entradas por setor
        prisma.stockMovement.count({ where: { factoryUnitId, sector: 'APOIO', type: 'ENTRADA' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, sector: 'PRE_FABRICADO', type: 'ENTRADA' } }),
        prisma.stockMovement.count({ where: { factoryUnitId, sector: 'EXPEDICAO', type: 'ENTRADA' } }),
        prisma.stockMovement.aggregate({ where: { factoryUnitId, sector: 'MONTAGEM', type: 'ENTRADA' }, _sum: { quantity: true } }),
        // Saídas por setor
        prisma.stockMovement.count({ where: { factoryUnitId, sector: 'APOIO', type: { in: ['SAIDA', 'REFUGO'] } } }),
        prisma.stockMovement.count({ where: { factoryUnitId, sector: 'PRE_FABRICADO', type: { in: ['SAIDA', 'REFUGO'] } } }),
        prisma.stockMovement.count({ where: { factoryUnitId, sector: 'EXPEDICAO', type: { in: ['SAIDA', 'REFUGO'] } } }),
        prisma.stockMovement.aggregate({ where: { factoryUnitId, sector: 'MONTAGEM', type: { in: ['SAIDA', 'REFUGO', 'CASAMENTO_PAR'] } }, _sum: { quantity: true } }),
        // Parados >30d por setor
        prisma.stockItem.count({ where: { factoryUnitId, sector: 'APOIO', quantity: { gt: 0 }, updatedAt: { lte: thirtyDaysAgo } } }),
        prisma.stockItem.count({ where: { factoryUnitId, sector: 'PRE_FABRICADO', quantity: { gt: 0 }, updatedAt: { lte: thirtyDaysAgo } } }),
        prisma.stockItem.count({ where: { factoryUnitId, sector: 'EXPEDICAO', quantity: { gt: 0 }, updatedAt: { lte: thirtyDaysAgo } } }),
        prisma.stockItem.count({ where: { factoryUnitId, sector: 'MONTAGEM', quantity: { gt: 0 }, updatedAt: { lte: thirtyDaysAgo } } }),
        // Agrupamento de maiores entradas acumuladas
        prisma.movement.groupBy({
          by: ['materialId'],
          where: { factoryUnitId, type: 'entrada' },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 10
        }),
        prisma.stockMovement.groupBy({
          by: ['stockItemId', 'sector'],
          where: { factoryUnitId, type: 'ENTRADA', stockItemId: { not: null } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 10
        }),
      ]);

      const totalEntries = stockEntriesCount + legacyEntriesCount;
      const totalExits = stockExitsCount + legacyExitsCount;
      const taxaReaproveitamento = totalEntries > 0 ? Math.min(100, Math.round((totalExits / totalEntries) * 100)) : 0;
      const totalParadosSemGiro = stagnantMaterialsCount + stagnantStockItemsCount;

      // 1. Métricas / KPIs consolidados globais
      const stats = {
        totalMaterials: totalMaterialsCount,
        totalMultiSetorItems: totalStockItemsCount,
        totalItems: totalMaterialsCount + totalStockItemsCount,
        lowStock: lowStockMaterialsCount + lowStockStockItemsCount,
        totalMovements: stockMovementsCount + legacyMovementsCount,
        totalEntries,
        totalExits,
        taxaReaproveitamento,
        totalParadosSemGiro,
      };

      // 2. Métricas Setorizadas (Cards de Detalhes dos 5 Setores)
      const corteStockEntries = await prisma.stockMovement.count({ where: { factoryUnitId, sector: 'CORTE', type: 'ENTRADA' } });
      const corteStockExits = await prisma.stockMovement.count({ where: { factoryUnitId, sector: 'CORTE', type: { in: ['SAIDA', 'REFUGO'] } } });

      const totalParesCasados = Math.floor((Number(paresCasadosCount._sum?.quantity) || 0) / 2);

      const corteTotalEntries = legacyEntriesCount + corteStockEntries;
      const corteTotalExits = legacyExitsCount + corteStockExits;
      const montagemTotalEntries = Number(montagemEntriesCount._sum?.quantity) || 0;
      const montagemTotalExits = Number(montagemExitsCount._sum?.quantity) || 0;

      const setores = {
        corte: {
          itemsCount: totalMaterialsCount,
          totalQuantity: Number(corteQtyAgg._sum.quantity) || 0,
          unit: 'M²',
          totalEntries: corteTotalEntries,
          totalExits: corteTotalExits,
          taxaReaproveitamento: corteTotalEntries > 0 ? Math.min(100, Math.round((corteTotalExits / corteTotalEntries) * 100)) : 0,
          totalParadosSemGiro: stagnantMaterialsCount,
        },
        apoio: {
          itemsCount: apoioCount,
          totalQuantity: Number(apoioQtyAgg._sum.quantity) || 0,
          unit: 'PÇS',
          totalEntries: apoioEntriesCount,
          totalExits: apoioExitsCount,
          taxaReaproveitamento: apoioEntriesCount > 0 ? Math.min(100, Math.round((apoioExitsCount / apoioEntriesCount) * 100)) : 0,
          totalParadosSemGiro: apoioStagnantCount,
        },
        preFabricado: {
          itemsCount: preFabCount,
          totalQuantity: Number(preFabQtyAgg._sum.quantity) || 0,
          unit: 'PARES/PÉS',
          totalEntries: preFabEntriesCount,
          totalExits: preFabExitsCount,
          taxaReaproveitamento: preFabEntriesCount > 0 ? Math.min(100, Math.round((preFabExitsCount / preFabEntriesCount) * 100)) : 0,
          totalParadosSemGiro: preFabStagnantCount,
        },
        expedicao: {
          itemsCount: expedicaoCount,
          totalQuantity: Number(expedicaoQtyAgg._sum.quantity) || 0,
          unit: 'PÇS/UN',
          totalEntries: expedicaoEntriesCount,
          totalExits: expedicaoExitsCount,
          taxaReaproveitamento: expedicaoEntriesCount > 0 ? Math.min(100, Math.round((expedicaoExitsCount / expedicaoEntriesCount) * 100)) : 0,
          totalParadosSemGiro: expedicaoStagnantCount,
        },
        montagem: {
          itemsCount: montagemCount,
          totalQuantity: Number(montagemQtyAgg._sum.quantity) || 0,
          unit: 'PÉS',
          totalEntries: montagemTotalEntries,
          totalExits: montagemTotalExits,
          taxaReaproveitamento: montagemTotalEntries > 0 ? Math.min(100, Math.round((montagemTotalExits / montagemTotalEntries) * 100)) : 0,
          totalParadosSemGiro: montagemStagnantCount,
          peEsq: Number(montagemEsqAgg._sum.quantity) || 0,
          peDir: Number(montagemDirAgg._sum.quantity) || 0,
          paresCasados: totalParesCasados,
        },
      };

      // 3. Distribuição do Volume por Setor
      const volumePorSetor = [
        { sector: 'CORTE', label: 'Corte (Matéria-Prima)', count: totalMaterialsCount, quantity: Number(corteQtyAgg._sum.quantity) || 0, color: '#047857' },
        { sector: 'APOIO', label: 'Apoio (Moldes/Peças)', count: apoioCount, quantity: Number(apoioQtyAgg._sum.quantity) || 0, color: '#0284c7' },
        { sector: 'PRE_FABRICADO', label: 'Pré-Fabricado (Solas)', count: preFabCount, quantity: Number(preFabQtyAgg._sum.quantity) || 0, color: '#f59e0b' },
        { sector: 'EXPEDICAO', label: 'Expedição (Cabedais)', count: expedicaoCount, quantity: Number(expedicaoQtyAgg._sum.quantity) || 0, color: '#8b5cf6' },
        { sector: 'MONTAGEM', label: 'Montagem (Pés Órfãos)', count: montagemCount, quantity: Number(montagemQtyAgg._sum.quantity) || 0, color: '#ec4899' },
      ];

      // 4. Mesclagem e ordenação da Origem das Sobras (StockMovement + Movement legado)
      // 4. Mesclagem e ordenação da Origem das Sobras (Global e por Setor)
      const globalOrigemMap = new Map<string, { quantity: number; count: number }>();
      const sectorOrigemMap: Record<string, Map<string, { quantity: number; count: number }>> = {
        CORTE: new Map(),
        APOIO: new Map(),
        PRE_FABRICADO: new Map(),
        EXPEDICAO: new Map(),
        MONTAGEM: new Map(),
      };

      // Legacy movements pertencem a CORTE
      for (const item of legacyOrigem) {
        if (item.origem) {
          const norm = item.origem.trim();
          const qty = Number(item._sum?.quantity) || 0;
          const count = Number(item._count?._all) || 1;

          const gPrev = globalOrigemMap.get(norm) || { quantity: 0, count: 0 };
          globalOrigemMap.set(norm, { quantity: gPrev.quantity + qty, count: gPrev.count + count });

          const cPrev = sectorOrigemMap.CORTE.get(norm) || { quantity: 0, count: 0 };
          sectorOrigemMap.CORTE.set(norm, { quantity: cPrev.quantity + qty, count: cPrev.count + count });
        }
      }

      // StockMovement por setor
      for (const item of stockOrigem) {
        if (item.origem) {
          const norm = item.origem.trim();
          const qty = Number(item._sum?.quantity) || 0;
          const count = Number(item._count?._all) || 1;
          const sec = item.sector || 'CORTE';

          const gPrev = globalOrigemMap.get(norm) || { quantity: 0, count: 0 };
          globalOrigemMap.set(norm, { quantity: gPrev.quantity + qty, count: gPrev.count + count });

          if (!sectorOrigemMap[sec]) {
            sectorOrigemMap[sec] = new Map();
          }
          const sPrev = sectorOrigemMap[sec].get(norm) || { quantity: 0, count: 0 };
          sectorOrigemMap[sec].set(norm, { quantity: sPrev.quantity + qty, count: sPrev.count + count });
        }
      }

      // Cálculo percentual global
      const totalGlobalQty = Array.from(globalOrigemMap.values()).reduce((acc, v) => acc + v.quantity, 0);
      const origemSobras = Array.from(globalOrigemMap.entries())
        .map(([origem, val]) => ({
          origem,
          name: origem,
          count: val.count,
          percentage: totalGlobalQty > 0 ? (val.quantity / totalGlobalQty) * 100 : 0,
          _sum: { quantity: val.quantity },
        }))
        .sort((a, b) => b._sum.quantity - a._sum.quantity);

      // Cálculo percentual por setor
      const origensPorSetor: Record<string, Array<{ origem: string; name: string; count: number; percentage: number; _sum: { quantity: number } }>> = {};
      for (const [sec, map] of Object.entries(sectorOrigemMap)) {
        const totalSecQty = Array.from(map.values()).reduce((acc, v) => acc + v.quantity, 0);
        origensPorSetor[sec] = Array.from(map.entries())
          .map(([origem, val]) => ({
            origem,
            name: origem,
            count: val.count,
            percentage: totalSecQty > 0 ? (val.quantity / totalSecQty) * 100 : 0,
            _sum: { quantity: val.quantity },
          }))
          .sort((a, b) => b._sum.quantity - a._sum.quantity);
      }

      // 5. Hidratação dos Top 5 Entradas de Sobras (Corte + Multi-Setor)
      const materialIds = topLegacyEntradas.map(e => e.materialId);
      const stockItemIds = topStockEntradas.map(e => e.stockItemId).filter((id): id is number => id !== null);

      const [materialsList, stockItemsList] = await Promise.all([
        materialIds.length > 0
          ? prisma.material.findMany({
              where: { factoryUnitId, id: { in: materialIds } },
              select: { id: true, code: true, name: true, unit: true, type: true }
            })
          : [],
        stockItemIds.length > 0
          ? prisma.stockItem.findMany({
              where: { factoryUnitId, id: { in: stockItemIds } },
              select: { id: true, code: true, name: true, pieceCode: true, description: true, productName: true, sku: true, unit: true, sector: true }
            })
          : []
      ]);

      const materialMap = new Map(materialsList.map(m => [m.id, m]));
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

      for (const leg of topLegacyEntradas) {
        const mat = materialMap.get(leg.materialId);
        if (mat) {
          topSobrasEntrada.push({
            id: `mat_${mat.id}`,
            code: mat.code,
            name: mat.name,
            sector: 'CORTE',
            totalQuantity: Number(leg._sum?.quantity) || 0,
            unit: mat.unit || 'm²',
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
            unit: item.unit || 'un',
            origin: 'Geração no Setor'
          });
        }
      }

      // Ordenar decrescente pela quantidade acumulada de entradas
      topSobrasEntrada.sort((a, b) => b.totalQuantity - a.totalQuantity);

      return res.json({
        stats,
        setores,
        volumePorSetor,
        distribuicao: materialDistribution,
        origemSobras,
        origensPorSetor,
        topSobrasEntrada,
      });
    } catch (error) {
      console.error('Erro analítico ao processar resumo consolidado do dashboard:', error);
      return res.status(500).json({ error: 'Erro interno ao carregar indicadores do dashboard.' });
    }
  }

  /**
   * Rota para alimentar o Gráfico de Pizza de Origem das Sobras
   */
  async getOrigemSobras(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const [stockOrigem, legacyOrigem] = await Promise.all([
        prisma.stockMovement.groupBy({
          by: ['origem'],
          where: {
            factoryUnitId,
            type: 'ENTRADA',
            origem: { not: null },
          },
          _sum: { quantity: true },
        }),
        prisma.movement.groupBy({
          by: ['origem'],
          where: {
            factoryUnitId,
            type: 'entrada',
            origem: { not: null },
          },
          _sum: { quantity: true },
        }),
      ]);

      const origemMap = new Map<string, number>();
      for (const item of legacyOrigem) {
        if (item.origem) {
          const norm = item.origem.trim();
          origemMap.set(norm, (origemMap.get(norm) || 0) + (Number(item._sum?.quantity) || 0));
        }
      }
      for (const item of stockOrigem) {
        if (item.origem) {
          const norm = item.origem.trim();
          origemMap.set(norm, (origemMap.get(norm) || 0) + (Number(item._sum?.quantity) || 0));
        }
      }

      const dadosGrafico = Array.from(origemMap.entries())
        .map(([origem, qty]) => ({
          origem,
          _sum: { quantity: qty },
        }))
        .sort((a, b) => (b._sum.quantity || 0) - (a._sum.quantity || 0));

      return res.json(dadosGrafico);
    } catch (error) {
      console.error('Erro analítico ao processar dashboard:', error);
      return res.status(500).json({ error: 'Erro interno no banco de dados ao buscar indicadores.' });
    }
  }

  /**
   * Rota para alimentar o Gráfico de Distribuição por tipo de material
   */
  async getDistribuicao(req: Request, res: Response) {
    try {
      const distribuicao = await prisma.material.groupBy({
        by: ['type'],
        where: { factoryUnitId: req.tenant!.id },
        _sum: {
          quantity: true,
        },
      });

      return res.json(distribuicao);
    } catch (error) {
      console.error('[Dashboard] Erro na rota de distribuição:', error);
      return res.status(500).json({ error: 'Erro interno ao processar distribuição.' });
    }
  }

  /**
   * Rota para buscar os 5 materiais com maior acúmulo (Top 5)
   */
  async getTopMateriais(req: Request, res: Response) {
    try {
      const materiais = await prisma.material.findMany({
        where: { factoryUnitId: req.tenant!.id },
        orderBy: {
          quantity: 'desc',
        },
        take: 5,
        select: {
          id: true,
          code: true,
          name: true,
          quantity: true,
          unit: true,
        },
      });
      return res.json(materiais);
    } catch (error) {
      console.error('Erro ao buscar maiores acúmulos do dashboard:', error);
      return res.status(500).json({ error: 'Erro interno no banco de dados ao buscar maiores acúmulos.' });
    }
  }
}

