import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { MovementRequestError, parseMovementInput } from '../movements/validation';

export class MovementController {
  async index(req: Request, res: Response) {
    try {
      const requestedPage = Number(req.query.page);
      const requestedPageSize = Number(req.query.pageSize);
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, 200) : 50;
      const q = String(req.query.q ?? '').trim();
      const where = {
        factoryUnitId: req.tenant!.id,
        ...(q ? { OR: [
          { materialCode: { contains: q, mode: 'insensitive' as const } },
          { materialName: { contains: q, mode: 'insensitive' as const } },
        ] } : {}),
      };
      const [total, movements] = await Promise.all([
        prisma.movement.count({ where }),
        prisma.movement.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      ]);

      res.json({
        data: movements.map((movement) => ({
          id: movement.id,
          type: movement.type,
          quantity: String(movement.quantity),
          createdAt: movement.createdAt,
          reason: movement.reason,
          operatorId: movement.operatorId,
          operatorName: movement.operatorName,
          originId: movement.originId,
          originName: movement.originName,
          locationId: movement.locationId,
          locationName: movement.locationName,
          material: {
            id: movement.materialId,
            code: movement.materialCode,
            name: movement.materialName,
            categoryName: movement.materialCategory,
            unit: movement.materialUnit,
          },
        })),
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
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
        const material = await tx.material.findFirst({ where: { id: input.materialId, factoryUnitId: req.tenant!.id }, include: { category: true, unit: true } });
        const location = input.locationId
          ? await tx.location.findFirst({ where: { id: input.locationId, factoryUnitId: req.tenant!.id } })
          : await tx.location.findUnique({ where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: input.location } } });

        if (!material) throw new MovementRequestError('Material não encontrado.', 404);
        if (!location) throw new MovementRequestError('Localização não encontrada.', 404);
        const allowed = await tx.locationCategory.findFirst({ where: { locationId: location.id, categoryId: material.categoryId, factoryUnitId: req.tenant!.id } });
        if (!allowed) throw new MovementRequestError('A categoria do material não é permitida nessa localização.', 400);

        const origin = input.type === 'entrada'
          ? (input.originId
            ? await tx.originConfig.findFirst({ where: { id: input.originId, factoryUnitId: req.tenant!.id } })
            : await tx.originConfig.findUnique({ where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: input.origin! } } }))
          : null;
        if (input.type === 'entrada' && !origin) throw new MovementRequestError('Origem não encontrada.', 400);

        if (input.type === 'entrada') {
          await tx.material.update({
            where: { id: input.materialId },
            data: { quantity: { increment: input.quantity } },
          });
          await tx.materialLocation.upsert({
            where: { materialId_locationId: { materialId: input.materialId, locationId: location.id } },
            update: { quantity: { increment: input.quantity } },
            create: { materialId: input.materialId, locationId: location.id, factoryUnitId: req.tenant!.id, quantity: input.quantity },
          });
        } else {
          const locationUpdate = await tx.materialLocation.updateMany({
            where: {
              materialId: input.materialId,
              locationId: location.id,
              factoryUnitId: req.tenant!.id,
              quantity: { gte: input.quantity },
            },
            data: { quantity: { decrement: input.quantity } },
          });
          if (locationUpdate.count === 0) {
            throw new MovementRequestError(`Estoque insuficiente na localização: ${location.name}`, 409);
          }

          const materialUpdate = await tx.material.updateMany({
            where: { id: input.materialId, factoryUnitId: req.tenant!.id, quantity: { gte: input.quantity } },
            data: { quantity: { decrement: input.quantity } },
          });
          if (materialUpdate.count === 0) {
            throw new Error('Saldo total inconsistente com o saldo da localização.');
          }
        }

        return tx.movement.create({
          data: {
            materialId: input.materialId,
            factoryUnitId: req.tenant!.id,
            type: input.type,
            quantity: input.quantity,
            originId: origin?.id ?? null,
            originName: origin?.name ?? null,
            materialCode: material.code,
            materialName: material.name,
            materialCategory: material.category.name,
            materialUnit: material.unit.symbol,
            locationId: location.id,
            locationName: location.name,
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
