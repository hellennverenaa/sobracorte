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
}
