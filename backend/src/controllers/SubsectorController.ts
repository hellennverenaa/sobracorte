import { Request, Response } from 'express';
import { Prisma, SubsectorCategoryMode } from '../generated/prisma';
import { prisma } from '../prisma';
import { requestStockAccess, assignedStockSector, assertStockSectorAccess, isStockMaster, StockAccessError } from '../auth/stockAccess';
import { requireActiveStockSector, SectorValidationError, normalizeSector } from '../utils/sectorHelper';
import { categoryScopeWhere } from '../services/categoryScope';

class SubsectorApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'SubsectorApiError';
  }
}

async function normalizedName(value: string) {
  // A mesma expressão da constraint: o PostgreSQL define a chave, inclusive
  // para acentos e regras de caixa da collation instalada.
  const [row] = await prisma.$queryRaw<Array<{ key: string }>>`
    SELECT upper(regexp_replace(
      regexp_replace(${value}::text, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
      '[[:space:]-]+', '_', 'g'
    )) AS key
  `;
  return row.key;
}

function positiveIds(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value)) throw new SubsectorApiError(`${fieldName} deve ser uma lista de IDs.`);
  const ids = value.map(Number);
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new SubsectorApiError(`${fieldName} contém um ID inválido.`);
  }
  return [...new Set(ids)];
}

function parseCategoryMode(value: unknown): SubsectorCategoryMode {
  if (value === undefined || value === 'ALL') return 'ALL';
  if (value === 'SELECTED') return 'SELECTED';
  throw new SubsectorApiError('Modo de categorias inválido. Use ALL ou SELECTED.');
}

function requireManagementAccess(context: ReturnType<typeof requestStockAccess>, sector?: string) {
  if (isStockMaster(context)) return;
  if (context.role !== 'admin_setor') {
    throw new StockAccessError('Acesso negado: somente Admin Master ou Admin de Setor pode gerenciar subsetores.');
  }
  const assignedSector = assignedStockSector(context);
  if (!assignedSector) {
    throw new StockAccessError('Acesso negado: Admin de Setor precisa ter um setor específico atribuído.');
  }
  if (sector && normalizeSector(sector) !== normalizeSector(assignedSector)) {
    throw new StockAccessError(`Acesso negado: seu perfil está restrito ao setor ${assignedSector}.`);
  }
}

async function validateCategories(
  client: any,
  factoryUnitId: number,
  sector: string,
  categoryMode: SubsectorCategoryMode,
  categoryIds: number[],
) {
  if (categoryMode === 'ALL') {
    if (categoryIds.length) throw new SubsectorApiError('O modo Todas as categorias não aceita uma seleção específica.');
    return [];
  }
  if (categoryIds.length === 0) {
    throw new SubsectorApiError('Selecione ao menos uma categoria para o modo SELECTED.');
  }
  const categories = await client.categoryConfig.findMany({
    where: { factoryUnitId, id: { in: categoryIds }, ...categoryScopeWhere(sector) },
    select: { id: true },
  });
  if (categories.length !== categoryIds.length) {
    throw new SubsectorApiError('Uma ou mais categorias não existem nesta unidade fabril ou não pertencem ao setor do subsetor.');
  }
  return categories.map((category: { id: number }) => category.id);
}

function includeConfigRelations() {
  return {
    categoryLinks: {
      include: { categoryConfig: { select: { id: true, name: true, sector: true, sectors: true } } },
      orderBy: { categoryConfigId: 'asc' as const },
    },
    _count: { select: { stockItems: true, locations: true, stockMovements: true, userAccesses: true } },
  };
}

function responseError(res: Response, error: unknown, label: string) {
  if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
  if (error instanceof SectorValidationError || error instanceof SubsectorApiError) {
    return res.status(error instanceof SubsectorApiError ? error.status : 400).json({ error: error.message });
  }
  const prismaCode = (error as any)?.code;
  if (prismaCode === 'P2002') return res.status(409).json({ error: 'Já existe um subsetor com esse nome neste setor e unidade fabril.' });
  console.error(label, error);
  return res.status(500).json({ error: 'Erro interno ao processar a configuração de subsetor.' });
}

export class SubsectorController {
  async list(req: Request, res: Response) {
    try {
      const context = requestStockAccess(req);
      const includeArchived = req.query.includeArchived === 'true';
      if (includeArchived) requireManagementAccess(context);

      const requestedSector = req.query.sector === undefined
        ? undefined
        : requireActiveStockSector(String(req.query.sector));
      if (requestedSector) {
        if (isStockMaster(context) || context.role === 'admin_setor') {
          requireManagementAccess(context, requestedSector);
        } else if (!(context.role === 'leitor' && !context.assignedSector)) {
          assertStockSectorAccess(context, requestedSector);
        }
      }

      const where: Prisma.SubsectorConfigWhereInput = {
        factoryUnitId: req.tenant!.id,
        ...(includeArchived ? {} : { active: true }),
        ...(requestedSector ? { sector: requestedSector } : {}),
      };
      if (!isStockMaster(context)) {
        if (context.role === 'admin_setor') {
          where.sector = assignedStockSector(context)!;
        } else {
          where.id = { in: context.subsectorIds || [] };
        }
      }

      const rows = await prisma.subsectorConfig.findMany({
        where,
        orderBy: [{ sector: 'asc' }, { name: 'asc' }],
        include: isStockMaster(context) || context.role === 'admin_setor'
          ? includeConfigRelations()
          : { categoryLinks: { select: { categoryConfigId: true } } },
      });
      return res.json(rows);
    } catch (error) {
      return responseError(res, error, 'Erro ao listar subsetores:');
    }
  }

  async create(req: Request, res: Response) {
    try {
      const context = requestStockAccess(req);
      const sector = requireActiveStockSector(String(req.body?.sector || ''));
      requireManagementAccess(context, sector);
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const key = await normalizedName(name);
      if (!name || !key) throw new SubsectorApiError('Informe o nome do subsetor.');
      if (name.length > 100) throw new SubsectorApiError('O nome do subsetor deve ter no máximo 100 caracteres.');

      const categoryMode = parseCategoryMode(req.body?.categoryMode);
      const categoryIds = req.body?.categoryIds === undefined ? [] : positiveIds(req.body.categoryIds, 'categoryIds');
      const validCategoryIds = await validateCategories(prisma, req.tenant!.id, sector, categoryMode, categoryIds);

      const created = await prisma.$transaction(async tx => {
        const subsector = await tx.subsectorConfig.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector,
            name,
            normalizedName: key,
            categoryMode,
          },
          include: includeConfigRelations(),
        });
        if (categoryMode === 'SELECTED' && validCategoryIds.length) {
          await tx.subsectorCategory.createMany({
            data: validCategoryIds.map((categoryConfigId: number) => ({ subsectorId: subsector.id, categoryConfigId, factoryUnitId: req.tenant!.id })),
          });
        }
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Subsetores',
            reason: `Criação do subsetor ${subsector.name} no setor ${sector}.`,
          },
        });
        return tx.subsectorConfig.findUniqueOrThrow({
          where: { id_factoryUnitId: { id: subsector.id, factoryUnitId: req.tenant!.id } },
          include: includeConfigRelations(),
        });
      });
      return res.status(201).json(created);
    } catch (error) {
      return responseError(res, error, 'Erro ao criar subsetor:');
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new SubsectorApiError('Subsetor inválido.');
      const existing = await prisma.subsectorConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id } });
      if (!existing) return res.status(404).json({ error: 'Subsetor não encontrado nesta unidade fabril.' });

      const context = requestStockAccess(req);
      requireManagementAccess(context, existing.sector);
      const requestedSector = req.body?.sector === undefined ? existing.sector : requireActiveStockSector(String(req.body.sector));
      requireManagementAccess(context, requestedSector);
      if (requestedSector !== existing.sector) {
        const [items, locations, movements, userAccesses] = await Promise.all([
          prisma.stockItem.count({ where: { factoryUnitId: req.tenant!.id, subsectorId: id } }),
          prisma.location.count({ where: { factoryUnitId: req.tenant!.id, subsectorId: id } }),
          prisma.stockMovement.count({ where: { factoryUnitId: req.tenant!.id, subsectorId: id } }),
          prisma.userSubsectorAccess.count({ where: { factoryUnitId: req.tenant!.id, subsectorId: id } }),
        ]);
        if (items + locations + movements + userAccesses > 0) {
          throw new SubsectorApiError('O setor pai não pode ser alterado após o subsetor ser utilizado; crie um novo subsetor.', 409);
        }
      }

      const name = req.body?.name === undefined ? existing.name : typeof req.body.name === 'string' ? req.body.name.trim() : '';
      const key = await normalizedName(name);
      if (!name || !key) throw new SubsectorApiError('Informe o nome do subsetor.');
      if (name.length > 100) throw new SubsectorApiError('O nome do subsetor deve ter no máximo 100 caracteres.');
      const active = req.body?.active === undefined ? existing.active : req.body.active;
      if (typeof active !== 'boolean') throw new SubsectorApiError('O status do subsetor deve ser ativo ou inativo.');
      const categoryMode = parseCategoryMode(req.body?.categoryMode ?? existing.categoryMode);
      const rawCategoryIds = req.body?.categoryIds === undefined
        ? (categoryMode === existing.categoryMode ? undefined : [])
        : positiveIds(req.body.categoryIds, 'categoryIds');
      const currentCategoryIds = rawCategoryIds === undefined
        ? (await prisma.subsectorCategory.findMany({ where: { factoryUnitId: req.tenant!.id, subsectorId: id }, select: { categoryConfigId: true } })).map(link => link.categoryConfigId)
        : rawCategoryIds;
      const validCategoryIds = await validateCategories(prisma, req.tenant!.id, requestedSector, categoryMode, currentCategoryIds);

      const updated = await prisma.$transaction(async tx => {
        await tx.subsectorCategory.deleteMany({ where: { factoryUnitId: req.tenant!.id, subsectorId: id } });
        const subsector = await tx.subsectorConfig.update({
          where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id } },
          data: {
            sector: requestedSector,
            name,
            normalizedName: key,
            active,
            categoryMode,
          },
          include: includeConfigRelations(),
        });
        if (categoryMode === 'SELECTED' && validCategoryIds.length) {
          await tx.subsectorCategory.createMany({
            data: validCategoryIds.map((categoryConfigId: number) => ({ subsectorId: subsector.id, categoryConfigId, factoryUnitId: req.tenant!.id })),
          });
        }
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Subsetores',
            reason: `Edição do subsetor ${existing.name}: nome "${name}", setor ${requestedSector}, status ${active ? 'ativo' : 'arquivado'}, categorias ${categoryMode}.`,
          },
        });
        return tx.subsectorConfig.findUniqueOrThrow({
          where: { id_factoryUnitId: { id: subsector.id, factoryUnitId: req.tenant!.id } },
          include: includeConfigRelations(),
        });
      });
      return res.json(updated);
    } catch (error) {
      return responseError(res, error, 'Erro ao editar subsetor:');
    }
  }

  async archive(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new SubsectorApiError('Subsetor inválido.');
      const existing = await prisma.subsectorConfig.findFirst({ where: { id, factoryUnitId: req.tenant!.id } });
      if (!existing) return res.status(404).json({ error: 'Subsetor não encontrado nesta unidade fabril.' });
      requireManagementAccess(requestStockAccess(req), existing.sector);
      if (!existing.active) return res.json({ message: 'Subsetor já estava arquivado.', data: existing });

      const updated = await prisma.$transaction(async tx => {
        const result = await tx.subsectorConfig.update({
          where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id } },
          data: { active: false },
        });
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Subsetores',
            reason: `Arquivamento do subsetor ${existing.name} no setor ${existing.sector}.`,
          },
        });
        return result;
      });
      return res.json({ message: 'Subsetor arquivado com sucesso.', data: updated });
    } catch (error) {
      return responseError(res, error, 'Erro ao arquivar subsetor:');
    }
  }

  async replaceUserAccess(req: Request, res: Response) {
    try {
      const bindingId = Number(req.params.id);
      if (!Number.isSafeInteger(bindingId) || bindingId <= 0) throw new SubsectorApiError('Usuário inválido.');
      const subsectorIds = positiveIds(req.body?.subsectorIds, 'subsectorIds');
      const factoryUnitId = req.tenant!.id;

      const data = await prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM sobra_corte."UserRoleBinding" WHERE id = $1 AND "factoryUnitId" = $2 FOR UPDATE', bindingId, factoryUnitId);
        const target = await tx.userRoleBinding.findFirst({
          where: { id: bindingId, factoryUnitId },
          include: { identity: { select: { usuario: true, nome: true } } },
        });
        if (!target) throw new SubsectorApiError('Usuário não encontrado nesta unidade fabril.', 404);
        if (target.role === 'admin' || target.role === 'admin_setor') {
          if (subsectorIds.length) {
            throw new SubsectorApiError('Esse papel já possui acesso amplo ao escopo permitido pelo setor; não precisa de vínculos individuais.', 409);
          }
        }

        const existingAccesses = subsectorIds.length
          ? await tx.userSubsectorAccess.findMany({
              where: { factoryUnitId, bindingId },
              select: { subsectorId: true },
            })
          : [];
        const previouslyGrantedIds = existingAccesses.map((access: { subsectorId: number }) => access.subsectorId);
        const subsectors = subsectorIds.length
          ? await tx.subsectorConfig.findMany({
              where: {
                factoryUnitId,
                id: { in: subsectorIds },
                OR: [{ active: true }, { id: { in: previouslyGrantedIds } }],
              },
              select: { id: true, sector: true, active: true },
            })
          : [];
        if (subsectors.length !== subsectorIds.length) {
          throw new SubsectorApiError('Um ou mais subsetores não existem nesta unidade fabril ou estão arquivados.', 400);
        }
        if (target.assignedSector && target.role !== 'admin' && target.role !== 'admin_setor'
          && subsectors.some(subsector => normalizeSector(subsector.sector) !== normalizeSector(target.assignedSector!))) {
          throw new SubsectorApiError(`Os vínculos do usuário devem pertencer ao setor ${target.assignedSector}.`, 400);
        }

        await tx.userSubsectorAccess.deleteMany({ where: { factoryUnitId, bindingId } });
        if (subsectorIds.length) {
          await tx.userSubsectorAccess.createMany({
            data: subsectorIds.map(subsectorId => ({ bindingId, subsectorId, factoryUnitId })),
          });
        }
        await tx.stockMovement.create({
          data: {
            factoryUnitId,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Acessos de Subsetores',
            reason: `Acessos de subsetor atualizados para ${target.identity.usuario} (${target.identity.nome}): ${subsectorIds.join(', ') || 'nenhum vínculo individual'}.`,
          },
        });
        return subsectorIds;
      });
      return res.json({ bindingId, subsectorIds: data });
    } catch (error) {
      return responseError(res, error, 'Erro ao atualizar acessos de subsetores:');
    }
  }
}
