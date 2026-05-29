import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class SettingsController {

  // ============================================================
  // 🏷️ CATEGORIAS — governa os valores permitidos de Material.type
  // ============================================================

  async getCategories(req: Request, res: Response) {
    try {
      const categories = await prisma.categoryConfig.findMany({
        orderBy: { name: 'asc' }
      });
      res.json(categories);
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
      res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
  }

  async createCategory(req: Request, res: Response) {
    try {
      const { name, unitLock } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      }
      const category = await prisma.categoryConfig.create({
        data: {
          name: String(name).trim().toUpperCase(),
          unitLock: unitLock || 'livre'
        }
      });
      res.status(201).json(category);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Essa categoria já existe.' });
      }
      console.error('Erro ao criar categoria:', error);
      res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  }

  async deleteCategory(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      // Verifica se há materiais usando essa categoria antes de excluir
      const category = await prisma.categoryConfig.findUnique({ where: { id } });
      if (!category) {
        return res.status(404).json({ error: 'Categoria não encontrada.' });
      }
      const materiaisVinculados = await prisma.material.count({
        where: { type: category.name }
      });
      if (materiaisVinculados > 0) {
        return res.status(409).json({
          error: `Não é possível excluir: ${materiaisVinculados} material(is) usa(m) esta categoria.`
        });
      }
      await prisma.categoryConfig.delete({ where: { id } });
      res.json({ message: 'Categoria excluída com sucesso.' });
    } catch (error: any) {
      if (error.code === 'P2003') {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir categoria:', error);
      res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
  }

  // ============================================================
  // 📍 LOCALIZAÇÕES — tabela Location já existente
  // ============================================================

  async getLocations(req: Request, res: Response) {
    try {
      const locations = await prisma.location.findMany({
        orderBy: { name: 'asc' }
      });
      res.json(locations);
    } catch (error) {
      console.error('Erro ao buscar localizações:', error);
      res.status(500).json({ error: 'Erro ao buscar localizações' });
    }
  }

  async createLocation(req: Request, res: Response) {
    try {
      const { name } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da localização é obrigatório.' });
      }
      const location = await prisma.location.create({
        data: { name: String(name).trim() }
      });
      res.status(201).json(location);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Essa localização já existe.' });
      }
      console.error('Erro ao criar localização:', error);
      res.status(500).json({ error: 'Erro ao criar localização' });
    }
  }

  async deleteLocation(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      // Verifica se há materiais alocados nessa localização
      const materiaisVinculados = await prisma.materialLocation.count({
        where: { locationId: id, quantity: { gt: 0 } }
      });
      if (materiaisVinculados > 0) {
        return res.status(409).json({
          error: `Não é possível excluir: ${materiaisVinculados} material(is) tem saldo nesta localização.`
        });
      }
      await prisma.location.delete({ where: { id } });
      res.json({ message: 'Localização excluída com sucesso.' });
    } catch (error: any) {
      if (error.code === 'P2003') {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir localização:', error);
      res.status(500).json({ error: 'Erro ao excluir localização' });
    }
  }

  // ============================================================
  // 🔖 ORIGENS — governa os valores permitidos de Movement.origem
  // ============================================================

  async getOrigins(req: Request, res: Response) {
    try {
      const origins = await prisma.originConfig.findMany({
        orderBy: { name: 'asc' }
      });
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
        data: { name: String(name).trim() }
      });
      res.status(201).json(origin);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Essa origem já existe.' });
      }
      console.error('Erro ao criar origem:', error);
      res.status(500).json({ error: 'Erro ao criar origem' });
    }
  }

  async deleteOrigin(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      await prisma.originConfig.delete({ where: { id } });
      res.json({ message: 'Origem excluída com sucesso.' });
    } catch (error: any) {
      if (error.code === 'P2003') {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir origem:', error);
      res.status(500).json({ error: 'Erro ao excluir origem' });
    }
  }
}
