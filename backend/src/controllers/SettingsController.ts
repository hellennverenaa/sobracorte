import { requestStockAccess, assignedStockSector, sectorAccessWhere, StockAccessError } from '../auth/stockAccess';
import { Request, Response } from 'express';
import { normalizeSector } from '../utils/sectorHelper';
import { prisma } from '../prisma';
import { normalizeUnit } from '../utils/unitHelper';
import { assertStockLocationSector, DuplicateStockItemError, findStockIdentityMatches, lockStockIdentityWrites, stockIdentity } from '../services/stockIdentity';

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === code;
}

function checkSettingsPermission(req: Request, targetSector?: string): { allowed: boolean; status?: number; error?: string } {
  const effective = req.effectiveContext;
  const isGlobal = effective?.isGlobalAdmin ?? req.isGlobalAdmin;
  const role = effective?.effectiveRole ?? req.user?.role;
  const assignedSector = effective?.assignedSector ?? req.user?.assignedSector;

  if (isGlobal || role === 'admin') {
    return { allowed: true };
  }
  if (role === 'leitor' || role === 'movimentador' || role === 'lider') {
    return { allowed: false, status: 403, error: 'Acesso não autorizado às configurações do sistema.' };
  }
  if (role === 'admin_setor') {
    try { assignedStockSector(requestStockAccess(req)); }
    catch (error) { return { allowed: false, status: 403, error: (error as Error).message }; }
    if (targetSector && assignedSector && assignedSector !== 'TODOS') {
      const userSec = normalizeSector(assignedSector);
      const tgtSec = normalizeSector(targetSector);
      if (userSec !== tgtSec) {
        return {
          allowed: false,
          status: 403,
          error: `Acesso negado: Seu perfil está restrito ao gerenciamento do setor ${assignedSector}.`,
        };
      }
    }
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: 'Acesso não autorizado às configurações do sistema.' };
}

export class SettingsController {

  async getCategories(req: Request, res: Response) {
    try {
      const rawSector = req.query.sector as string | undefined;
      let targetSector = rawSector ? rawSector.toUpperCase().trim() : undefined;
      if (targetSector === 'EXPEDICAO' || targetSector === 'CABEDAIS') targetSector = 'DISTRIBUICAO';

      if (assignedStockSector(requestStockAccess(req))) {
        targetSector = assignedStockSector(requestStockAccess(req))!;
      }

      const whereClause: any = { factoryUnitId: req.tenant!.id };
      if (targetSector) {
        whereClause.OR = [
          { sector: targetSector as any },
          { sector: null }
        ];
      }

      const categories = await prisma.categoryConfig.findMany({
        where: whereClause,
        orderBy: [{ sector: 'asc' }, { name: 'asc' }],
        include: { defaultUnit: true }
      });

      const categoriesWithCount = await Promise.all(
        categories.map(async (cat) => {
          const stockCount = await prisma.stockItem.count({ where: { factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)), type: cat.name } });
          return {
            ...cat,
            linkedCount: stockCount,
          };
        })
      );
      res.json(categoriesWithCount);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao buscar categorias:', error);
      res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
  }

  async createCategory(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { name, unitLock, defaultUnitId, unitLocked, sector } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      }

      let targetSector = sector ? String(sector).toUpperCase().trim() : (req.user?.assignedSector || 'CORTE');
      if (targetSector === 'EXPEDICAO' || targetSector === 'CABEDAIS') targetSector = 'DISTRIBUICAO';
      if (req.user?.role === 'admin_setor' && req.user.assignedSector) {
        targetSector = req.user.assignedSector;
      }

      if (defaultUnitId) {
        const unit = await prisma.unitConfig.findFirst({
          where: { id: Number(defaultUnitId), factoryUnitId: req.tenant!.id }, select: { id: true },
        });
        if (!unit) return res.status(404).json({ error: 'Unidade de medida não encontrada.' });
      }
      const category = await prisma.$transaction(async (tx) => {
        const cat = await tx.categoryConfig.create({
          data: {
            name: String(name).trim().toUpperCase(),
            sector: targetSector as any,
            unitLock: unitLock || 'livre',
            defaultUnitId: defaultUnitId ? Number(defaultUnitId) : null,
            unitLocked: Boolean(unitLocked),
            factoryUnitId: req.tenant!.id
          },
          include: { defaultUnit: true }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Categorias',
            reason: `Criação de Categoria: ${cat.name} (Setor: ${targetSector || 'GERAL'})`
          }
        });

        return cat;
      });
      res.status(201).json(category);
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Essa categoria já existe.' });
      }
      console.error('Erro ao criar categoria:', error);
      res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  }

  async updateCategory(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const { name, unitLock, defaultUnitId, unitLocked, sector } = req.body;

      let targetSector = sector !== undefined ? (sector ? String(sector).toUpperCase().trim() : null) : undefined;
      if (targetSector === 'EXPEDICAO' || targetSector === 'CABEDAIS') targetSector = 'DISTRIBUICAO';
      if (req.user?.role === 'admin_setor' && req.user.assignedSector) {
        targetSector = req.user.assignedSector;
      }

      const existing = await prisma.categoryConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)) } });
      if (!existing) return res.status(404).json({ error: 'Categoria não encontrada.' });
      if (defaultUnitId) {
        const unit = await prisma.unitConfig.findFirst({
          where: { id: Number(defaultUnitId), factoryUnitId: req.tenant!.id }, select: { id: true },
        });
        if (!unit) return res.status(404).json({ error: 'Unidade de medida não encontrada.' });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const newName = name ? String(name).trim().toUpperCase() : undefined;
        if (newName && newName !== existing.name) {
          await lockStockIdentityWrites(tx, req.tenant!.id);
          const affected = await tx.stockItem.findMany({ where: { factoryUnitId: req.tenant!.id, type: existing.name } });
          for (const item of affected) {
            if (!('type' in stockIdentity(item))) continue;
            const matches = await findStockIdentityMatches(tx, req.tenant!.id, { ...item, type: newName });
            if (matches.some(match => match.id !== item.id)) {
              throw new DuplicateStockItemError('A alteração da categoria criaria itens duplicados no estoque.');
            }
          }
        }
        const cat = await tx.categoryConfig.update({
          where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id }, ...sectorAccessWhere(requestStockAccess(req)) },
          data: {
            name: newName,
            sector: targetSector !== undefined ? (targetSector as any) : undefined,
            unitLock: unitLock !== undefined ? unitLock : undefined,
            defaultUnitId: defaultUnitId !== undefined ? (defaultUnitId ? Number(defaultUnitId) : null) : undefined,
            unitLocked: unitLocked !== undefined ? Boolean(unitLocked) : undefined
          },
          include: { defaultUnit: true }
        });

        if (newName && newName !== existing.name) {
          await tx.stockItem.updateMany({
            where: { factoryUnitId: req.tenant!.id, type: existing.name },
            data: { type: newName },
          });
        }

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.effectiveContext?.matriculaDass ? String(req.effectiveContext.matriculaDass) : (req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null)),
            operatorName: req.effectiveContext?.nome || req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Categorias',
            reason: `Edição de Categoria: ${existing.name}${newName && newName !== existing.name ? ` para ${newName}` : ''}`
          }
        });

        return cat;
      });

      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof DuplicateStockItemError) {
        return res.status(409).json({ error: error.message });
      }
      console.error('Erro ao atualizar categoria:', error);
      res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
  }

  async deleteCategory(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const category = await prisma.categoryConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)) } });
      if (!category) {
        return res.status(404).json({ error: 'Categoria não encontrada.' });
      }

      const stockCount = await prisma.stockItem.count({
        where: { factoryUnitId: req.tenant!.id, type: category.name }
      });
      const totalActive = stockCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} material(is) ou item(ns) usando esta categoria. Apenas o Administrador Master pode gerenciar esta exclusão.`
        });
      }

      // 2. Execução transacional atômica com registro no histórico de auditoria
      await prisma.$transaction(async (tx) => {
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EXCLUSAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Categorias',
            reason: `Exclusão de Categoria: ${category.name}${totalActive > 0 ? ` (com ${totalActive} itens vinculados)` : ''}`
          }
        });

        await tx.locationCategory.deleteMany({ where: { categoryId: id, factoryUnitId: req.tenant!.id } });
        await tx.location.updateMany({
          where: { factoryUnitId: req.tenant!.id, categoryId: id }, data: { categoryId: null },
        });
        await tx.categoryConfig.delete({ where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id }, ...sectorAccessWhere(requestStockAccess(req)) } });
      });

      res.json({ message: 'Categoria excluída com sucesso.' });
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir categoria:', error);
      res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
  }

  async getUnits(req: Request, res: Response) {
    try {
      const units = await prisma.unitConfig.findMany({
        where: { factoryUnitId: req.tenant!.id, active: true },
        orderBy: { id: 'desc' }
      });

      const unitsWithCount = await Promise.all(
        units.map(async (unit) => {
          const stockCount = await prisma.stockItem.count({ where: { factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)), unit: unit.symbol } });
          return {
            ...unit,
            linkedCount: stockCount,
          };
        })
      );

      res.json(unitsWithCount);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao buscar unidades:', error);
      res.status(500).json({ error: 'Erro ao buscar unidades de medida' });
    }
  }

  async createUnit(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { name, symbol } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da unidade é obrigatório.' });
      }
      if (!symbol || !String(symbol).trim()) {
        return res.status(400).json({ error: 'A sigla da unidade é obrigatória.' });
      }

      const cleanSymbol = normalizeUnit(String(symbol).trim());
      const cleanName = String(name).trim().toUpperCase();

      const existing = await prisma.unitConfig.findUnique({
        where: { factoryUnitId_symbol: { factoryUnitId: req.tenant!.id, symbol: cleanSymbol } },
      });
      if (existing) {
        if (!existing.active) {
          const reactivated = await prisma.unitConfig.update({
            where: { id_factoryUnitId: { id: existing.id, factoryUnitId: req.tenant!.id } },
            data: { name: cleanName, active: true }
          });
          return res.status(200).json(reactivated);
        }
        return res.status(409).json({ error: 'Já existe uma unidade cadastrada com esta sigla.' });
      }

      const unit = await prisma.$transaction(async (tx) => {
        const u = await tx.unitConfig.create({
          data: {
            name: cleanName,
            symbol: cleanSymbol,
            active: true,
            factoryUnitId: req.tenant!.id
          }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Unidades',
            reason: `Criação de Unidade: ${cleanName} (${cleanSymbol})`
          }
        });

        return u;
      });
      res.status(201).json(unit);
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Já existe uma unidade cadastrada com esta sigla.' });
      }
      console.error('Erro ao criar unidade:', error);
      res.status(500).json({ error: 'Erro ao criar unidade de medida' });
    }
  }

  async deleteUnit(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const unit = await prisma.unitConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id } });
      if (!unit) {
        return res.status(404).json({ error: 'Unidade de medida não encontrada.' });
      }

      const stockCount = await prisma.stockItem.count({
        where: { factoryUnitId: req.tenant!.id, unit: unit.symbol }
      });
      const totalActive = stockCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível desativar: existem ${totalActive} material(is) ou item(ns) usando esta unidade. Apenas o Administrador Master pode gerenciar esta alteração.`
        });
      }

      await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EXCLUSAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Unidades',
            reason: `Desativação de Unidade: ${unit.name} (${unit.symbol})${totalActive > 0 ? ` (com ${totalActive} itens vinculados)` : ''}`
          }
        }),
        prisma.unitConfig.update({
          where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id } },
          data: { active: false }
        })
      ]);

      res.json({ message: 'Unidade desativada com sucesso.' });
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao desativar unidade:', error);
      res.status(500).json({ error: 'Erro ao desativar unidade de medida' });
    }
  }

  async getLocations(req: Request, res: Response) {
    try {
      const sectorFilter = req.query.sector as string | undefined;
      let targetSector = sectorFilter ? sectorFilter.toUpperCase().trim() : undefined;
      if (targetSector === 'CABEDAIS' || targetSector === 'EXPEDICAO') targetSector = 'DISTRIBUICAO';

      const whereClause: any = { factoryUnitId: req.tenant!.id };
      if (assignedStockSector(requestStockAccess(req))) {
        whereClause.OR = [
          sectorAccessWhere(requestStockAccess(req))
        ];
      } else if (targetSector) {
        whereClause.OR = [
          { sector: targetSector as any },
          { sector: null }
        ];
      }

      const locations = await prisma.location.findMany({
        where: whereClause,
        orderBy: { id: 'desc' },
        include: {
          category: true,
          categoryLinks: {
            include: { category: true }
          }
        }
      });

      const locationsWithStats = await Promise.all(
        locations.map(async (loc) => {
          const stockLocs = await prisma.stockItemLocation.findMany(
            {
              where: { factoryUnitId: req.tenant!.id, locationId: loc.id, stockItem: sectorAccessWhere(requestStockAccess(req)) },
              select: { quantity: true }
            });
          const totalLinked = stockLocs.length;
          const totalQuantity = stockLocs.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
          return {
            ...loc,
            linkedCount: totalLinked,
            totalQuantity: Number(totalQuantity.toFixed(2)),
          };
        })
      );

      res.json(locationsWithStats);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao buscar localizações:', error);
      res.status(500).json({ error: 'Erro ao buscar localizações' });
    }
  }

  async createLocation(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { name, categoryId, categoryIds, sector } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da localização é obrigatório.' });
      }

      let targetSector = sector ? String(sector).toUpperCase().trim() : (req.user?.assignedSector || null);
      if (targetSector === 'CABEDAIS' || targetSector === 'EXPEDICAO') targetSector = 'DISTRIBUICAO';
      if (req.user?.role === 'admin_setor' && req.user.assignedSector) {
        targetSector = req.user.assignedSector;
      }

      // Suporta array de IDs ou único ID
      let idsToLink: number[] = [];
      if (Array.isArray(categoryIds) && categoryIds.length > 0) {
        idsToLink = categoryIds.map(Number).filter((id) => !isNaN(id) && id > 0);
      } else if (categoryId) {
        idsToLink = [Number(categoryId)];
      }

      let finalCategoryIds: number[] = [];
      let primaryCategoryId: number | null = null;

      if (idsToLink.length > 0) {
        const categoryWhere: any = {
          id: { in: idsToLink },
          factoryUnitId: req.tenant!.id,
        };
        if (targetSector) {
          categoryWhere.OR = [
            { sector: targetSector as any },
            { sector: null }
          ];
        }

        const validCategories = await prisma.categoryConfig.findMany({
          where: categoryWhere,
          select: { id: true, name: true, sector: true }
        });

        if (validCategories.length === 0) {
          return res.status(400).json({
            error: `Nenhuma categoria válida encontrada para o setor ${targetSector || 'especificado'}.`
          });
        }

        finalCategoryIds = validCategories.map(c => c.id);
        primaryCategoryId = finalCategoryIds[0];
      }

      const location = await prisma.$transaction(async (tx) => {
        const loc = await tx.location.create({
          data: {
            name: String(name).trim().toUpperCase(),
            sector: targetSector as any,
            categoryId: primaryCategoryId,
            factoryUnitId: req.tenant!.id,
            categoryLinks: finalCategoryIds.length > 0 ? {
              create: finalCategoryIds.map(cId => ({
                categoryId: cId
              }))
            } : undefined
          },
          include: {
            category: true,
            categoryLinks: {
              include: { category: true }
            }
          }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Localizações',
            reason: `Criação de Localização: ${loc.name} (Setor: ${targetSector || 'GERAL'})`
          }
        });

        return loc;
      });
      res.status(201).json(location);
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Essa localização já existe.' });
      }
      console.error('Erro ao criar localização:', error);
      res.status(500).json({ error: 'Erro ao criar localização' });
    }
  }

  async updateLocation(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const { name, categoryIds, sector } = req.body;

      const existing = await prisma.location.findFirst({
        where: { id, factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)) }
      });
      if (!existing) {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }

      let targetSector = sector !== undefined ? (sector ? String(sector).toUpperCase().trim() : null) : undefined;
      if (targetSector === 'CABEDAIS' || targetSector === 'EXPEDICAO') targetSector = 'DISTRIBUICAO';
      if (req.user?.role === 'admin_setor' && req.user.assignedSector) {
        targetSector = req.user.assignedSector;
      }

      let finalCategoryIds: number[] | undefined;
      if (Array.isArray(categoryIds)) {
        if (categoryIds.length > 0) {
          const effectiveSector = targetSector !== undefined ? targetSector : existing.sector;
          const categoryWhere: any = {
            id: { in: categoryIds.map(Number).filter(n => !isNaN(n) && n > 0) },
            factoryUnitId: req.tenant!.id,
          };
          if (effectiveSector) {
            categoryWhere.OR = [
              { sector: effectiveSector as any },
              { sector: null }
            ];
          }
          const validCategories = await prisma.categoryConfig.findMany({
            where: categoryWhere,
            select: { id: true }
          });
          finalCategoryIds = validCategories.map(c => c.id);
        } else {
          finalCategoryIds = [];
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        await lockStockIdentityWrites(tx, req.tenant!.id);
        if (targetSector !== undefined && targetSector !== null) {
          const links = await tx.stockItemLocation.findMany({
            where: { factoryUnitId: req.tenant!.id, locationId: id },
            include: { stockItem: { select: { sector: true } } },
          });
          for (const link of links) assertStockLocationSector({ sector: targetSector }, link.stockItem.sector);
        }
        if (finalCategoryIds !== undefined) {
          // Remove vínculos antigos
          await tx.locationCategory.deleteMany({
            where: { locationId: id, factoryUnitId: req.tenant!.id }
          });
          if (finalCategoryIds.length > 0) {
            // Cria novos vínculos
            await tx.locationCategory.createMany({
              data: finalCategoryIds.map(cId => ({
                locationId: id,
                categoryId: cId,
                factoryUnitId: req.tenant!.id
              }))
            });
          }
        }

        const loc = await tx.location.update({
          where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id }, ...sectorAccessWhere(requestStockAccess(req)) },
          data: {
            name: name ? String(name).trim().toUpperCase() : undefined,
            sector: targetSector as any,
            categoryId: finalCategoryIds !== undefined ? (finalCategoryIds.length > 0 ? finalCategoryIds[0] : null) : undefined
          },
          include: {
            category: true,
            categoryLinks: {
              include: { category: true }
            }
          }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Localizações',
            reason: `Edição de Localização: ${existing.name}${name && name !== existing.name ? ` para ${name}` : ''}`
          }
        });

        return loc;
      });

      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof Error && error.message.includes('Movimentações entre setores não são permitidas')) {
        return res.status(400).json({ error: 'Não é possível vincular a localização a um setor diferente dos itens já alocados nela.' });
      }
      console.error('Erro ao atualizar localização:', error);
      res.status(500).json({ error: 'Erro ao atualizar localização' });
    }
  }

  async deleteLocation(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const location = await prisma.location.findFirst({
        where: { id, factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)) }
      });
      if (!location) {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }

      const stockCount = await prisma.stockItemLocation.count({
        where: { factoryUnitId: req.tenant!.id, locationId: id }
      });
      const totalActive = stockCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} material(is) ou item(ns) vinculados a esta localização. Apenas o Administrador Master pode gerenciar esta exclusão.`
        });
      }

      // 2. Execução transacional atômica com gravação de auditoria em StockMovement
      await prisma.$transaction(async (tx) => {
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EXCLUSAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Localizações',
            reason: `Exclusão de Localização: ${location.name}${totalActive > 0 ? ` (com ${totalActive} itens vinculados)` : ''}`
          }
        });

        await tx.locationCategory.deleteMany({ where: { locationId: id, factoryUnitId: req.tenant!.id } });
        await tx.stockItemLocation.deleteMany({ where: { locationId: id, factoryUnitId: req.tenant!.id } });
        await tx.location.delete({ where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id }, ...sectorAccessWhere(requestStockAccess(req)) } });
      });

      res.json({ message: 'Localização excluída com sucesso.' });
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir localização:', error);
      res.status(500).json({ error: 'Erro ao excluir localização' });
    }
  }

  async getOrigins(req: Request, res: Response) {
    try {
      const sectorFilter = req.query.sector as string | undefined;
      let targetSector = sectorFilter ? sectorFilter.toUpperCase().trim() : undefined;
      if (targetSector === 'CABEDAIS' || targetSector === 'EXPEDICAO') targetSector = 'DISTRIBUICAO';

      const whereClause: any = { factoryUnitId: req.tenant!.id };
      if (assignedStockSector(requestStockAccess(req))) {
        whereClause.OR = [
          sectorAccessWhere(requestStockAccess(req))
        ];
      } else if (targetSector) {
        whereClause.OR = [
          { sector: targetSector as any },
          { sector: null }
        ];
      }

      const origins = await prisma.originConfig.findMany({
        where: whereClause,
        orderBy: { id: 'desc' }
      });

      const originsWithCount = await Promise.all(
        origins.map(async (orig) => {
          const stockMovCount = await prisma.stockMovement.count({ where: { factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)), origem: orig.name } });
          return {
            ...orig,
            linkedCount: stockMovCount,
          };
        })
      );

      res.json(originsWithCount);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao buscar origens:', error);
      res.status(500).json({ error: 'Erro ao buscar origens' });
    }
  }

  async createOrigin(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { name, sector } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da origem é obrigatório.' });
      }

      let targetSector = sector ? String(sector).toUpperCase().trim() : (req.user?.assignedSector || null);
      if (targetSector === 'CABEDAIS' || targetSector === 'EXPEDICAO') targetSector = 'DISTRIBUICAO';
      if (req.user?.role === 'admin_setor' && req.user.assignedSector) {
        targetSector = req.user.assignedSector;
      }

      const origin = await prisma.$transaction(async (tx) => {
        const orig = await tx.originConfig.create({
          data: {
            name: String(name).trim().toUpperCase(),
            sector: targetSector as any,
            factoryUnitId: req.tenant!.id
          }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Origens',
            reason: `Criação de Origem: ${orig.name} (Setor: ${targetSector || 'GERAL'})`
          }
        });

        return orig;
      });
      res.status(201).json(origin);
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Essa origem já existe.' });
      }
      console.error('Erro ao criar origem:', error);
      res.status(500).json({ error: 'Erro ao criar origem' });
    }
  }

  async deleteOrigin(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const origin = await prisma.originConfig.findFirst({
        where: { id, factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)) }
      });
      if (!origin) {
        return res.status(404).json({ error: 'Origem não encontrada.' });
      }

      const stockMovementCount = await prisma.stockMovement.count({
        where: { factoryUnitId: req.tenant!.id, origem: origin.name }
      });
      const totalActive = stockMovementCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} movimentação(ões) vinculadas a esta origem. Apenas o Administrador Master pode gerenciar esta exclusão.`
        });
      }

      await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EXCLUSAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Origens',
            reason: `Exclusão de Origem de Sobra: ${origin.name}${totalActive > 0 ? ` (com ${totalActive} registros vinculados)` : ''}`
          }
        }),
        prisma.originConfig.delete({ where: { id, factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)) } })
      ]);

      res.json({ message: 'Origem excluída com sucesso.' });
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir origem:', error);
      res.status(500).json({ error: 'Erro ao excluir origem' });
    }
  }
}
