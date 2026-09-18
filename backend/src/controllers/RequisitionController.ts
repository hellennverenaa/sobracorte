import { requestStockAccess, assertStockSectorAccess, StockAccessError } from '../auth/stockAccess';
import { Request, Response } from 'express';
import { RequisitionService } from '../services/RequisitionService';
import { 
  CreateRequisitionPayloadSchema, 
  CheckStockAvailabilitySchema,
  RequisitionFilterSchema,
  FulfillRequisitionSchema
} from '../types/stock.dto';
import { ZodError } from 'zod';
import { requireActiveStockSector, SectorValidationError } from '../utils/sectorHelper';

const requisitionService = new RequisitionService();

export class RequisitionController {
  /**
   * POST /requisitions/check-availability - Verificar disponibilidade e saldo em tempo real
   */
  async checkAvailability(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const parsed = CheckStockAvailabilitySchema.parse(req.body);
      assertStockSectorAccess(requestStockAccess(req), parsed.requestSector);
      const result = await requisitionService.checkStockAvailability(parsed as any, req.tenant.id);
      return res.json(result);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Dados de verificação inválidos.',
          details: error.flatten().fieldErrors,
        });
      }
      console.error('Erro ao verificar disponibilidade de saldo:', error);
      return res.status(500).json({ error: 'Erro ao verificar disponibilidade de estoque.' });
    }
  }

  /**
   * POST /requisitions - Criar solicitação digital de reposição (único ou multi-itens)
   */
  async create(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const parsed = CreateRequisitionPayloadSchema.parse(req.body);
      for (const item of ('items' in parsed ? parsed.items : [parsed])) assertStockSectorAccess(requestStockAccess(req), item.requestSector);

      const operatorContext = {
        ...requestStockAccess(req),
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await requisitionService.createRequisition(parsed, operatorContext);
      return res.status(201).json(result);
    } catch (error: any) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Erro de validação dos dados.',
          details: error.flatten().fieldErrors,
        });
      }
      console.error('Erro ao criar requisição:', error);
      return res.status(400).json({ error: error.message || 'Erro interno ao processar a requisição de reposição.' });
    }
  }

  /**
   * GET /requisitions - Listar requisições filtradas
   */
  async index(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const parsed = RequisitionFilterSchema.parse(req.query);

      const operatorContext = {
        ...requestStockAccess(req),
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await requisitionService.listRequisitions(parsed, operatorContext);
      return res.json(result);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Parâmetros de filtro inválidos.',
          details: error.flatten().fieldErrors,
        });
      }
      console.error('Erro ao listar requisições:', error);
      return res.status(500).json({ error: 'Erro interno ao consultar requisições.' });
    }
  }

  /**
   * PATCH /requisitions/:id/cancel - Cancelar requisição pendente
   */
  async cancel(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);

      const operatorContext = {
        ...requestStockAccess(req),
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await requisitionService.cancelRequisition(id, operatorContext);
      return res.json(result);
    } catch (error: any) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao cancelar requisição:', error);
      return res.status(400).json({ error: error.message || 'Erro ao cancelar requisição.' });
    }
  }

  /**
   * POST /requisitions/:id/fulfill - Atendimento e baixa de requisição (1 clique)
   */
  async fulfill(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const parsed = FulfillRequisitionSchema.parse(req.body);

      const operatorContext = {
        ...requestStockAccess(req),
        factoryUnitId: req.tenant.id,
        operatorId: req.effectiveContext?.matriculaDass ? String(req.effectiveContext.matriculaDass) : (req.user?.matricula ? String(req.user.matricula) : null),
        operatorName: req.effectiveContext?.nome || req.user?.nome || req.user?.usuario || null,
        role: req.effectiveContext?.effectiveRole || req.user?.role || null,
        assignedSector: req.effectiveContext?.assignedSector || req.user?.assignedSector || null,
      };

      const result = await requisitionService.fulfillRequisition(id, parsed, operatorContext);
      return res.json({ success: true, requisition: result });
    } catch (error: any) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Dados de atendimento inválidos.',
          details: error.flatten().fieldErrors,
        });
      }
      console.error('Erro ao atender requisição:', error);
      const status = error.status || (error.message?.includes('Acesso negado') ? 403 : 400);
      return res.status(status).json({ error: error.message || 'Erro ao processar baixa da requisição.' });
    }
  }

  /**
   * GET /requisitions/pending-count - Contagem de pendências para o sininho
   */
  async pendingCount(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const { sector } = req.query;
      const userSec = (req.user?.assignedSector && req.user?.role !== 'admin' && req.user?.assignedSector !== 'TODOS')
        ? req.user.assignedSector
        : sector ? requireActiveStockSector(String(sector)) : undefined;

      const result = await requisitionService.getPendingCount(req.tenant.id, userSec as any);
      return res.json(result);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro ao buscar contagem de pendências:', error);
      return res.status(500).json({ error: 'Erro interno ao consultar pendências.' });
    }
  }
}
