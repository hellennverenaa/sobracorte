import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '../generated/prisma';
import { normalizeUnit } from '../utils/unitHelper';

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
      // `factoryUnitId` é injetado automaticamente pelo Prisma $extends (tenantContext).
      const rawSearch = q ? String(q).trim() : '';
      const searchTerms = rawSearch
        ? rawSearch.split(/[,\s\n;]+/).map((t) => t.trim()).filter(Boolean)
        : [];

      const whereClause: Prisma.MaterialWhereInput = {
        ...(searchTerms.length > 0
          ? {
              OR: searchTerms.flatMap((term) => [
                { name: { contains: term, mode: 'insensitive' as Prisma.QueryMode } },
                { code: { contains: term, mode: 'insensitive' as Prisma.QueryMode } },
                { type: { contains: term, mode: 'insensitive' as Prisma.QueryMode } },
              ]),
            }
          : {}),
      };

      const totalItems = await prisma.material.count({ where: whereClause });
      res.set('X-Total-Count', totalItems.toString());

      const requestedPage = Number(_page);
      const requestedLimit = Number(_limit);
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 10000) : 10000;
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

      const code = String(req.body.codigo || req.body.code).trim().toUpperCase();
      const name = String(req.body.descricao || req.body.name).trim().toUpperCase();
      const unit = normalizeUnit(req.body.unidade || req.body.unit, 'CORTE');
      const type = String(req.body.tipo || req.body.type || 'outros').trim().toUpperCase();

      const movimentos = qtdInicial > 0 ? {
        create: {
          factoryUnitId: req.tenant!.id,
          type: 'entrada',
          quantity: qtdInicial,
          origem: 'Saldo Inicial / Implantação',
          reason: 'Saldo Inicial de Implantação',
          materialCode: code,
          materialName: name,
          materialCategory: type,
          materialUnit: unit,
          locationName,
          operatorId: req.user?.matricula ? String(req.user.matricula) : null,
          operatorName: req.user?.nome || req.user?.usuario || 'Sistema / Implantação'
        }
      } : undefined;

      const novo = await prisma.$transaction(async (tx) => {
        let loc = await tx.location.findUnique({
          where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: locationName } },
        });
        if (!loc) loc = await tx.location.create({ data: { name: locationName, factoryUnitId: req.tenant!.id } });

        return tx.material.create({
          data: {
            code,
            name,
            quantity: qtdInicial,
            unit,
            type,
            observation: String(req.body.observacoes || req.body.observation || ''),
            factoryUnitId: req.tenant!.id,
            locations: { create: { locationId: loc.id, quantity: qtdInicial } },
            movements: movimentos,
          },
        });
      });
      
      res.status(201).json(novo);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
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
          where: { id: materialId, factoryUnitId: req.tenant!.id },
          include: { locations: true },
        });
        if (!existingMaterial) throw new Error('MATERIAL_NOT_FOUND');

        let targetUnit: string | undefined = undefined;
        if (req.body.unit !== undefined || req.body.unidade !== undefined) {
          const rawRequested = req.body.unit !== undefined ? req.body.unit : req.body.unidade;
          const requestedUnit = normalizeUnit(String(rawRequested), 'CORTE');
          const currentUnit = normalizeUnit(existingMaterial.unit, 'CORTE');

          if (requestedUnit !== currentUnit) {
            const totalQty = Number(existingMaterial.quantity || 0);
            const hasLocationBalance = existingMaterial.locations.some((l) => Number(l.quantity || 0) > 0.0001);

            if (totalQty > 0.0001 || hasLocationBalance) {
              const err: any = new Error(`Não é possível alterar a unidade de medida do material pois ele possui saldo físico ativo (${existingMaterial.quantity} ${existingMaterial.unit}). Zere o estoque antes de alterar a unidade.`);
              err.status = 400;
              throw err;
            }
          }
          targetUnit = requestedUnit;
        }

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
            code: req.body.code !== undefined ? String(req.body.code).trim().toUpperCase() : undefined,
            name: req.body.name !== undefined ? String(req.body.name).trim().toUpperCase() : undefined,
            unit: targetUnit,
            type: req.body.type !== undefined ? String(req.body.type).trim().toUpperCase() : undefined,
            observation: req.body.observation !== undefined ? String(req.body.observation) : undefined,
          },
        });
      });
      
      res.json(atualizado);
    } catch (error: any) {
      if (error?.status === 400 && error?.message) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof Error && error.message === 'LOCATION_NOT_FOUND') {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }
      if (error instanceof Error && error.message === 'MATERIAL_NOT_FOUND') {
        return res.status(404).json({ error: 'Material não encontrado.' });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return res.status(404).json({ error: 'Material não encontrado.' });
      }
      console.error('Erro interno ao atualizar material:', error);
      res.status(500).json({ error: error?.message || 'Erro ao atualizar material' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const materialId = Number(req.params.id);
      if (!Number.isInteger(materialId) || materialId <= 0) {
        return res.status(400).json({ error: 'Material inválido.' });
      }

      const factoryUnitId = req.tenant!.id;
      const operatorId = req.user?.matricula ? String(req.user.matricula) : null;
      const operatorName = req.user?.nome || req.user?.usuario || 'Administrador';

      await prisma.$transaction(
        async (tx) => {
          const material = await tx.material.findFirst({
            where: { id: materialId, factoryUnitId },
            include: {
              locations: {
                include: { location: true },
              },
            },
          });

          if (!material) {
            throw new Error('MATERIAL_NOT_FOUND');
          }

          const totalQty = Number(material.quantity || 0);
          const hasLocationBalance = material.locations.some((l) => Number(l.quantity || 0) > 0.0001);

          if (totalQty > 0.0001 || hasLocationBalance) {
            const err: any = new Error('MATERIAL_HAS_BALANCE');
            err.status = 409;
            throw err;
          }

          const snapshotLocations = material.locations.map((l) => ({
            locationId: l.locationId,
            locationName: l.location?.name || 'Não informada',
            quantity: Number(l.quantity || 0),
          }));

          await tx.materialDeletionAudit.create({
            data: {
              factoryUnitId,
              materialId: material.id,
              code: material.code,
              name: material.name,
              categoryName: material.type || null,
              unitSymbol: material.unit || 'UN',
              quantity: 0,
              locations: snapshotLocations,
              deletedById: operatorId,
              deletedByName: operatorName,
            },
          });

          // Desvincular materialId das movimentações passadas mantendo o histórico de auditoria intacto
          await tx.movement.updateMany({
            where: { materialId: material.id, factoryUnitId },
            data: { materialId: null },
          });

          await tx.materialLocation.deleteMany({
            where: { materialId: material.id, factoryUnitId },
          });

          await tx.material.delete({
            where: { id: material.id },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );

      return res.json({ message: 'Material excluído com sucesso e registrado em auditoria.' });
    } catch (error: any) {
      if (error?.message === 'MATERIAL_NOT_FOUND') {
        return res.status(404).json({ error: 'Material não encontrado.' });
      }
      if (error?.message === 'MATERIAL_HAS_BALANCE' || error?.status === 409) {
        return res.status(409).json({
          error: 'O material só pode ser excluído quando todo o estoque estiver zerado.',
        });
      }
      console.error('Erro ao deletar material:', error);
      return res.status(500).json({ error: 'Erro ao deletar material.' });
    }
  }

  async stats(_req: Request, res: Response) {
    try {
      // `factoryUnitId` é injetado automaticamente pelo Prisma $extends (tenantContext).
      const [totalMaterials, lowStock, totalMovements, totalEntries] = await Promise.all([
        prisma.material.count(),
        prisma.material.count({ where: { quantity: { lte: 10 } } }),
        prisma.movement.count(),
        prisma.movement.count({ where: { type: 'entrada' } })
      ]);
      res.json({ totalMaterials, lowStock, totalMovements, totalEntries });
    } catch (error) {
      res.status(500).json({ error: 'Erro nas estatísticas' });
    }
  }

  async importBatch(req: Request, res: Response) {
    try {
      const { materiais } = req.body;

      if (!Array.isArray(materiais) || materiais.length === 0) {
        return res.status(400).json({ error: "O payload deve ser um array de materiais." });
      }

      const dadosLimpos = (materiais as ImportedMaterial[]).map((m) => ({
        factoryUnitId: req.tenant!.id,
        code: String(m.code || '').trim(),
        name: String(m.name || '').trim().toUpperCase(),
        quantity: Number(String(m.quantity).replace(',', '.')) || 0,
        unit: String(m.unit || 'UN').toUpperCase(),
        type: String(m.type || 'OUTRO').toLowerCase()
      })).filter((m) => m.name !== '');

      const result = await prisma.material.createMany({
        data: dadosLimpos,
        skipDuplicates: true,
      });

      return res.status(201).json({ 
        message: "Importação concluída com sucesso.", 
        inseridos: result.count 
      });

    } catch (error) {
      console.error("Erro no Bulk Insert:", error);
      return res.status(500).json({ error: "Erro interno ao processar o lote." });
    }
  }
}
