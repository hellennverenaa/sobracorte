import { Request, Response } from 'express';
import { MountingPairService } from '../services/MountingPairService';
import { ExecuteMatchSchema } from '../types/stock.dto';
import { SectorType } from '../generated/prisma';
import { ZodError } from 'zod';

const mountingPairService = new MountingPairService();

export class MountingPairController {
  /**
   * GET /inventory/mounting/matching-pairs - Listagem de pares casáveis multi-setor
   */
  async getMatchingPairs(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const sectorParam = (req.query.sector as string)?.toUpperCase();
      const validSectors: SectorType[] = ['MONTAGEM', 'PRE_FABRICADO', 'EXPEDICAO'];
      const sector: SectorType = validSectors.includes(sectorParam as SectorType)
        ? (sectorParam as SectorType)
        : 'MONTAGEM';

      const pairs = await mountingPairService.findMatchingPairs(req.tenant.id, sector);
      return res.json({
        sector,
        totalMatchingPairsCount: pairs.length,
        pairs,
      });
    } catch (error) {
      console.error('Erro ao buscar pares casáveis:', error);
      return res.status(500).json({ error: 'Erro interno ao consultar pares casáveis.' });
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
      console.error('Erro ao executar casamento de par:', error);
      return res.status(500).json({ error: 'Erro interno ao processar o casamento de par.' });
    }
  }
}
