import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class DashboardController {
  /**
   * Rota para alimentar o Gráfico de Pizza de Origem das Sobras
   */
  async getOrigemSobras(req: Request, res: Response) {
    try {
      const dadosGrafico = await prisma.movement.groupBy({
        by: ['origem'],
        where: {
          factoryUnitId: req.tenant!.id,
          origem: {
            not: null, // Ignora registros de histórico antigos que não tinham origem
          },
          type: 'entrada' // Ajustado de 'ENTRADA' para 'entrada' para coincidir com o padrão salvo no banco (minúsculo)
        },
        _sum: {
          quantity: true, 
        },
        orderBy: {
          _sum: {
            quantity: 'desc',
          },
        },
      });

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
        // Como o 'type' é obrigatório no seu Schema, não precisamos (nem podemos) filtrar por null.
        // O Prisma fará o agrupamento direto usando o índice que criamos!
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
          quantity: 'desc'
        },
        take: 5,
        select: {
          id: true,
          code: true,
          name: true,
          quantity: true,
          unit: true
        }
      });
      return res.json(materiais);
    } catch (error) {
      console.error('Erro ao buscar maiores acúmulos do dashboard:', error);
      return res.status(500).json({ error: 'Erro interno no banco de dados ao buscar maiores acúmulos.' });
    }
  }
}
