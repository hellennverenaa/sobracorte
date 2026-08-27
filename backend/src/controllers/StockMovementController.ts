import { Request, Response } from 'express';
import { StockMovementService } from '../services/StockMovementService';
import { CreateStockMovementSchema, MovementHistoryFilterSchema } from '../types/stock.dto';
import { ZodError } from 'zod';

const stockMovementService = new StockMovementService();

export class StockMovementController {
  /**
   * POST /inventory/movements - Registro de saídas, refugos e transferências
   */
  async create(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const parsed = CreateStockMovementSchema.parse(req.body);

      const operatorContext = {
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await stockMovementService.createMovement(parsed, operatorContext);
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Erro de validação da movimentação.',
          details: error.flatten().fieldErrors,
        });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Erro ao registrar movimentação de estoque:', error);
      return res.status(500).json({ error: 'Erro interno ao registrar movimentação.' });
    }
  }

  /**
   * GET /inventory/movements/history - Consulta paginada do histórico completo de auditoria
   */
  async history(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const parsed = MovementHistoryFilterSchema.parse(req.query);

      const operatorContext = {
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await stockMovementService.getHistory(parsed, operatorContext);
      return res.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Erro de validação dos filtros de histórico.',
          details: error.flatten().fieldErrors,
        });
      }
      console.error('Erro ao consultar histórico de movimentações:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar histórico de movimentações.' });
    }
  }
}
