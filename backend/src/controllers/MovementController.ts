import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class MovementController {
  async index(req: Request, res: Response) {
    try {
      const movements = await prisma.movement.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { material: true } 
      });
      
      const formatted = movements.map(m => ({
        ...m,
        id: m.id,
        tipo: m.type,
        quantidade: m.quantity,
        data: m.createdAt,
        motivo: m.reason,
        observacao: m.reason,
        usuario: m.operatorName,
        operador: m.operatorName, 
        material: m.material, 
        nomeMaterial: m.material?.name || m.material?.code
      }));
      
      res.json(formatted);
    } catch (error) {
      res.status(500).json({ error: 'Erro nas movimentações' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const materialId = Number(req.body.materialId || req.body.material_id);
      const quantidade = Number(req.body.quantidade || req.body.quantity);
      const tipo = String(req.body.tipo || req.body.type).toLowerCase(); 
      
      const result = await prisma.$transaction(async (tx) => {
        const movement = await tx.movement.create({
          data: {
            materialId: materialId,
            type: tipo, 
            quantity: quantidade,
            reason: req.body.observacao || req.body.reason || '',
            operatorName: req.body.usuario || 'Usuário DASS' 
          }
        });

        if (tipo === 'entrada') {
          await tx.material.update({ where: { id: materialId }, data: { quantity: { increment: quantidade } } });
        } else if (tipo === 'saida') {
          await tx.material.update({ where: { id: materialId }, data: { quantity: { decrement: quantidade } } });
        }
        return movement;
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao salvar movimentação' });
    }
  }
}