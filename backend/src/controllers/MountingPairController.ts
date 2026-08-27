import { Request, Response } from 'express';
import { MountingPairService } from '../services/MountingPairService';
import { ExecuteMatchSchema } from '../types/stock.dto';
import { ZodError } from 'zod';

const mountingPairService = new MountingPairService();

export class MountingPairController {
  /**
   * GET /inventory/mounting/matching-pairs - Listagem de pares casáveis na Montagem
   */
  async getMatchingPairs(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const pairs = await mountingPairService.findMatchingPairs(req.tenant.id);
      return res.json({
        totalMatchingPairsCount: pairs.length,
        pairs,
      });
    } catch (error) {
      console.error('Erro ao buscar pares casáveis na montagem:', error);
      return res.status(500).json({ error: 'Erro interno ao consultar pares órfãos casáveis.' });
    }
  }

  /**
   * POST /inventory/mounting/execute-match - Execução da baixa por casamento de par
   */
  async executeMatch(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const parsed = ExecuteMatchSchema.parse(req.body);

      const operatorContext = {
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await mountingPairService.executeMatch(parsed, operatorContext);
      return res.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Erro de validação dos parâmetros de casamento.',
          details: error.flatten().fieldErrors,
        });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Erro ao executar casamento de par na montagem:', error);
      return res.status(500).json({ error: 'Erro interno ao processar o casamento de par.' });
    }
  }
}
