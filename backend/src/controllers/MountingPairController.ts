import { requestStockAccess, StockAccessError, assertStockSectorAccess } from '../auth/stockAccess';
import { Request, Response } from 'express';
import { MountingPairService } from '../services/MountingPairService';
import { ExecuteMatchSchema } from '../types/stock.dto';
import { SectorType } from '../generated/prisma';
import { ZodError } from 'zod';
import { requireActiveStockSector, normalizeSector, SectorValidationError } from '../utils/sectorHelper';

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

      const access = { ...requestStockAccess(req), factoryUnitId: req.tenant.id };
      const requested = req.query.sector ? requireActiveStockSector(String(req.query.sector)) : undefined;
      if (requested && !(access.role === 'leitor' && !access.assignedSector)) assertStockSectorAccess(access, requested);
      const availableSectors = await mountingPairService.availableSectors(req.tenant.id, access);
      const normalizedRequested = requested ? normalizeSector(requested) as SectorType : null;
      const sector = normalizedRequested && availableSectors.includes(normalizedRequested)
        ? normalizedRequested
        : availableSectors.includes('MONTAGEM') ? 'MONTAGEM' : availableSectors[0] || null;
      const searchParam = (req.query.q as string) || (req.query.search as string) || '';
      const pairs = sector ? await mountingPairService.findMatchingPairs(req.tenant.id, sector, searchParam, access) : [];
      return res.json({
        sector,
        availableSectors,
        totalMatchingPairsCount: pairs.length,
        pairs,
      });
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
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
        ...requestStockAccess(req),
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await mountingPairService.executeMatch(parsed, operatorContext);
      return res.json(result);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
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
