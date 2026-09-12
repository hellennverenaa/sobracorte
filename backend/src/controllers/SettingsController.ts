import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { DEFAULT_MEASUREMENT_UNITS, DEFAULT_ORIGINS } from '../settings/defaults';

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === code;
}

export class SettingsController {

  async getCategories(req: Request, res: Response) {
    try {
      const categories = await prisma.categoryConfig.findMany({
        where: { factoryUnitId: req.tenant!.id },
        orderBy: { name: 'asc' },
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
      const { name, defaultUnitId, unitLocked } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      }
      if (defaultUnitId !== undefined && defaultUnitId !== null) {
        if (!Number.isInteger(Number(defaultUnitId)) || Number(defaultUnitId) <= 0) return res.status(400).json({ error: 'Unidade de medida inválida.' });
        const unit = await prisma.unitConfig.findFirst({
          where: { id: Number(defaultUnitId), factoryUnitId: req.tenant!.id, active: true }, select: { id: true },
        });
        if (!unit) return res.status(404).json({ error: 'Unidade de medida não encontrada.' });
      }
      const locked = Boolean(unitLocked);
      if (locked && !defaultUnitId) return res.status(400).json({ error: 'Categoria com unidade fixa exige unidade padrão.' });
      const category = await prisma.categoryConfig.create({
        data: {
          name: String(name).trim().toUpperCase(),
          defaultUnitId: defaultUnitId ? Number(defaultUnitId) : null,
          unitLocked: locked,
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
      const id = Number(req.params.id);
      const { name, defaultUnitId, unitLocked } = req.body;

      const existing = await prisma.categoryConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id } });
      if (!existing) return res.status(404).json({ error: 'Categoria não encontrada.' });
      if (defaultUnitId !== undefined && defaultUnitId !== null) {
        if (!Number.isInteger(Number(defaultUnitId)) || Number(defaultUnitId) <= 0) return res.status(400).json({ error: 'Unidade de medida inválida.' });
        const unit = await prisma.unitConfig.findFirst({
          where: { id: Number(defaultUnitId), factoryUnitId: req.tenant!.id, active: true }, select: { id: true },
        });
        if (!unit) return res.status(404).json({ error: 'Unidade de medida não encontrada.' });
      }
      const nextDefault = defaultUnitId !== undefined ? (defaultUnitId ? Number(defaultUnitId) : null) : existing.defaultUnitId;
      const nextLocked = unitLocked !== undefined ? Boolean(unitLocked) : existing.unitLocked;
      if (nextLocked && !nextDefault) return res.status(400).json({ error: 'Categoria com unidade fixa exige unidade padrão.' });
      if (nextLocked) {
        const incompatibleMaterials = await prisma.material.count({
          where: { factoryUnitId: req.tenant!.id, categoryId: id, unitId: { not: nextDefault! } },
        });
        if (incompatibleMaterials > 0) {
          return res.status(409).json({ error: `Não é possível fixar esta unidade: ${incompatibleMaterials} material(is) usa(m) outra unidade.` });
        }
      }
      const category = await prisma.categoryConfig.update({
        where: { id },
        data: {
          name: name ? String(name).trim().toUpperCase() : undefined,
          defaultUnitId: defaultUnitId !== undefined ? (defaultUnitId ? Number(defaultUnitId) : null) : undefined,
          unitLocked: unitLocked !== undefined ? Boolean(unitLocked) : undefined
        },
        include: { defaultUnit: true }
      });
      res.json(category);
    } catch (error: unknown) {
      console.error('Erro ao atualizar categoria:', error);
      res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
  }

  async deleteCategory(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const category = await prisma.categoryConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id } });
      if (!category) {
        return res.status(404).json({ error: 'Categoria não encontrada.' });
      }
      const materiaisVinculados = await prisma.material.count({
        where: { factoryUnitId: req.tenant!.id, categoryId: category.id }
      });
      if (materiaisVinculados > 0) {
        return res.status(409).json({
          error: `Não é possível excluir: ${materiaisVinculados} material(is) usa(m) esta categoria.`
        });
      }
      await prisma.categoryConfig.delete({ where: { id } });
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
      let units = await prisma.unitConfig.findMany({
        where: { factoryUnitId: req.tenant!.id, active: true },
        orderBy: { symbol: 'asc' }
      });

      if (units.length === 0) {
        await prisma.unitConfig.createMany({
          data: DEFAULT_MEASUREMENT_UNITS.map((unit) => ({ ...unit, factoryUnitId: req.tenant!.id })),
          skipDuplicates: true
        });
        units = await prisma.unitConfig.findMany({
          where: { factoryUnitId: req.tenant!.id, active: true },
          orderBy: { symbol: 'asc' }
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
      const { name, symbol } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da unidade é obrigatório.' });
      }
      if (!symbol || !String(symbol).trim()) {
        return res.status(400).json({ error: 'A sigla da unidade é obrigatória.' });
      }

      const cleanSymbol = String(symbol).trim().toLowerCase().replace(/^m2$|^mt2$/, 'm²');
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
      const id = Number(req.params.id);
      const unit = await prisma.unitConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id } });
      if (!unit) {
        return res.status(404).json({ error: 'Unidade de medida não encontrada.' });
      }

      const materiaisVinculados = await prisma.material.count({ where: { factoryUnitId: req.tenant!.id, unitId: id } });
      if (materiaisVinculados > 0) {
        return res.status(409).json({ error: `Não é possível desativar: ${materiaisVinculados} material(is) usa(m) esta unidade.` });
      }
      const categoriasVinculadas = await prisma.categoryConfig.count({ where: { factoryUnitId: req.tenant!.id, defaultUnitId: id } });
      if (categoriasVinculadas > 0) {
        return res.status(409).json({ error: `Não é possível desativar: ${categoriasVinculadas} categoria(s) usa(m) esta unidade como padrão.` });
      }

      await prisma.unitConfig.update({
        where: { id },
        data: { active: false }
      });
      res.json({ message: 'Unidade desativada com sucesso.' });
    } catch (error: unknown) {
      console.error('Erro ao desativar unidade:', error);
      res.status(500).json({ error: 'Erro ao desativar unidade de medida' });
    }
  }

  async getLocations(req: Request, res: Response) {
    try {
      const locations = await prisma.location.findMany({
        where: { factoryUnitId: req.tenant!.id },
        orderBy: { name: 'asc' },
        include: { categories: { include: { category: true } } }
      });
      res.json(locations.map(({ categories, ...location }) => ({
        ...location,
        categories: categories.map((link) => link.category),
      })));
    } catch (error) {
      console.error('Erro ao buscar localizações:', error);
      res.status(500).json({ error: 'Erro ao buscar localizações' });
    }
  }

  async createLocation(req: Request, res: Response) {
    try {
      const { name, categoryIds } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da localização é obrigatório.' });
      }
      if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos uma categoria permitida.' });
      }
      const normalizedCategoryIds = [...new Set(categoryIds.map(Number))];
      if (normalizedCategoryIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        return res.status(400).json({ error: 'Categoria inválida.' });
      }
      const categories = await prisma.categoryConfig.findMany({
        where: { id: { in: normalizedCategoryIds }, factoryUnitId: req.tenant!.id }, select: { id: true },
      });
      if (categories.length !== normalizedCategoryIds.length) {
        return res.status(404).json({ error: 'Uma ou mais categorias não foram encontradas.' });
      }
      const location = await prisma.location.create({
        data: {
          name: String(name).trim(),
          factoryUnitId: req.tenant!.id,
          categories: {
            create: normalizedCategoryIds.map((categoryId) => ({
              category: {
                connect: {
                  id_factoryUnitId: { id: categoryId, factoryUnitId: req.tenant!.id },
                },
              },
            })),
          },
        },
        include: { categories: { include: { category: true } } }
      });
      const { categories: links, ...createdLocation } = location;
      res.status(201).json({ ...createdLocation, categories: links.map((link) => link.category) });
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Essa localização já existe.' });
      }
      console.error('Erro ao criar localização:', error);
      res.status(500).json({ error: 'Erro ao criar localização' });
    }
  }

  async deleteLocation(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const materiaisVinculados = await prisma.materialLocation.count({
        where: { factoryUnitId: req.tenant!.id, locationId: id, quantity: { gt: 0 } }
      });
      if (materiaisVinculados > 0) {
        return res.status(409).json({
          error: `Não é possível excluir: ${materiaisVinculados} material(is) tem saldo nesta localização.`
        });
      }
      const deleted = await prisma.$transaction(async (tx) => {
        await tx.materialLocation.deleteMany({ where: { factoryUnitId: req.tenant!.id, locationId: id, quantity: 0 } });
        return tx.location.deleteMany({ where: { id, factoryUnitId: req.tenant!.id } });
      });
      if (deleted.count === 0) return res.status(404).json({ error: 'Localização não encontrada.' });
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
      let origins = await prisma.originConfig.findMany({
        where: { factoryUnitId: req.tenant!.id },
        orderBy: { name: 'asc' }
      });
      if (origins.length === 0) {
        await prisma.originConfig.createMany({
          data: DEFAULT_ORIGINS.map((name) => ({ name, factoryUnitId: req.tenant!.id })),
          skipDuplicates: true,
        });
        origins = await prisma.originConfig.findMany({
          where: { factoryUnitId: req.tenant!.id },
          orderBy: { name: 'asc' },
        });
      }
      res.json(origins);
    } catch (error) {
      console.error('Erro ao buscar origens:', error);
      res.status(500).json({ error: 'Erro ao buscar origens' });
    }
  }

  async createOrigin(req: Request, res: Response) {
    try {
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
      const id = Number(req.params.id);
      const deleted = await prisma.originConfig.deleteMany({ where: { id, factoryUnitId: req.tenant!.id } });
      if (deleted.count === 0) return res.status(404).json({ error: 'Origem não encontrada.' });
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
