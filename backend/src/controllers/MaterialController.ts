import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '../generated/prisma';

type ImportedMaterial = {
  code?: unknown;
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  type?: unknown;
};

export class MaterialController {
  async index(req: Request, res: Response) {
    try {
      const { q, _page, _limit } = req.query;
      const whereClause: Prisma.MaterialWhereInput = {
        factoryUnitId: req.tenant!.id,
        ...(q ? {
          OR: [
            { name: { contains: String(q), mode: 'insensitive' } },
            { code: { contains: String(q), mode: 'insensitive' } }
          ]
        } : {}),
      };

      const totalItems = await prisma.material.count({ where: whereClause });
      res.set('X-Total-Count', totalItems.toString());

      const requestedPage = Number(_page);
      const requestedLimit = Number(_limit);
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
      const skip = (page - 1) * limit;

      const materials = await prisma.material.findMany({
        where: whereClause,
        skip: skip,
        take: limit,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' } 
        ],
        include: { 
          locations: { 
            include: { location: true } 
          } 
        }
      });

      const formatted = materials.map((m) => {
        const prateleirasComSaldo = m.locations.filter((ml) => Number(ml.quantity) > 0);
        
        let localExibicao = 'Não definido';
        
        if (prateleirasComSaldo.length > 0) {
          localExibicao = prateleirasComSaldo.map((ml) => ml.location.name).join(' | ');
        }
        
        return {
          ...m,
          codigo: m.code,
          descricao: m.name,
          quantidade: m.quantity,
          unidade: m.unit,
          tipo: m.type,
          observacoes: m.observation,
          data_cadastro: m.createdAt,
          location: localExibicao
        };
      });

      res.json(formatted);
    } catch (error) {
      console.error("Erro ao buscar materiais: ", error)
      res.status(500).json({ error: 'Erro ao buscar materiais' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const locationName = String(req.body.location || '').trim();
      const qtdInicial = Number(req.body.quantidade ?? req.body.quantity ?? 0);

      if (!locationName) return res.status(400).json({ error: 'A localização é obrigatória.' });
      if (!Number.isFinite(qtdInicial) || qtdInicial < 0) {
        return res.status(400).json({ error: 'O saldo inicial deve ser um número maior ou igual a zero.' });
      }

      const novo = await prisma.$transaction(async (tx) => {
        let loc = await tx.location.findUnique({
          where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: locationName } },
        });
        if (!loc) loc = await tx.location.create({ data: { name: locationName, factoryUnitId: req.tenant!.id } });

        const material = await tx.material.create({
          data: {
            code: String(req.body.codigo || req.body.code),
            name: String(req.body.descricao || req.body.name),
            quantity: qtdInicial,
            unit: String(req.body.unidade || req.body.unit || 'UN'),
            type: String(req.body.tipo || req.body.type || 'outros'),
            observation: String(req.body.observacoes || req.body.observation || ''),
            factoryUnitId: req.tenant!.id,
            locations: { create: { locationId: loc.id, quantity: qtdInicial } },
          },
        });

        if (qtdInicial > 0) {
          await tx.movement.create({
            data: {
              materialId: material.id,
              factoryUnitId: req.tenant!.id,
              type: 'entrada',
              quantity: qtdInicial,
              reason: 'Saldo Inicial de Implantação',
              operatorId: req.user?.matricula ? String(req.user.matricula) : null,
              operatorName: req.user?.nome || req.user?.usuario || 'Sistema / Implantação',
            },
          });
        }

        return material;
      });
      
      res.status(201).json(novo);
    } catch (error) {
      if ((error as any)?.code === 'P2002' || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        return res.status(409).json({ error: 'Já existe um material com esse código.' });
      }
      console.error('Erro interno ao criar material.');
      res.status(500).json({ error: 'Erro ao criar material. Verifique duplicidade.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const materialId = Number(req.params.id);
      const locationName = req.body.location ? String(req.body.location).trim() : null;

      if (!Number.isInteger(materialId) || materialId <= 0) {
        return res.status(400).json({ error: 'Material inválido.' });
      }
      if (req.body.quantity !== undefined || req.body.quantidade !== undefined) {
        return res.status(400).json({ error: 'O saldo só pode ser alterado por uma movimentação.' });
      }

      const atualizado = await prisma.$transaction(async (tx) => {
        const existingMaterial = await tx.material.findFirst({
          where: { id: materialId, factoryUnitId: req.tenant!.id }, select: { id: true },
        });
        if (!existingMaterial) throw new Error('MATERIAL_NOT_FOUND');
        if (locationName) {
          const loc = await tx.location.findUnique({
            where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: locationName } },
          });
          if (!loc) throw new Error('LOCATION_NOT_FOUND');
          await tx.materialLocation.upsert({
            where: { materialId_locationId: { materialId, locationId: loc.id } },
            update: {},
            create: { materialId, locationId: loc.id, factoryUnitId: req.tenant!.id, quantity: 0 },
          });
        }

        return tx.material.update({
          where: { id: materialId },
          data: {
            code: req.body.code !== undefined ? String(req.body.code) : undefined,
            name: req.body.name !== undefined ? String(req.body.name) : undefined,
            unit: req.body.unit !== undefined ? String(req.body.unit) : undefined,
            type: req.body.type !== undefined ? String(req.body.type) : undefined,
            observation: req.body.observation !== undefined ? String(req.body.observation) : undefined,
          },
        });
      });
      
      res.json(atualizado);
    } catch (error) {
      if (error instanceof Error && error.message === 'LOCATION_NOT_FOUND') {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }
      if (error instanceof Error && error.message === 'MATERIAL_NOT_FOUND') {
        return res.status(404).json({ error: 'Material não encontrado.' });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return res.status(404).json({ error: 'Material não encontrado.' });
      }
      console.error('Erro interno ao atualizar material.');
      res.status(500).json({ error: 'Erro ao atualizar material' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const result = await prisma.material.deleteMany({
        where: { id: Number(req.params.id), factoryUnitId: req.tenant!.id },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Material não encontrado.' });
      res.json({ message: 'Deletado com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar material:', error);
      res.status(500).json({ error: 'Erro ao deletar material' });
    }
  }

  async stats(req: Request, res: Response) {
    try {
      const [totalMaterials, lowStock, totalMovements, totalEntries] = await Promise.all([
        prisma.material.count({ where: { factoryUnitId: req.tenant!.id } }),
        prisma.material.count({ where: { factoryUnitId: req.tenant!.id, quantity: { lte: 10 } } }),
        prisma.movement.count({ where: { factoryUnitId: req.tenant!.id } }),
        prisma.movement.count({ where: { factoryUnitId: req.tenant!.id, type: 'entrada' } })
      ]);
      res.json({ totalMaterials, lowStock, totalMovements, totalEntries });
    } catch (error) {
      console.error('Erro nas estatísticas:', error);
      res.status(500).json({ error: 'Erro nas estatísticas' });
    }
  }

  async importBatch(req: Request, res: Response) {
    try {
      const { materiais } = req.body;

      if (!Array.isArray(materiais) || materiais.length === 0) {
        return res.status(400).json({ error: 'O payload deve ser um array de materiais.' });
      }

      const dadosLimpos = (materiais as ImportedMaterial[]).map((m) => ({
        code: String(m.code || '').trim(),
        name: String(m.name || '').trim().toUpperCase(),
        quantity: Number(String(m.quantity).replace(',', '.')) || 0,
        unit: String(m.unit || 'UN').toUpperCase(),
        type: String(m.type || 'OUTRO').toLowerCase(),
      })).filter((m) => m.code !== '' && m.name !== '');

      let inseridos = 0;
      let ignorados = 0;

      for (const item of dadosLimpos) {
        try {
          await prisma.$transaction(async (tx) => {
            let loc = await tx.location.findUnique({
              where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: 'GERAL' } },
            });
            if (!loc) {
              loc = await tx.location.create({ data: { name: 'GERAL', factoryUnitId: req.tenant!.id } });
            }

            const material = await tx.material.create({
              data: {
                factoryUnitId: req.tenant!.id,
                code: item.code,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                type: item.type,
                observation: 'Importado via lote (API)',
                locations: { create: { locationId: loc.id, quantity: item.quantity } },
              },
            });

            if (item.quantity > 0) {
              await tx.movement.create({
                data: {
                  materialId: material.id,
                  factoryUnitId: req.tenant!.id,
                  type: 'entrada',
                  quantity: item.quantity,
                  reason: 'Saldo Inicial de Implantação',
                  operatorId: req.user?.matricula ? String(req.user.matricula) : null,
                  operatorName: req.user?.nome || req.user?.usuario || 'Sistema / Implantação',
                },
              });
            }
          });
          inseridos++;
        } catch (err: any) {
          if (err?.code === 'P2002') {
            ignorados++; // duplicado — pula silenciosamente
          } else {
            throw err; // outro erro — aborta
          }
        }
      }

      return res.status(201).json({
        message: 'Importação concluída com sucesso.',
        inseridos,
        ignorados,
      });

    } catch (error) {
      console.error('Erro no Bulk Insert:', error);
      return res.status(500).json({ error: 'Erro interno ao processar o lote.' });
    }
  }
}
