import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class DashboardController {
  /**
   * Endpoint Central Consolidado: Single Round-Trip para o Dashboard
   * Retorna { stats, distribuicao, origemSobras, topMateriais } em 1 única requisição HTTP
   */
  async getSummary(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;

      const [
        totalMaterialsCount,
        totalStockItemsCount,
        lowStockMaterialsCount,
        lowStockStockItemsCount,
        stockMovementsCount,
        legacyMovementsCount,
        stockEntriesCount,
        legacyEntriesCount,
        materialDistribution,
        stockOrigem,
        legacyOrigem,
        topMateriais,
      ] = await Promise.all([
        prisma.material.count({ where: { factoryUnitId } }),
        prisma.stockItem.count({ where: { factoryUnitId } }),
        prisma.material.count({ where: { factoryUnitId, quantity: { lte: 10 } } }),
        prisma.stockItem.count({ where: { factoryUnitId, quantity: { lte: 10 } } }),
        prisma.stockMovement.count({ where: { factoryUnitId } }),
        prisma.movement.count({ where: { factoryUnitId } }),
        prisma.stockMovement.count({ where: { factoryUnitId, type: 'ENTRADA' } }),
        prisma.movement.count({ where: { factoryUnitId, type: 'entrada' } }),
        prisma.material.groupBy({
          by: ['type'],
          where: { factoryUnitId },
          _sum: { quantity: true },
        }),
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
        prisma.material.findMany({
          where: { factoryUnitId },
          orderBy: { quantity: 'desc' },
          take: 5,
          select: {
            id: true,
            code: true,
            name: true,
            quantity: true,
            unit: true,
          },
        }),
      ]);

      // 1. Métricas / KPIs consolidados
      const stats = {
        totalMaterials: totalMaterialsCount + totalStockItemsCount,
        lowStock: lowStockMaterialsCount + lowStockStockItemsCount,
        totalMovements: stockMovementsCount + legacyMovementsCount,
        totalEntries: stockEntriesCount + legacyEntriesCount,
      };

      // 2. Mesclagem e ordenação da Origem das Sobras (StockMovement + Movement legado)
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

      const origemSobras = Array.from(origemMap.entries())
        .map(([origem, qty]) => ({
          origem,
          _sum: { quantity: qty },
        }))
        .sort((a, b) => (b._sum.quantity || 0) - (a._sum.quantity || 0));

      return res.json({
        stats,
        distribuicao: materialDistribution,
        origemSobras,
        topMateriais,
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

