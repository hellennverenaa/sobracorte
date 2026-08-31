import { Request, Response } from 'express';
import { StockItemService } from '../services/StockItemService';
import { BatchCreateStockItemSchema } from '../types/stock.dto';
import { ZodError } from 'zod';
import { SectorType } from '../generated/prisma';

const stockItemService = new StockItemService();

export class StockItemController {
  /**
   * POST /inventory/batch - Cadastro em lote de itens por setor
   */
  async createBatch(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const parsed = BatchCreateStockItemSchema.parse(req.body);

      const operatorContext = {
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await stockItemService.createBatch(parsed, operatorContext);
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Erro de validação dos dados.',
          details: error.flatten().fieldErrors,
        });
      }
      console.error('Erro ao cadastrar lote de itens de estoque:', error);
      return res.status(500).json({ error: 'Erro interno ao processar o cadastro em lote.' });
    }
  }

  /**
   * GET /inventory/search - Busca consolidada Round-Trip Único para todos os setores
   */
  async search(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const { q, search, sector, page, limit } = req.query;
      const searchQuery = q || search;

      const operatorContext = {
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const params = {
        q: searchQuery ? String(searchQuery) : undefined,
        sector: sector ? (String(sector).toUpperCase() as SectorType) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      };

      const result = await stockItemService.searchUnified(params, operatorContext);
      return res.json(result);
    } catch (error) {
      console.error('Erro na busca unificada de estoque:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar dados de estoque.' });
    }
  }

  /**
   * GET /inventory/search-suggestions - Autocomplete inteligente por setor
   */
  async suggestions(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const { sector, q } = req.query;
      const targetSector = (sector ? String(sector).toUpperCase() : 'MONTAGEM') as SectorType;
      const query = q ? String(q) : '';

      const result = await stockItemService.getSearchSuggestions(targetSector, query, req.tenant.id);
      return res.json(result);
    } catch (error) {
      console.error('Erro ao buscar sugestões de estoque:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar sugestões.' });
    }
  }
}
