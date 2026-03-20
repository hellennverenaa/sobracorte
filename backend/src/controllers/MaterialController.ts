import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class MaterialController {
  async index(req: Request, res: Response) {
    try {
      const { q, _page, _limit } = req.query;
      const whereClause: any = q ? {
        OR: [
          { name: { contains: String(q), mode: 'insensitive' } },
          { code: { contains: String(q), mode: 'insensitive' } }
        ]
      } : {};

      const totalItems = await prisma.material.count({ where: whereClause });
      res.set('X-Total-Count', totalItems.toString());

      const page = Number(_page) || 1;
      const limit = Number(_limit) || 50;
      const skip = (page - 1) * limit;

      const materials = await prisma.material.findMany({
        where: whereClause,
        skip: skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      });

      const formatted = materials.map(m => ({
        ...m,
        codigo: m.code,
        descricao: m.name,
        quantidade: m.quantity,
        unidade: m.unit,
        tipo: m.type,
        observacoes: m.observation,
        data_cadastro: m.createdAt,
      }));

      res.json(formatted);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar materiais' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const novo = await prisma.material.create({
        data: {
          code: String(req.body.codigo || req.body.code),
          name: String(req.body.descricao || req.body.name),
          quantity: Number(req.body.quantidade || req.body.quantity || 0),
          unit: String(req.body.unidade || req.body.unit || 'UN'),
          type: String(req.body.tipo || req.body.type || 'outros'),
          observation: String(req.body.observacoes || req.body.observation || ''),
        }
      });
      res.json(novo);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar material' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const atualizado = await prisma.material.update({
        where: { id: Number(req.params.id) },
        data: {
          code: req.body.codigo ? String(req.body.codigo) : undefined,
          name: req.body.descricao ? String(req.body.descricao) : undefined,
          quantity: req.body.quantidade !== undefined ? Number(req.body.quantidade) : undefined,
          unit: req.body.unidade ? String(req.body.unidade) : undefined,
          type: req.body.tipo ? String(req.body.tipo) : undefined,
          observation: req.body.observacoes !== undefined ? String(req.body.observacoes) : undefined,
        }
      });
      res.json(atualizado);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar material' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await prisma.material.delete({ where: { id: Number(req.params.id) } });
      res.json({ message: 'Deletado com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao deletar material' });
    }
  }

 async stats(req: Request, res: Response) {
    try {
      const [totalMaterials, lowStock, totalMovements, totalEntries] = await Promise.all([
        prisma.material.count(), 
        prisma.material.count({ where: { quantity: { lte: 10 } } }), 
        prisma.movement.count(), 
        prisma.movement.count({ where: { type: 'entrada' } }) // <-- Agora o banco conta as Entradas Reais!
      ]);
      res.json({ totalMaterials, lowStock, totalMovements, totalEntries });
    } catch (error) {
      res.status(500).json({ error: 'Erro nas estatísticas' });
    }
  }
}