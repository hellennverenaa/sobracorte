import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '../generated/prisma';
import { importMaterials, ImportValidationError, MaterialImportInput } from '../import/materialImport';
import { INITIAL_STOCK_ORIGIN, INITIAL_STOCK_REASON } from '../movements/constants';

function decimalInput(value: unknown, { allowZero = true } = {}): string | null {
  if (value === undefined || value === null || String(value).trim() === '') return allowZero ? '0' : null;
  const raw = String(value).trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(raw)) return null;
  if (raw.split('.')[0].length > 15) return null;
  if (!allowZero && !/[1-9]/.test(raw)) return null;
  return raw;
}

function decimalString(value: unknown): string {
  return value === null || value === undefined ? '0' : String(value);
}

export class MaterialController {
  async index(req: Request, res: Response) {
    try {
      const { q, categoryId } = req.query;
      const requestedCategoryId = categoryId === undefined ? undefined : Number(categoryId);
      if (requestedCategoryId !== undefined && (!Number.isInteger(requestedCategoryId) || requestedCategoryId <= 0)) {
        return res.status(400).json({ error: 'Categoria inválida.' });
      }
      const whereClause: Prisma.MaterialWhereInput = {
        factoryUnitId: req.tenant!.id,
        ...(requestedCategoryId ? { categoryId: requestedCategoryId } : {}),
        ...(q ? {
          OR: [
            { name: { contains: String(q), mode: 'insensitive' } },
            { code: { contains: String(q), mode: 'insensitive' } }
          ]
        } : {}),
      };

      const totalItems = await prisma.material.count({ where: whereClause });
      res.set('X-Total-Count', totalItems.toString());

      const requestedPage = Number(req.query.page ?? req.query._page);
      const requestedLimit = Number(req.query.pageSize ?? req.query._limit);
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
          category: true,
          unit: true,
          locations: {
            include: { location: true } 
          } 
        }
      });

      const data = materials.map((m) => {
        const prateleirasComSaldo = m.locations.filter((ml) => Number(ml.quantity) > 0);
        
        let localExibicao = 'Não definido';
        
        if (prateleirasComSaldo.length > 0) {
          localExibicao = prateleirasComSaldo.map((ml) => ml.location.name).join(' | ');
        }
        
        return {
          id: m.id,
          code: m.code,
          name: m.name,
          quantity: decimalString(m.quantity),
          categoryId: m.categoryId,
          unitId: m.unitId,
          category: { id: m.category.id, name: m.category.name },
          unit: { id: m.unit.id, name: m.unit.name, symbol: m.unit.symbol },
          observation: m.observation,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          locations: m.locations.map((ml) => ({
            locationId: ml.locationId,
            quantity: decimalString(ml.quantity),
            location: { id: ml.location.id, name: ml.location.name },
          })),
          locationNames: localExibicao,
        };
      });

      res.json({ data, meta: { page, pageSize: limit, total: totalItems, totalPages: Math.ceil(totalItems / limit) } });
    } catch (error) {
      console.error("Erro ao buscar materiais: ", error)
      res.status(500).json({ error: 'Erro ao buscar materiais' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const code = String(req.body.codigo ?? req.body.code ?? '').trim();
      const name = String(req.body.descricao ?? req.body.name ?? '').trim();
      const categoryId = Number(req.body.categoryId ?? req.body.categoriaId);
      const unitId = Number(req.body.unitId ?? req.body.unidadeId);
      const locationId = Number(req.body.locationId);
      const locationName = String(req.body.location ?? '').trim();
      const quantity = decimalInput(req.body.initialQuantity ?? req.body.quantidade ?? req.body.quantity);

      if (!code || !name) return res.status(400).json({ error: 'Código e descrição são obrigatórios.' });
      if (!Number.isInteger(categoryId) || categoryId <= 0 || !Number.isInteger(unitId) || unitId <= 0) {
        return res.status(400).json({ error: 'Categoria e unidade de medida são obrigatórias.' });
      }
      if (!quantity) {
        return res.status(400).json({ error: 'O saldo inicial deve ser um número maior ou igual a zero.' });
      }
      if (locationId <= 0 && !locationName) return res.status(400).json({ error: 'A localização é obrigatória.' });

      const novo = await prisma.$transaction(async (tx) => {
        const [category, unit] = await Promise.all([
          tx.categoryConfig.findFirst({ where: { id: categoryId, factoryUnitId: req.tenant!.id } }),
          tx.unitConfig.findFirst({ where: { id: unitId, factoryUnitId: req.tenant!.id, active: true } }),
        ]);
        if (!category) throw new Error('CATEGORY_NOT_FOUND');
        if (!unit) throw new Error('UNIT_NOT_FOUND');
        if (category.unitLocked && category.defaultUnitId !== unit.id) throw new Error('UNIT_NOT_ALLOWED');

        const loc = locationId > 0
          ? await tx.location.findFirst({ where: { id: locationId, factoryUnitId: req.tenant!.id } })
          : await tx.location.findUnique({ where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: locationName } } });
        if (!loc) throw new Error('LOCATION_NOT_FOUND');
        const allowed = await tx.locationCategory.findFirst({ where: { locationId: loc.id, categoryId, factoryUnitId: req.tenant!.id } });
        if (!allowed) throw new Error('LOCATION_CATEGORY_NOT_ALLOWED');

        const material = await tx.material.create({
          data: {
            code, name, categoryId, unitId,
            quantity, minStock: 0,
            observation: String(req.body.observacoes || req.body.observation || ''),
            factoryUnitId: req.tenant!.id,
            locations: { create: { locationId: loc.id, quantity } },
          },
          include: { category: true, unit: true },
        });

        if (Number(quantity) > 0) {
          await tx.movement.create({
            data: {
              materialId: material.id,
              factoryUnitId: req.tenant!.id,
              type: 'entrada',
              quantity,
              materialCode: material.code,
              materialName: material.name,
              materialCategory: material.category.name,
              materialUnit: material.unit.symbol,
              locationId: loc.id,
              locationName: loc.name,
              originName: INITIAL_STOCK_ORIGIN,
              reason: INITIAL_STOCK_REASON,
              operatorId: req.user?.matricula ? String(req.user.matricula) : null,
              operatorName: req.user?.nome || req.user?.usuario || 'Sistema / Implantação',
            },
          });
        }

        const { minStock: _legacyMinStock, ...publicMaterial } = material;
        return { ...publicMaterial, quantity: decimalString(material.quantity) };
      });
      
      res.status(201).json(novo);
    } catch (error) {
      if ((error as any)?.code === 'P2002' || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        return res.status(409).json({ error: 'Já existe um material com esse código.' });
      }
      if (error instanceof Error && error.message === 'CATEGORY_NOT_FOUND') return res.status(404).json({ error: 'Categoria não encontrada.' });
      if (error instanceof Error && error.message === 'UNIT_NOT_FOUND') return res.status(404).json({ error: 'Unidade não encontrada ou inativa.' });
      if (error instanceof Error && error.message === 'UNIT_NOT_ALLOWED') return res.status(400).json({ error: 'A unidade não é permitida para esta categoria.' });
      if (error instanceof Error && error.message === 'LOCATION_NOT_FOUND') return res.status(404).json({ error: 'Localização não encontrada.' });
      if (error instanceof Error && error.message === 'LOCATION_CATEGORY_NOT_ALLOWED') return res.status(400).json({ error: 'A categoria não é permitida nessa localização.' });
      console.error('Erro interno ao criar material.');
      res.status(500).json({ error: 'Erro ao criar material. Verifique duplicidade.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const materialId = Number(req.params.id);
      const locationName = req.body.location ? String(req.body.location).trim() : null;
      const requestedLocationId = req.body.locationId !== undefined ? Number(req.body.locationId) : null;

      if (!Number.isInteger(materialId) || materialId <= 0) {
        return res.status(400).json({ error: 'Material inválido.' });
      }
      if (req.body.quantity !== undefined || req.body.quantidade !== undefined) {
        return res.status(400).json({ error: 'O saldo só pode ser alterado por uma movimentação.' });
      }
      if (req.body.categoryId !== undefined && (!Number.isInteger(Number(req.body.categoryId)) || Number(req.body.categoryId) <= 0)) {
        return res.status(400).json({ error: 'Categoria inválida.' });
      }
      if (req.body.unitId !== undefined && (!Number.isInteger(Number(req.body.unitId)) || Number(req.body.unitId) <= 0)) {
        return res.status(400).json({ error: 'Unidade de medida inválida.' });
      }
      if (req.body.code !== undefined && !String(req.body.code).trim()) return res.status(400).json({ error: 'O código não pode ser vazio.' });
      if (req.body.name !== undefined && !String(req.body.name).trim()) return res.status(400).json({ error: 'A descrição não pode ser vazia.' });

      const atualizado = await prisma.$transaction(async (tx) => {
        const existingMaterial = await tx.material.findFirst({
          where: { id: materialId, factoryUnitId: req.tenant!.id }, include: { category: true, unit: true, locations: { include: { location: { include: { categories: true } } } } },
        });
        if (!existingMaterial) throw new Error('MATERIAL_NOT_FOUND');
        const nextCategoryId = req.body.categoryId !== undefined ? Number(req.body.categoryId) : existingMaterial.categoryId;
        const nextUnitId = req.body.unitId !== undefined ? Number(req.body.unitId) : existingMaterial.unitId;
        const [nextCategory, nextUnit] = await Promise.all([
          tx.categoryConfig.findFirst({ where: { id: nextCategoryId, factoryUnitId: req.tenant!.id } }),
          tx.unitConfig.findFirst({ where: { id: nextUnitId, factoryUnitId: req.tenant!.id, active: true } }),
        ]);
        if (!nextCategory) throw new Error('CATEGORY_NOT_FOUND');
        if (!nextUnit) throw new Error('UNIT_NOT_FOUND');
        if (nextCategory.unitLocked && nextCategory.defaultUnitId !== nextUnit.id) throw new Error('UNIT_NOT_ALLOWED');
        if (nextUnitId !== existingMaterial.unitId && Number(existingMaterial.quantity) !== 0) throw new Error('UNIT_CHANGE_WITH_STOCK');
        if (nextCategoryId !== existingMaterial.categoryId && existingMaterial.locations.some((item) => !item.location.categories.some((link) => link.categoryId === nextCategoryId))) {
          throw new Error('LOCATION_CATEGORY_NOT_ALLOWED');
        }
        if (locationName || requestedLocationId) {
          const loc = requestedLocationId && requestedLocationId > 0
            ? await tx.location.findFirst({ where: { id: requestedLocationId, factoryUnitId: req.tenant!.id } })
            : await tx.location.findUnique({
              where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: locationName! } },
            });
          if (!loc) throw new Error('LOCATION_NOT_FOUND');
          const allowed = await tx.locationCategory.findFirst({ where: { locationId: loc.id, categoryId: nextCategoryId, factoryUnitId: req.tenant!.id } });
          if (!allowed) throw new Error('LOCATION_CATEGORY_NOT_ALLOWED');
          await tx.materialLocation.upsert({
            where: { materialId_locationId: { materialId, locationId: loc.id } },
            update: {},
            create: { materialId, locationId: loc.id, factoryUnitId: req.tenant!.id, quantity: 0 },
          });
        }

        return tx.material.update({
          where: { id: materialId },
          data: {
            code: req.body.code !== undefined ? String(req.body.code).trim() : undefined,
            name: req.body.name !== undefined ? String(req.body.name).trim() : undefined,
            categoryId: req.body.categoryId !== undefined ? nextCategoryId : undefined,
            unitId: req.body.unitId !== undefined ? nextUnitId : undefined,
            observation: req.body.observation !== undefined ? String(req.body.observation) : undefined,
          },
          include: { category: true, unit: true },
        });
      });
      
      const { minStock: _legacyMinStock, ...publicMaterial } = atualizado;
      res.json({ ...publicMaterial, quantity: decimalString(atualizado.quantity) });
    } catch (error) {
      if (error instanceof Error && error.message === 'LOCATION_NOT_FOUND') {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }
      if (error instanceof Error && error.message === 'MATERIAL_NOT_FOUND') {
        return res.status(404).json({ error: 'Material não encontrado.' });
      }
      if (error instanceof Error && error.message === 'CATEGORY_NOT_FOUND') return res.status(404).json({ error: 'Categoria não encontrada.' });
      if (error instanceof Error && error.message === 'UNIT_NOT_FOUND') return res.status(404).json({ error: 'Unidade não encontrada ou inativa.' });
      if (error instanceof Error && error.message === 'UNIT_NOT_ALLOWED') return res.status(400).json({ error: 'A unidade não é permitida para esta categoria.' });
      if (error instanceof Error && error.message === 'UNIT_CHANGE_WITH_STOCK') return res.status(409).json({ error: 'A unidade de medida só pode ser alterada quando o saldo estiver zerado.' });
      if (error instanceof Error && error.message === 'LOCATION_CATEGORY_NOT_ALLOWED') return res.status(400).json({ error: 'A categoria não é permitida nessa localização.' });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return res.status(404).json({ error: 'Material não encontrado.' });
      }
      console.error('Erro interno ao atualizar material.');
      res.status(500).json({ error: 'Erro ao atualizar material' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const materialId = Number(req.params.id);
      if (!Number.isInteger(materialId) || materialId <= 0) return res.status(400).json({ error: 'Material inválido.' });
      await prisma.$transaction(async (tx) => {
        const material = await tx.material.findFirst({
          where: { id: materialId, factoryUnitId: req.tenant!.id },
          include: { category: true, unit: true, locations: { include: { location: true } } },
        });
        if (!material) throw new Error('MATERIAL_NOT_FOUND');
        await tx.materialDeletionAudit.create({
          data: {
            materialId: material.id,
            code: material.code,
            name: material.name,
            categoryName: material.category.name,
            unitSymbol: material.unit.symbol,
            quantity: material.quantity,
            locations: material.locations.map((entry) => ({ id: entry.locationId, name: entry.location.name, quantity: decimalString(entry.quantity) })),
            factoryUnitId: material.factoryUnitId,
            deletedById: req.user?.matricula ? String(req.user.matricula) : null,
            deletedByName: req.user?.nome || req.user?.usuario || null,
          },
        });
        await tx.material.delete({ where: { id: material.id } });
      });
      res.json({ message: 'Material excluído; histórico preservado.' });
    } catch (error) {
      if (error instanceof Error && error.message === 'MATERIAL_NOT_FOUND') return res.status(404).json({ error: 'Material não encontrado.' });
      console.error('Erro ao deletar material:', error);
      res.status(500).json({ error: 'Erro ao deletar material' });
    }
  }

  async importBatch(req: Request, res: Response) {
    try {
      const { materiais } = req.body;

      if (!Array.isArray(materiais) || materiais.length === 0) {
        return res.status(400).json({ error: 'O payload deve ser um array de materiais.' });
      }

      const result = await importMaterials(req.tenant!.id, materiais as MaterialImportInput[], req.user);
      return res.status(201).json({ message: 'Importação concluída com sucesso.', ...result });

    } catch (error) {
      if (error instanceof ImportValidationError) return res.status(422).json({ error: error.message, errors: error.errors });
      if ((error as any)?.code === 'P2002') return res.status(409).json({ error: 'Um ou mais códigos já existem.' });
      console.error('Erro no Bulk Insert:', error);
      return res.status(500).json({ error: 'Erro interno ao processar o lote.' });
    }
  }
}
