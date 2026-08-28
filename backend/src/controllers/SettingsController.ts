import { Request, Response } from 'express';
import { prisma } from '../prisma';

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === code;
}

function checkSettingsPermission(req: Request): { allowed: boolean; status?: number; error?: string } {
  if (req.isGlobalAdmin || req.user?.role === 'admin') {
    return { allowed: true };
  }
  if (req.user?.role === 'leitor') {
    return { allowed: false, status: 403, error: 'Acesso não autorizado às configurações do sistema.' };
  }
  if (req.user?.role === 'lider') {
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: 'Acesso não autorizado às configurações do sistema.' };
}

export class SettingsController {

  async getCategories(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const categories = await prisma.categoryConfig.findMany({
        where: { factoryUnitId: req.tenant!.id },
        orderBy: { id: 'desc' },
        include: { defaultUnit: true }
      });
      res.json(categories);
    } catch (error) {
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

      const { name, unitLock, defaultUnitId, unitLocked } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      }
      if (defaultUnitId) {
        const unit = await prisma.unitConfig.findFirst({
          where: { id: Number(defaultUnitId), factoryUnitId: req.tenant!.id }, select: { id: true },
        });
        if (!unit) return res.status(404).json({ error: 'Unidade de medida não encontrada.' });
      }
      const category = await prisma.categoryConfig.create({
        data: {
          name: String(name).trim().toUpperCase(),
          unitLock: unitLock || 'livre',
          defaultUnitId: defaultUnitId ? Number(defaultUnitId) : null,
          unitLocked: Boolean(unitLocked),
          factoryUnitId: req.tenant!.id
        },
        include: { defaultUnit: true }
      });
      res.status(201).json(category);
    } catch (error: unknown) {
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
      const { name, unitLock, defaultUnitId, unitLocked } = req.body;

      const existing = await prisma.categoryConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id } });
      if (!existing) return res.status(404).json({ error: 'Categoria não encontrada.' });
      if (defaultUnitId) {
        const unit = await prisma.unitConfig.findFirst({
          where: { id: Number(defaultUnitId), factoryUnitId: req.tenant!.id }, select: { id: true },
        });
        if (!unit) return res.status(404).json({ error: 'Unidade de medida não encontrada.' });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const cat = await tx.categoryConfig.update({
          where: { id },
          data: {
            name: name ? String(name).trim().toUpperCase() : undefined,
            unitLock: unitLock !== undefined ? unitLock : undefined,
            defaultUnitId: defaultUnitId !== undefined ? (defaultUnitId ? Number(defaultUnitId) : null) : undefined,
            unitLocked: unitLocked !== undefined ? Boolean(unitLocked) : undefined
          },
          include: { defaultUnit: true }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Categorias',
            reason: `Edição de Categoria: ${existing.name}${name && name !== existing.name ? ` para ${name}` : ''}`
          }
        });

        return cat;
      });

      res.json(updated);
    } catch (error: unknown) {
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
      const category = await prisma.categoryConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id } });
      if (!category) {
        return res.status(404).json({ error: 'Categoria não encontrada.' });
      }

      // 1. Verificar materiais ou stockItems vinculados
      const materialCount = await prisma.material.count({
        where: { factoryUnitId: req.tenant!.id, type: category.name }
      });
      const stockCount = await prisma.stockItem.count({
        where: { factoryUnitId: req.tenant!.id, type: category.name }
      });
      const totalActive = materialCount + stockCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} material(is) ou item(ns) usando esta categoria.`
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
        await tx.categoryConfig.delete({ where: { id } });
      });

      res.json({ message: 'Categoria excluída com sucesso.' });
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir categoria:', error);
      res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
  }

  async getUnits(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      let units = await prisma.unitConfig.findMany({
        where: { factoryUnitId: req.tenant!.id, active: true },
        orderBy: { id: 'desc' }
      });

      if (units.length === 0) {
        const initialUnits = [
          { name: 'Metro', symbol: 'm' },
          { name: 'Metro Quadrado', symbol: 'm²' },
          { name: 'Quilograma', symbol: 'kg' },
          { name: 'Grama', symbol: 'g' },
          { name: 'Unidade', symbol: 'un' },
          { name: 'Par', symbol: 'par' },
          { name: 'Rolo', symbol: 'rolo' },
          { name: 'Centímetro', symbol: 'cm' },
          { name: 'Litro', symbol: 'l' },
          { name: 'Caixa', symbol: 'cx' }
        ];
        await prisma.unitConfig.createMany({
          data: initialUnits.map((unit) => ({ ...unit, factoryUnitId: req.tenant!.id })),
          skipDuplicates: true
        });
        units = await prisma.unitConfig.findMany({
          where: { factoryUnitId: req.tenant!.id, active: true },
          orderBy: { id: 'desc' }
        });
      }

      res.json(units);
    } catch (error) {
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

      const cleanSymbol = String(symbol).trim();
      const cleanName = String(name).trim();

      const existing = await prisma.unitConfig.findUnique({
        where: { factoryUnitId_symbol: { factoryUnitId: req.tenant!.id, symbol: cleanSymbol } },
      });
      if (existing) {
        if (!existing.active) {
          const reactivated = await prisma.unitConfig.update({
            where: { id: existing.id },
            data: { name: cleanName, active: true }
          });
          return res.status(200).json(reactivated);
        }
        return res.status(409).json({ error: 'Já existe uma unidade cadastrada com esta sigla.' });
      }

      const unit = await prisma.unitConfig.create({
        data: {
          name: cleanName,
          symbol: cleanSymbol,
          active: true,
          factoryUnitId: req.tenant!.id
        }
      });
      res.status(201).json(unit);
    } catch (error: unknown) {
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

      const materialCount = await prisma.material.count({
        where: { factoryUnitId: req.tenant!.id, unit: unit.symbol }
      });
      const stockCount = await prisma.stockItem.count({
        where: { factoryUnitId: req.tenant!.id, unit: unit.symbol }
      });
      const totalActive = materialCount + stockCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível desativar: existem ${totalActive} material(is) ou item(ns) usando esta unidade.`
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
          where: { id },
          data: { active: false }
        })
      ]);

      res.json({ message: 'Unidade desativada com sucesso.' });
    } catch (error: unknown) {
      console.error('Erro ao desativar unidade:', error);
      res.status(500).json({ error: 'Erro ao desativar unidade de medida' });
    }
  }

  async getLocations(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const locations = await prisma.location.findMany({
        where: { factoryUnitId: req.tenant!.id },
        orderBy: { id: 'desc' },
        include: {
          category: true,
          categoryLinks: {
            include: { category: true }
          }
        }
      });
      res.json(locations);
    } catch (error) {
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

      const { name, categoryId, categoryIds } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da localização é obrigatório.' });
      }

      // Suporta array de IDs ou único ID
      let idsToLink: number[] = [];
      if (Array.isArray(categoryIds) && categoryIds.length > 0) {
        idsToLink = categoryIds.map(Number).filter((id) => !isNaN(id) && id > 0);
      } else if (categoryId) {
        idsToLink = [Number(categoryId)];
      }

      if (idsToLink.length === 0) {
        return res.status(400).json({ error: 'Ao menos uma categoria vinculada é obrigatória.' });
      }

      const validCategories = await prisma.categoryConfig.findMany({
        where: { id: { in: idsToLink }, factoryUnitId: req.tenant!.id },
        select: { id: true }
      });

      if (validCategories.length === 0) {
        return res.status(404).json({ error: 'Nenhuma categoria válida encontrada.' });
      }

      const finalCategoryIds = validCategories.map(c => c.id);
      const primaryCategoryId = finalCategoryIds[0];

      const location = await prisma.location.create({
        data: {
          name: String(name).trim(),
          categoryId: primaryCategoryId,
          factoryUnitId: req.tenant!.id,
          categoryLinks: {
            create: finalCategoryIds.map(cId => ({
              categoryId: cId
            }))
          }
        },
        include: {
          category: true,
          categoryLinks: {
            include: { category: true }
          }
        }
      });
      res.status(201).json(location);
    } catch (error: unknown) {
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
      const { name, categoryIds } = req.body;

      const existing = await prisma.location.findFirst({
        where: { id, factoryUnitId: req.tenant!.id }
      });
      if (!existing) {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }

      let finalCategoryIds: number[] | undefined;
      if (Array.isArray(categoryIds) && categoryIds.length > 0) {
        const validCategories = await prisma.categoryConfig.findMany({
          where: { id: { in: categoryIds.map(Number) }, factoryUnitId: req.tenant!.id },
          select: { id: true }
        });
        finalCategoryIds = validCategories.map(c => c.id);
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (finalCategoryIds && finalCategoryIds.length > 0) {
          // Remove vínculos antigos
          await tx.locationCategory.deleteMany({
            where: { locationId: id, factoryUnitId: req.tenant!.id }
          });
          // Cria novos vínculos
          await tx.locationCategory.createMany({
            data: finalCategoryIds.map(cId => ({
              locationId: id,
              categoryId: cId,
              factoryUnitId: req.tenant!.id
            }))
          });
        }

        const loc = await tx.location.update({
          where: { id },
          data: {
            name: name ? String(name).trim() : undefined,
            categoryId: finalCategoryIds && finalCategoryIds.length > 0 ? finalCategoryIds[0] : undefined
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
        where: { id, factoryUnitId: req.tenant!.id }
      });
      if (!location) {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }

      // 1. Verificar vínculos em MaterialLocation (Corte legado) e StockItemLocation (Multi-setor)
      const materialCount = await prisma.materialLocation.count({
        where: { factoryUnitId: req.tenant!.id, locationId: id, quantity: { gt: 0 } }
      });
      const stockCount = await prisma.stockItemLocation.count({
        where: { factoryUnitId: req.tenant!.id, locationId: id, quantity: { gt: 0 } }
      });
      const totalActive = materialCount + stockCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} material(is) ou saldo(s) ativo(s) vinculado(s) a esta localização.`
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
        await tx.materialLocation.deleteMany({ where: { locationId: id, factoryUnitId: req.tenant!.id } });
        await tx.stockItemLocation.deleteMany({ where: { locationId: id, factoryUnitId: req.tenant!.id } });
        await tx.location.deleteMany({ where: { id, factoryUnitId: req.tenant!.id } });
      });

      res.json({ message: 'Localização excluída com sucesso.' });
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir localização:', error);
      res.status(500).json({ error: 'Erro ao excluir localização' });
    }
  }

  async getOrigins(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const origins = await prisma.originConfig.findMany({
        where: { factoryUnitId: req.tenant!.id },
        orderBy: { id: 'desc' }
      });
      res.json(origins);
    } catch (error) {
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

      const { name } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da origem é obrigatório.' });
      }
      const origin = await prisma.originConfig.create({
        data: { name: String(name).trim(), factoryUnitId: req.tenant!.id }
      });
      res.status(201).json(origin);
    } catch (error: unknown) {
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
        where: { id, factoryUnitId: req.tenant!.id }
      });
      if (!origin) {
        return res.status(404).json({ error: 'Origem não encontrada.' });
      }

      const movementCount = await prisma.movement.count({
        where: { factoryUnitId: req.tenant!.id, origem: origin.name }
      });
      const stockMovementCount = await prisma.stockMovement.count({
        where: { factoryUnitId: req.tenant!.id, origem: origin.name }
      });
      const totalActive = movementCount + stockMovementCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} movimentação(ões) vinculadas a esta origem.`
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
        prisma.originConfig.deleteMany({ where: { id, factoryUnitId: req.tenant!.id } })
      ]);

      res.json({ message: 'Origem excluída com sucesso.' });
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir origem:', error);
      res.status(500).json({ error: 'Erro ao excluir origem' });
    }
  }
}
