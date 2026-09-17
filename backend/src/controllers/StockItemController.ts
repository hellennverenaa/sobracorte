import { StockAccessError, requestStockAccess, assignedStockSector, assertStockSectorAccess } from '../auth/stockAccess';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { DuplicateStockItemError, StockItemService } from '../services/StockItemService';
import { BatchCreateStockItemSchema } from '../types/stock.dto';
import { ZodError } from 'zod';
import { SectorType } from '../generated/prisma';
import { lockStockIdentityWrites, normalizeStockSector } from '../services/stockIdentity';

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

      for (const item of parsed.items) assertStockSectorAccess(requestStockAccess(req), item.sector);

      const operatorContext = {
        ...requestStockAccess(req),
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const result = await stockItemService.createBatch(parsed, operatorContext);
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof DuplicateStockItemError) {
        return res.status(409).json({ error: error.message });
      }
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

      let targetSector = sector ? normalizeStockSector(String(sector)) as SectorType : undefined;

      targetSector = assignedStockSector(requestStockAccess(req)) || targetSector;

      const operatorContext = {
        ...requestStockAccess(req),
        factoryUnitId: req.tenant.id,
        operatorId: req.user?.matricula ? String(req.user.matricula) : null,
        operatorName: req.user?.nome || req.user?.usuario || null,
      };

      const params = {
        q: searchQuery ? String(searchQuery) : undefined,
        sector: targetSector,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      };

      const result = await stockItemService.searchUnified(params, operatorContext);
      return res.json(result);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
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
      let targetSector = (sector ? String(sector).toUpperCase() : 'MONTAGEM') as SectorType;
      if (targetSector === ('EXPEDICAO' as any) || targetSector === ('CABEDAIS' as any)) {
        targetSector = 'DISTRIBUICAO' as SectorType;
      }

      targetSector = assignedStockSector(requestStockAccess(req)) || targetSector;

      const query = q ? String(q) : '';

      const result = await stockItemService.getSearchSuggestions(targetSector, query, req.tenant.id);
      return res.json(result);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao buscar sugestões de estoque:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar sugestões.' });
    }
  }

  /**
   * GET /inventory/combinations - Sugestões de combinações/cores por setor
   */
  async combinations(req: Request, res: Response) {
    try {
      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const { sector, q } = req.query;
      let targetSector = (sector ? String(sector).toUpperCase() : 'PRE_FABRICADO') as SectorType;
      if (targetSector === ('EXPEDICAO' as any) || targetSector === ('CABEDAIS' as any)) {
        targetSector = 'DISTRIBUICAO' as SectorType;
      }

      targetSector = assignedStockSector(requestStockAccess(req)) || targetSector;

      const query = q ? String(q) : '';

      const result = await stockItemService.getCombinations(targetSector, query, req.tenant.id);
      return res.json(result);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao buscar combinações de estoque:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar combinações.' });
    }
  }

  /**
   * DELETE /inventory/stock-items/:id - Exclusão de item de estoque com trava de saldo e auditoria
   */
  async delete(req: Request, res: Response) {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Item inválido.' });
      }

      if (!req.tenant) {
        return res.status(400).json({ error: 'Unidade fabril não identificada.' });
      }

      const factoryUnitId = req.tenant.id;
      const operatorId = req.user?.matricula ? String(req.user.matricula) : null;
      const operatorName = req.user?.nome || req.user?.usuario || 'Administrador';

      await (prisma as any).$transaction(
        async (tx: any) => {
          await lockStockIdentityWrites(tx, factoryUnitId);
          const item = await tx.stockItem.findFirst({
            where: { id: itemId, factoryUnitId },
            include: {
              locations: {
                include: { location: true },
              },
            },
          });

          if (!item) {
            throw new Error('STOCK_ITEM_NOT_FOUND');
          }

          assertStockSectorAccess(requestStockAccess(req), item.sector);

          const totalQty = Number(item.quantity || 0);
          const hasLocationBalance = item.locations.some((l: any) => Number(l.quantity || 0) > 0.0001);

          if (totalQty > 0.0001 || hasLocationBalance) {
            const err: any = new Error('STOCK_ITEM_HAS_BALANCE');
            err.status = 409;
            throw err;
          }

          const snapshotLocations = item.locations.map((l: any) => ({
            locationId: l.locationId,
            locationName: l.location?.name || 'Não informada',
            quantity: Number(l.quantity || 0),
          }));

          const itemCode = item.sku || item.pieceCode || item.code || '-';
          const itemName = item.description || item.name || item.productName || item.sku || 'Item de Estoque';

          await tx.materialDeletionAudit.create({
            data: {
              factoryUnitId,
              materialId: item.id,
              code: itemCode,
              name: itemName,
              categoryName: item.sector,
              unitSymbol: item.unit || 'UND',
              quantity: 0,
              locations: snapshotLocations,
              deletedById: operatorId,
              deletedByName: operatorName,
            },
          });

          // Desvincular stockItemId das movimentações passadas mantendo o histórico de auditoria intacto
          await tx.stockMovement.updateMany({
            where: { stockItemId: item.id, factoryUnitId },
            data: { stockItemId: null },
          });

          await tx.stockItemLocation.deleteMany({
            where: { stockItemId: item.id, factoryUnitId },
          });

          await tx.stockItem.delete({
            where: { id_factoryUnitId: { id: item.id, factoryUnitId } },
          });
        },
        {
          isolationLevel: 'Serializable',
        }
      );

      return res.json({ message: 'Item excluído com sucesso e registrado em auditoria.' });
    } catch (error: any) {
      if (error?.message === 'STOCK_ITEM_NOT_FOUND') {
        return res.status(404).json({ error: 'Item não encontrado.' });
      }
      if (error?.message === 'FORBIDDEN_SECTOR' || error?.status === 403) {
        return res.status(403).json({ error: 'Acesso negado: Você não tem permissão para excluir itens deste setor.' });
      }
      if (error?.message === 'STOCK_ITEM_HAS_BALANCE' || error?.status === 409) {
        return res.status(409).json({
          error: 'O material só pode ser excluído quando todo o estoque estiver zerado.',
        });
      }
      console.error('Erro ao deletar item de estoque:', error);
      return res.status(500).json({ error: 'Erro ao deletar item de estoque.' });
    }
  }
}
