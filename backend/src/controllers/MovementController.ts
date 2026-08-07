import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { MovementRequestError, parseMovementInput } from '../movements/validation';

export class MovementController {
  async index(_req: Request, res: Response) {
    try {
      const movements = await prisma.movement.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { material: true },
      });

      res.json(movements.map((movement) => ({
        ...movement,
        tipo: movement.type,
        quantidade: movement.quantity,
        data: movement.createdAt,
        motivo: movement.reason,
        observacao: movement.reason,
        usuario: movement.operatorName,
        operador: movement.operatorName,
        nomeMaterial: movement.material?.name || movement.material?.code,
      })));
    } catch {
      res.status(500).json({ error: 'Erro ao buscar movimentações.' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const input = parseMovementInput(req.body);
      const operatorId = req.user?.matricula ? String(req.user.matricula) : null;
      const operatorName = req.user?.nome || req.user?.usuario;

      if (!operatorName) {
        return res.status(401).json({ error: 'Operador não identificado.' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const [material, location] = await Promise.all([
          tx.material.findUnique({ where: { id: input.materialId }, select: { id: true } }),
          tx.location.findUnique({ where: { name: input.location }, select: { id: true } }),
        ]);

        if (!material) throw new MovementRequestError('Material não encontrado.', 404);
        if (!location) throw new MovementRequestError('Localização não encontrada.', 404);

        if (input.type === 'entrada') {
          await tx.material.update({
            where: { id: input.materialId },
            data: { quantity: { increment: input.quantity } },
          });
          await tx.materialLocation.upsert({
            where: { materialId_locationId: { materialId: input.materialId, locationId: location.id } },
            update: { quantity: { increment: input.quantity } },
            create: { materialId: input.materialId, locationId: location.id, quantity: input.quantity },
          });
        } else {
          const locationUpdate = await tx.materialLocation.updateMany({
            where: {
              materialId: input.materialId,
              locationId: location.id,
              quantity: { gte: input.quantity },
            },
            data: { quantity: { decrement: input.quantity } },
          });
          if (locationUpdate.count === 0) {
            throw new MovementRequestError(`Estoque insuficiente na localização: ${input.location}`, 409);
          }

          const materialUpdate = await tx.material.updateMany({
            where: { id: input.materialId, quantity: { gte: input.quantity } },
            data: { quantity: { decrement: input.quantity } },
          });
          if (materialUpdate.count === 0) {
            throw new Error('Saldo total inconsistente com o saldo da localização.');
          }
        }

        return tx.movement.create({
          data: {
            materialId: input.materialId,
            type: input.type,
            quantity: input.quantity,
            origem: input.origin,
            reason: input.reason,
            operatorId,
            operatorName,
          },
        });
      });

      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof MovementRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Erro interno ao salvar movimentação.');
      return res.status(500).json({ error: 'Erro interno ao salvar movimentação.' });
    }
  }
}
