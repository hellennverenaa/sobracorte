import { requestStockAccess, assignedStockSector, sectorAccessWhere, StockAccessError } from '../auth/stockAccess';
import { Request, Response } from 'express';
import { normalizeSector, requireActiveStockSector, SectorValidationError } from '../utils/sectorHelper';
import { prisma } from '../prisma';
import { ComponentType, SectorType } from '../generated/prisma';
import { validateUnit, UNIT_CATALOG } from '../utils/unitHelper';
import { assertStockLocationSector, DuplicateStockItemError, findStockIdentityMatches, lockStockIdentityWrites, stockIdentity } from '../services/stockIdentity';
import { categoryAppliesToSector, categoryScopeValue, categoryScopeWhere } from '../services/categoryScope';
import { locationScopeWhere, stockItemScopeWhere } from '../auth/subsectorAccess';

const COMPONENT_TYPES = ['MATERIA_PRIMA', 'PECA_CORTADA', 'SOLADO', 'CABEDAL', 'PE_PRONTO'] as const;

function parseComponentType(value: unknown): typeof COMPONENT_TYPES[number] | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && COMPONENT_TYPES.includes(value as typeof COMPONENT_TYPES[number])) return value as typeof COMPONENT_TYPES[number];
  throw new Error('Tipo de componente inválido.');
}

function hasRequestField(body: unknown, field: string): boolean {
  return typeof body === 'object' && body !== null && Object.prototype.hasOwnProperty.call(body, field);
}

function parseSubtypeId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Subtipo inválido.');
  return id;
}

function parseOptionalLocationSubsectorId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw locationSubsectorError('Subsetor inválido.');
  return id;
}

function locationSubsectorError(message: string, status = 400) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function parseSubtypeSectors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Escolha pelo menos um setor para o subtipo.');
  }
  return Array.from(new Set(value.map(sector => requireActiveStockSector(sector))));
}

function subtypeFitsSectors(subtypeSectors: string[], categorySectors: string[]): boolean {
  return categorySectors.length > 0
    && categorySectors.every(sector => subtypeSectors.includes(normalizeSector(sector)));
}

function checkSubtypeManagementPermission(req: Request): { allowed: boolean; status?: number; error?: string } {
  const role = req.effectiveContext?.effectiveRole ?? req.user?.role;
  const isGlobal = req.effectiveContext?.isGlobalAdmin ?? req.isGlobalAdmin;
  if (isGlobal || role === 'admin') return { allowed: true };
  return { allowed: false, status: 403, error: 'Somente um Administrador Master pode gerenciar os subtipos de material.' };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === code;
}

function checkSettingsPermission(req: Request, targetSector?: string): { allowed: boolean; status?: number; error?: string } {
  const effective = req.effectiveContext;
  const isGlobal = effective?.isGlobalAdmin ?? req.isGlobalAdmin;
  const role = effective?.effectiveRole ?? req.user?.role;
  const assignedSector = effective?.assignedSector ?? req.user?.assignedSector;

  if (isGlobal || role === 'admin') {
    return { allowed: true };
  }
  if (role === 'leitor' || role === 'movimentador' || role === 'lider') {
    return { allowed: false, status: 403, error: 'Acesso não autorizado às configurações do sistema.' };
  }
  if (role === 'admin_setor') {
    try { assignedStockSector(requestStockAccess(req)); }
    catch (error) { return { allowed: false, status: 403, error: (error as Error).message }; }
    if (targetSector && assignedSector && assignedSector !== 'TODOS') {
      const userSec = normalizeSector(assignedSector);
      const tgtSec = normalizeSector(targetSector);
      if (userSec !== tgtSec) {
        return {
          allowed: false,
          status: 403,
          error: `Acesso negado: Seu perfil está restrito ao gerenciamento do setor ${assignedSector}.`,
        };
      }
    }
    return { allowed: true };
  }
  return { allowed: false, status: 403, error: 'Acesso não autorizado às configurações do sistema.' };
}

export class SettingsController {

  async getCategories(req: Request, res: Response) {
    try {
      const rawSector = req.query.sector as string | undefined;
      let targetSector = rawSector ? requireActiveStockSector(rawSector) : undefined;

      if (assignedStockSector(requestStockAccess(req))) {
        targetSector = assignedStockSector(requestStockAccess(req))! as any;
      }

      const whereClause: any = {
        factoryUnitId: req.tenant!.id,
        ...(targetSector ? categoryScopeWhere(targetSector) : {}),
      };

      const categories = await prisma.categoryConfig.findMany({
        where: whereClause,
        orderBy: [{ name: 'asc' }],
        include: { subtype: { select: { id: true, name: true } } },
      });

      const categoriesWithCount = await Promise.all(
        categories.map(async (cat) => {
          const stockCount = await prisma.stockItem.count({
            where: {
              factoryUnitId: req.tenant!.id,
              ...stockItemScopeWhere(requestStockAccess(req)),
              OR: [{ categoryId: cat.id }, { type: cat.name }],
            },
          });
          return {
            ...cat,
            sectors: cat.sectors.length ? cat.sectors : cat.sector ? [cat.sector] : [],
            linkedCount: stockCount,
          };
        })
      );
      res.json(categoriesWithCount);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro ao buscar categorias:', error);
      res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
  }

  async getComponentSubtypes(req: Request, res: Response) {
    try {
      const assignedSector = assignedStockSector(requestStockAccess(req));
      const subtypes = await prisma.componentSubtypeConfig.findMany({
        where: {
          factoryUnitId: req.tenant!.id,
          ...(assignedSector ? { sectors: { has: assignedSector as any } } : {}),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          sectors: true,
          _count: { select: { categories: true } },
        },
      });
      res.json(subtypes);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      console.error('Erro ao buscar subtipos de material:', error);
      res.status(500).json({ error: 'Erro ao buscar subtipos de material.' });
    }
  }

  async createComponentSubtype(req: Request, res: Response) {
    try {
      const perm = checkSubtypeManagementPermission(req);
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) return res.status(400).json({ error: 'Informe o nome do subtipo.' });
      const sectors = parseSubtypeSectors(req.body.sectors);
      const existing = await prisma.componentSubtypeConfig.findFirst({
        where: { factoryUnitId: req.tenant!.id, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) return res.status(409).json({ error: 'Já existe um subtipo com esse nome nesta unidade fabril.' });

      const subtype = await prisma.$transaction(async (tx) => {
        const created = await tx.componentSubtypeConfig.create({
          data: { name, sectors: sectors as any, factoryUnitId: req.tenant!.id },
          include: { _count: { select: { categories: true } } },
        });
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Subtipos',
            reason: `Criação de Subtipo: ${created.name} (Setores: ${sectors.join(', ')})`,
          },
        });
        return created;
      });
      res.status(201).json(subtype);
    } catch (error: unknown) {
      if (error instanceof SectorValidationError || (error instanceof Error && error.message.startsWith('Escolha pelo menos'))) {
        return res.status(400).json({ error: error.message });
      }
      if (hasPrismaCode(error, 'P2002')) return res.status(409).json({ error: 'Já existe um subtipo com esse nome nesta unidade fabril.' });
      console.error('Erro ao criar subtipo de material:', error);
      res.status(500).json({ error: 'Erro ao criar subtipo de material.' });
    }
  }

  async updateComponentSubtype(req: Request, res: Response) {
    try {
      const perm = checkSubtypeManagementPermission(req);
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const id = Number(req.params.id);
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) return res.status(400).json({ error: 'Informe o nome do subtipo.' });
      const sectors = parseSubtypeSectors(req.body.sectors);
      const existing = await prisma.componentSubtypeConfig.findFirst({
        where: { id, factoryUnitId: req.tenant!.id },
      });
      if (!existing) return res.status(404).json({ error: 'Subtipo não encontrado.' });

      const duplicate = await prisma.componentSubtypeConfig.findFirst({
        where: { factoryUnitId: req.tenant!.id, id: { not: id }, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      if (duplicate) return res.status(409).json({ error: 'Já existe um subtipo com esse nome nesta unidade fabril.' });

      const usedCategories = await prisma.categoryConfig.findMany({
        where: { factoryUnitId: req.tenant!.id, subtypeId: id },
        select: { name: true, sectors: true },
      });
      const incompatible = usedCategories.find(category => !subtypeFitsSectors(sectors, category.sectors));
      if (incompatible) {
        return res.status(400).json({
          error: `O subtipo continua vinculado à categoria “${incompatible.name}”, cujos setores não são atendidos pelos novos setores escolhidos.`,
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.componentSubtypeConfig.update({
          where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id } },
          data: { name, sectors: sectors as any },
          include: { _count: { select: { categories: true } } },
        });
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Subtipos',
            reason: `Edição de Subtipo: ${existing.name}${name !== existing.name ? ` para ${name}` : ''} (Setores: ${sectors.join(', ')})`,
          },
        });
        return result;
      });
      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof SectorValidationError || (error instanceof Error && error.message.startsWith('Escolha pelo menos'))) {
        return res.status(400).json({ error: error.message });
      }
      if (hasPrismaCode(error, 'P2002')) return res.status(409).json({ error: 'Já existe um subtipo com esse nome nesta unidade fabril.' });
      console.error('Erro ao atualizar subtipo de material:', error);
      res.status(500).json({ error: 'Erro ao atualizar subtipo de material.' });
    }
  }

  async deleteComponentSubtype(req: Request, res: Response) {
    try {
      const perm = checkSubtypeManagementPermission(req);
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const id = Number(req.params.id);
      const subtype = await prisma.componentSubtypeConfig.findFirst({
        where: { id, factoryUnitId: req.tenant!.id },
      });
      if (!subtype) return res.status(404).json({ error: 'Subtipo não encontrado.' });

      const linkedCategories = await prisma.categoryConfig.count({
        where: { factoryUnitId: req.tenant!.id, subtypeId: id },
      });
      if (linkedCategories > 0) {
        return res.status(409).json({
          error: `Este subtipo está em uso por ${linkedCategories} categoria(s). Edite essas categorias antes de excluí-lo.`,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.componentSubtypeConfig.delete({ where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id } } });
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EXCLUSAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Subtipos',
            reason: `Exclusão de Subtipo: ${subtype.name}`,
          },
        });
      });
      res.json({ message: 'Subtipo excluído com sucesso.' });
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2003')) return res.status(409).json({ error: 'Este subtipo ainda está vinculado a categorias.' });
      console.error('Erro ao excluir subtipo de material:', error);
      res.status(500).json({ error: 'Erro ao excluir subtipo de material.' });
    }
  }

  async createCategory(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { name, defaultUnitCode, unitLocked, sector, sectors: requestedSectors, componentType: rawComponentType } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      }

      const access = requestStockAccess(req);
      const assignedSector = assignedStockSector(access);
      const scope = categoryScopeValue(
        requestedSectors,
        sector,
        requestedSectors === undefined && sector === undefined ? (assignedSector || 'CORTE') : undefined,
      );
      if (assignedSector && (scope.sectors.length !== 1 || scope.sectors[0] !== assignedSector)) {
        return res.status(403).json({ error: `A categoria deve ficar restrita ao setor ${assignedSector}.` });
      }
      const subtypeFieldProvided = hasRequestField(req.body, 'subtypeId');
      const requestedSubtypeId = subtypeFieldProvided ? parseSubtypeId(req.body.subtypeId) : null;
      let selectedSubtype = null as { id: number; sectors: SectorType[]; componentType: ComponentType | null } | null;
      if (requestedSubtypeId) {
        selectedSubtype = await prisma.componentSubtypeConfig.findFirst({
          where: { id: requestedSubtypeId, factoryUnitId: req.tenant!.id },
          select: { id: true, sectors: true, componentType: true },
        });
        if (!selectedSubtype) return res.status(400).json({ error: 'O subtipo escolhido não está disponível nesta unidade fabril.' });
      } else if (!subtypeFieldProvided && rawComponentType !== undefined) {
        const legacyComponentType = parseComponentType(rawComponentType);
        if (legacyComponentType) {
          selectedSubtype = await prisma.componentSubtypeConfig.findFirst({
            where: { factoryUnitId: req.tenant!.id, componentType: legacyComponentType as any },
            select: { id: true, sectors: true, componentType: true },
          });
          if (!selectedSubtype) return res.status(400).json({ error: 'O tipo de material escolhido não está configurado nesta unidade fabril.' });
        }
      }
      if (selectedSubtype && !subtypeFitsSectors(selectedSubtype.sectors, scope.sectors)) {
        return res.status(400).json({ error: 'O subtipo escolhido não é compatível com todos os setores selecionados.' });
      }
      const subtypeId = selectedSubtype?.id ?? null;
      const componentType = selectedSubtype?.componentType ?? null;
      let code: string | null | undefined = defaultUnitCode === undefined ? undefined : null;
      try { if (defaultUnitCode) code = validateUnit(String(defaultUnitCode)); }
      catch (error) { return res.status(400).json({ error: (error as Error).message }); }
      if (unitLocked && !code) return res.status(400).json({ error: 'Selecione uma unidade para bloquear a categoria.' });
      const category = await prisma.$transaction(async (tx) => {
        const cat = await tx.categoryConfig.create({
          data: {
            name: String(name).trim().toUpperCase(),
            sector: scope.legacySector,
            sectors: scope.sectors,
            subtypeId,
            componentType: componentType as any,
            defaultUnitCode: code || null,
            unitLocked: Boolean(unitLocked),
            factoryUnitId: req.tenant!.id
          }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Categorias',
            reason: `Criação de Categoria: ${cat.name} (Setores: ${scope.sectors.length ? scope.sectors.join(', ') : 'GERAL'})`
          }
        });

        return cat;
      });
      res.status(201).json(category);
    } catch (error: unknown) {
      if (error instanceof SectorValidationError || (error instanceof Error && (error.message === 'Tipo de componente inválido.' || error.message.startsWith('Subtipo inválido.')))) return res.status(400).json({ error: error.message });
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Essa categoria já existe.' });
      }
      console.error('Erro ao criar categoria:', error);
      res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  }

  async updateCategory(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const { name, defaultUnitCode, unitLocked, sector, sectors: requestedSectors, componentType: rawComponentType } = req.body;
      const assignedSector = assignedStockSector(requestStockAccess(req));
      const existing = await prisma.categoryConfig.findFirst({
        where: { id, factoryUnitId: req.tenant!.id, ...(assignedSector ? categoryScopeWhere(assignedSector) : {}) },
      });
      if (!existing) return res.status(404).json({ error: 'Categoria não encontrada.' });

      const scopeWasProvided = requestedSectors !== undefined || sector !== undefined;
      const scope = scopeWasProvided
        ? categoryScopeValue(requestedSectors, sector)
        : { sectors: existing.sectors, legacySector: existing.sector };
      if (assignedSector && scopeWasProvided && (scope.sectors.length !== 1 || scope.sectors[0] !== assignedSector)) {
        return res.status(403).json({ error: `A categoria deve ficar restrita ao setor ${assignedSector}.` });
      }
      const subtypeFieldProvided = hasRequestField(req.body, 'subtypeId');
      const subtypeIdWasProvided = subtypeFieldProvided || rawComponentType !== undefined;
      let subtypeId = existing.subtypeId;
      let componentType = existing.componentType;
      let selectedSubtype = null as { id: number; sectors: SectorType[]; componentType: ComponentType | null } | null;
      if (subtypeFieldProvided) {
        subtypeId = parseSubtypeId(req.body.subtypeId);
        if (subtypeId) {
          selectedSubtype = await prisma.componentSubtypeConfig.findFirst({
            where: { id: subtypeId, factoryUnitId: req.tenant!.id },
            select: { id: true, sectors: true, componentType: true },
          });
          if (!selectedSubtype) return res.status(400).json({ error: 'O subtipo escolhido não está disponível nesta unidade fabril.' });
        }
      } else if (rawComponentType !== undefined) {
        const legacyComponentType = parseComponentType(rawComponentType);
        if (legacyComponentType) {
          selectedSubtype = await prisma.componentSubtypeConfig.findFirst({
            where: { factoryUnitId: req.tenant!.id, componentType: legacyComponentType as any },
            select: { id: true, sectors: true, componentType: true },
          });
          if (!selectedSubtype) return res.status(400).json({ error: 'O tipo de material escolhido não está configurado nesta unidade fabril.' });
          subtypeId = selectedSubtype.id;
        } else {
          subtypeId = null;
        }
      } else if (subtypeId) {
        selectedSubtype = await prisma.componentSubtypeConfig.findFirst({
          where: { id: subtypeId, factoryUnitId: req.tenant!.id },
          select: { id: true, sectors: true, componentType: true },
        });
      }
      if (subtypeFieldProvided || rawComponentType !== undefined) {
        componentType = selectedSubtype?.componentType ?? null;
      }
      if (selectedSubtype && !subtypeFitsSectors(selectedSubtype.sectors, scope.sectors)) {
        return res.status(400).json({ error: 'O subtipo escolhido não é compatível com todos os setores selecionados.' });
      }
      if (subtypeIdWasProvided && componentType !== existing.componentType) {
        const linkedItems = await prisma.stockItem.count({ where: { factoryUnitId: req.tenant!.id, categoryId: id } });
        if (linkedItems > 0) {
          return res.status(400).json({ error: 'Não é possível alterar a classificação estrutural enquanto houver itens vinculados a esta categoria.' });
        }
      }

      if (scopeWasProvided) {
        const linkedSubsetors = await prisma.subsectorConfig.findMany({
          where: {
            factoryUnitId: req.tenant!.id,
            categoryMode: 'SELECTED',
            categoryLinks: { some: { categoryConfigId: id } },
          },
          select: { sector: true, name: true },
        });
        const nextScope = { sectors: scope.sectors, sector: scope.legacySector };
        const incompatible = linkedSubsetors.find(subsector => !categoryAppliesToSector(nextScope, subsector.sector));
        if (incompatible) {
          return res.status(409).json({
            error: `A categoria está selecionada no subsetor ${incompatible.name}; remova esse vínculo antes de alterar seus setores.`,
          });
        }
      }

      let code: string | null | undefined = defaultUnitCode === undefined ? undefined : null;
      try { if (defaultUnitCode) code = validateUnit(String(defaultUnitCode)); }
      catch (error) { return res.status(400).json({ error: (error as Error).message }); }
      if ((unitLocked === undefined ? existing.unitLocked : Boolean(unitLocked)) && !(code === undefined ? existing.defaultUnitCode : code)) return res.status(400).json({ error: 'Selecione uma unidade para bloquear a categoria.' });

      const updated = await prisma.$transaction(async (tx) => {
        const newName = name ? String(name).trim().toUpperCase() : undefined;
        if (newName && newName !== existing.name) {
          await lockStockIdentityWrites(tx, req.tenant!.id);
          const affected = await tx.stockItem.findMany({ where: { factoryUnitId: req.tenant!.id, OR: [{ categoryId: id }, { type: existing.name }] } });
          for (const item of affected) {
            if (!('type' in stockIdentity(item))) continue;
            const matches = await findStockIdentityMatches(tx, req.tenant!.id, { ...item, type: newName });
            if (matches.some(match => match.id !== item.id)) {
              throw new DuplicateStockItemError('A alteração da categoria criaria itens duplicados no estoque.');
            }
          }
        }

        if (scopeWasProvided && scope.sectors.length > 0) {
          const [linkedItems, linkedLocations] = await Promise.all([
            tx.stockItem.findMany({ where: { factoryUnitId: req.tenant!.id, categoryId: id }, select: { sector: true } }),
            tx.location.findMany({
              where: { factoryUnitId: req.tenant!.id, OR: [{ categoryId: id }, { categoryLinks: { some: { categoryId: id } } }] },
              select: { sector: true },
            }),
          ]);
          const normalizedScopes = new Set(scope.sectors.map(value => normalizeSector(value)));
          if (linkedItems.some(item => !normalizedScopes.has(normalizeSector(item.sector)))
            || linkedLocations.some(location => location.sector && !normalizedScopes.has(normalizeSector(location.sector)))) {
            throw new Error('A categoria ainda está vinculada a itens ou localizações de setores que seriam removidos. Inclua esses setores ou remova os vínculos antes de salvar.');
          }
        }

        const cat = await tx.categoryConfig.update({
          where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id }, ...(assignedSector ? categoryScopeWhere(assignedSector) : {}) } as any,
          data: {
            name: newName,
            sector: scopeWasProvided ? scope.legacySector : undefined,
            sectors: scopeWasProvided ? scope.sectors : undefined,
            subtypeId: subtypeIdWasProvided ? subtypeId : undefined,
            componentType: componentType as any,
            defaultUnitCode: code,
            unitLocked: unitLocked !== undefined ? Boolean(unitLocked) : undefined
          }
        });

        if (newName && newName !== existing.name) {
          await tx.stockItem.updateMany({
            where: { factoryUnitId: req.tenant!.id, OR: [{ categoryId: id }, { type: existing.name }] },
            data: { type: newName },
          });
        }

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.effectiveContext?.matriculaDass ? String(req.effectiveContext.matriculaDass) : (req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null)),
            operatorName: req.effectiveContext?.nome || req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Categorias',
            reason: `Edição de Categoria: ${existing.name}${newName && newName !== existing.name ? ` para ${newName}` : ''}${scopeWasProvided ? ` (Setores: ${scope.sectors.length ? scope.sectors.join(', ') : 'GERAL'})` : ''}`
          }
        });

        return cat;
      });

      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof Error && (error.message === 'Tipo de componente inválido.' || error.message.startsWith('Subtipo inválido.') || error.message.startsWith('O subtipo') || error.message.startsWith('O tipo de material') || error.message.startsWith('A categoria ainda está vinculada'))) return res.status(400).json({ error: error.message });
      if (error instanceof DuplicateStockItemError) {
        return res.status(409).json({ error: error.message });
      }
      console.error('Erro ao atualizar categoria:', error);
      res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
  }

  async deleteCategory(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const assignedSector = assignedStockSector(requestStockAccess(req));
      const category = await prisma.categoryConfig.findFirst({
        where: { id, factoryUnitId: req.tenant!.id, ...(assignedSector ? categoryScopeWhere(assignedSector) : {}) },
      });
      if (!category) {
        return res.status(404).json({ error: 'Categoria não encontrada.' });
      }

      const subsectorLinkCount = await prisma.subsectorCategory.count({
        where: { factoryUnitId: req.tenant!.id, categoryConfigId: id },
      });
      if (subsectorLinkCount > 0) {
        return res.status(409).json({
          error: 'Não é possível excluir: esta categoria está vinculada a um ou mais subsetores. Remova os vínculos antes de excluir.',
        });
      }

      const stockCount = await prisma.stockItem.count({
        where: { factoryUnitId: req.tenant!.id, OR: [{ categoryId: id }, { type: category.name }] }
      });
      const totalActive = stockCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} material(is) ou item(ns) usando esta categoria. Apenas o Administrador Master pode gerenciar esta exclusão.`
        });
      }

      // 2. Execução transacional atômica com registro no histórico de auditoria
      await prisma.$transaction(async (tx) => {
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EXCLUSAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Categorias',
            reason: `Exclusão de Categoria: ${category.name}${totalActive > 0 ? ` (com ${totalActive} itens vinculados)` : ''}`
          }
        });

        await tx.stockItem.updateMany({
          where: { factoryUnitId: req.tenant!.id, categoryId: id },
          data: { categoryId: null },
        });
        await tx.locationCategory.deleteMany({ where: { categoryId: id, factoryUnitId: req.tenant!.id } });
        await tx.location.updateMany({
          where: { factoryUnitId: req.tenant!.id, categoryId: id }, data: { categoryId: null },
        });
        await tx.categoryConfig.delete({ where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id }, ...(assignedSector ? categoryScopeWhere(assignedSector) : {}) } as any });
      });

      res.json({ message: 'Categoria excluída com sucesso.' });
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir categoria:', error);
      res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
  }

  async getUnits(req: Request, res: Response) { res.json(UNIT_CATALOG); }

  async getLocations(req: Request, res: Response) {
    try {
      const sectorFilter = req.query.sector as string | undefined;
      let targetSector = sectorFilter ? requireActiveStockSector(sectorFilter) : undefined;

      const whereClause: any = { factoryUnitId: req.tenant!.id };
      if (assignedStockSector(requestStockAccess(req))) {
        whereClause.OR = [
          sectorAccessWhere(requestStockAccess(req))
        ];
      } else if (targetSector) {
        whereClause.OR = [
          { sector: targetSector as any },
          { sector: null }
        ];
      }
      const locationScope = locationScopeWhere(requestStockAccess(req));
      if (req.effectiveContext?.subsectorIds !== undefined && Object.keys(locationScope).length) {
        whereClause.AND = [locationScope];
      }

      const locations = await prisma.location.findMany({
        where: whereClause,
        orderBy: { id: 'desc' },
        include: {
          category: true,
          subsector: { select: { id: true, name: true, sector: true, active: true } },
          categoryLinks: {
            include: { category: true }
          }
        }
      });

      const locationsWithStats = await Promise.all(
        locations.map(async (loc) => {
          const stockLocs = await prisma.stockItemLocation.findMany(
            {
              where: { factoryUnitId: req.tenant!.id, locationId: loc.id, stockItem: stockItemScopeWhere(requestStockAccess(req)) },
              select: { quantity: true }
            });
          const totalLinked = stockLocs.length;
          const totalQuantity = stockLocs.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
          return {
            ...loc,
            linkedCount: totalLinked,
            totalQuantity: Number(totalQuantity.toFixed(2)),
          };
        })
      );

      res.json(locationsWithStats);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro ao buscar localizações:', error);
      res.status(500).json({ error: 'Erro ao buscar localizações' });
    }
  }

  async createLocation(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { name, categoryId, categoryIds, sector } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da localização é obrigatório.' });
      }

      const access = requestStockAccess(req);
      let targetSector = sector ? requireActiveStockSector(sector) : (access.assignedSector ? requireActiveStockSector(access.assignedSector) : null);
      if (access.role === 'admin_setor' && access.assignedSector) {
        targetSector = requireActiveStockSector(access.assignedSector);
      }
      const requestedSubsectorId = parseOptionalLocationSubsectorId(req.body?.subsectorId);
      const targetSubsector = requestedSubsectorId
        ? await prisma.subsectorConfig.findFirst({
            where: { id: requestedSubsectorId, factoryUnitId: req.tenant!.id, active: true },
            select: { id: true, sector: true, categoryMode: true, categoryLinks: { select: { categoryConfigId: true } } },
          })
        : null;
      if (requestedSubsectorId && !targetSubsector) {
        throw locationSubsectorError('O subsetor informado não existe, está arquivado ou pertence a outra unidade fabril.');
      }
      if (targetSubsector && (!targetSector || normalizeSector(targetSubsector.sector) !== normalizeSector(targetSector))) {
        throw locationSubsectorError('O subsetor precisa pertencer ao mesmo setor da localização.');
      }

      // Suporta array de IDs ou único ID
      let idsToLink: number[] = [];
      if (Array.isArray(categoryIds) && categoryIds.length > 0) {
        idsToLink = Array.from(new Set(categoryIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)));
      } else if (categoryId) {
        idsToLink = [Number(categoryId)];
      }

      let finalCategoryIds: number[] = [];
      let primaryCategoryId: number | null = null;

      if (idsToLink.length > 0) {
        const categoryWhere: any = {
          id: { in: idsToLink },
          factoryUnitId: req.tenant!.id,
        };
        if (targetSector) {
          Object.assign(categoryWhere, categoryScopeWhere(targetSector));
        }

        const validCategories = await prisma.categoryConfig.findMany({
          where: categoryWhere,
          select: { id: true, name: true, sector: true }
        });

        if (validCategories.length !== idsToLink.length) {
          return res.status(400).json({
            error: `Uma ou mais categorias não são válidas para o setor ${targetSector || 'especificado'}.`
          });
        }

        finalCategoryIds = validCategories.map(c => c.id);
        primaryCategoryId = finalCategoryIds[0];
      }
      if (targetSubsector?.categoryMode === 'SELECTED') {
        const allowedCategoryIds = new Set(targetSubsector.categoryLinks.map(link => link.categoryConfigId));
        if (finalCategoryIds.some(categoryId => !allowedCategoryIds.has(categoryId))) {
          throw locationSubsectorError('A localização não pode aceitar categorias que não estão permitidas para o subsetor.');
        }
      }

      const location = await prisma.$transaction(async (tx) => {
        const loc = await tx.location.create({
          data: {
            name: String(name).trim().toUpperCase(),
            sector: targetSector as any,
            subsectorId: targetSubsector?.id ?? null,
            categoryId: primaryCategoryId,
            factoryUnitId: req.tenant!.id,
            categoryLinks: finalCategoryIds.length > 0 ? {
              create: finalCategoryIds.map(cId => ({
                categoryId: cId
              }))
            } : undefined
          },
          include: {
            category: true,
            subsector: { select: { id: true, name: true, sector: true, active: true } },
            categoryLinks: {
              include: { category: true }
            }
          }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Localizações',
            reason: `Criação de Localização: ${loc.name} (Setor: ${targetSector || 'GERAL'}${targetSubsector ? `, Subsetor: ${targetSubsector.id}` : ''})`
          }
        });

        return loc;
      });
      res.status(201).json(location);
    } catch (error: unknown) {
      if ((error as any)?.status) return res.status((error as any).status).json({ error: (error as Error).message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Essa localização já existe.' });
      }
      console.error('Erro ao criar localização:', error);
      res.status(500).json({ error: 'Erro ao criar localização' });
    }
  }

  async updateLocation(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const { name, categoryIds, sector } = req.body;

      const existing = await prisma.location.findFirst({
        where: { id, factoryUnitId: req.tenant!.id, ...locationScopeWhere(requestStockAccess(req)) }
      });
      if (!existing) {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }

      let targetSector = sector !== undefined ? (sector ? requireActiveStockSector(sector) : null) : undefined;
      const access = requestStockAccess(req);
      if (access.role === 'admin_setor' && access.assignedSector) {
        targetSector = requireActiveStockSector(access.assignedSector);
      }

      const requestedSubsectorId = parseOptionalLocationSubsectorId(req.body?.subsectorId);
      const targetSubsectorId = requestedSubsectorId === undefined ? existing.subsectorId : requestedSubsectorId;
      const effectiveSector = targetSector !== undefined ? targetSector : existing.sector;
      const targetSubsector = targetSubsectorId
        ? await prisma.subsectorConfig.findFirst({
            where: {
              id: targetSubsectorId,
              factoryUnitId: req.tenant!.id,
              OR: [{ active: true }, ...(targetSubsectorId === existing.subsectorId ? [{ id: existing.subsectorId! }] : [])],
            },
            select: { id: true, sector: true, active: true, categoryMode: true, categoryLinks: { select: { categoryConfigId: true } } },
          })
        : null;
      if (targetSubsectorId && !targetSubsector) {
        throw locationSubsectorError('O subsetor informado não existe, está arquivado ou pertence a outra unidade fabril.');
      }
      if (targetSubsector && (!effectiveSector || normalizeSector(targetSubsector.sector) !== normalizeSector(effectiveSector))) {
        throw locationSubsectorError('O subsetor precisa pertencer ao mesmo setor da localização.');
      }

      let finalCategoryIds: number[] | undefined;
      if (Array.isArray(categoryIds)) {
        if (categoryIds.length > 0) {
          const effectiveSector = targetSector !== undefined ? targetSector : existing.sector;
          const requestedIds = Array.from(new Set(categoryIds.map(Number).filter(n => Number.isSafeInteger(n) && n > 0)));
          const categoryWhere: any = {
            id: { in: requestedIds },
            factoryUnitId: req.tenant!.id,
          };
          if (effectiveSector) {
            Object.assign(categoryWhere, categoryScopeWhere(effectiveSector));
          }
          const validCategories = await prisma.categoryConfig.findMany({
            where: categoryWhere,
            select: { id: true }
          });
          if (validCategories.length !== requestedIds.length) {
            return res.status(400).json({ error: `Uma ou mais categorias não são válidas para o setor ${effectiveSector || 'especificado'}.` });
          }
          finalCategoryIds = validCategories.map(c => c.id);
        } else {
          finalCategoryIds = [];
        }
      }

      if (targetSubsector?.categoryMode === 'SELECTED') {
        let effectiveLocationCategoryIds = finalCategoryIds;
        if (effectiveLocationCategoryIds === undefined) {
          const currentLinks = await prisma.locationCategory.findMany({
            where: { factoryUnitId: req.tenant!.id, locationId: id },
            select: { categoryId: true },
          });
          effectiveLocationCategoryIds = currentLinks.map(link => link.categoryId);
          if (existing.categoryId && !effectiveLocationCategoryIds.includes(existing.categoryId)) {
            effectiveLocationCategoryIds.push(existing.categoryId);
          }
        }
        const allowedCategoryIds = new Set(targetSubsector.categoryLinks.map(link => link.categoryConfigId));
        if (effectiveLocationCategoryIds.some(categoryId => !allowedCategoryIds.has(categoryId))) {
          throw locationSubsectorError('A localização não pode aceitar categorias que não estão permitidas para o subsetor.');
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        await lockStockIdentityWrites(tx, req.tenant!.id);
        if (targetSubsectorId !== existing.subsectorId) {
          const [stockLinks, movementCount] = await Promise.all([
            tx.stockItemLocation.count({ where: { factoryUnitId: req.tenant!.id, locationId: id } }),
            tx.stockMovement.count({
              where: {
                factoryUnitId: req.tenant!.id,
                OR: [{ sourceLocationId: id }, { destinationLocationId: id }],
              },
            }),
          ]);
          if (stockLinks + movementCount > 0) {
            throw locationSubsectorError('O subsetor da localização não pode ser alterado após o primeiro uso; crie uma nova localização.', 409);
          }
        }
        if (targetSector !== undefined && targetSector !== null) {
          const links = await tx.stockItemLocation.findMany({
            where: { factoryUnitId: req.tenant!.id, locationId: id },
            include: { stockItem: { select: { sector: true, categoryId: true } } },
          });
          for (const link of links) {
            assertStockLocationSector({ sector: targetSector }, link.stockItem.sector);
            if (link.stockItem.categoryId && finalCategoryIds && finalCategoryIds.length > 0
              && !finalCategoryIds.includes(link.stockItem.categoryId)) {
              throw new Error('A localização não pode perder a categoria de um item que ainda possui saldo nela.');
            }
          }
        }
        if (targetSector !== undefined && finalCategoryIds === undefined) {
          const currentCategoryLinks = await tx.locationCategory.findMany({
            where: { factoryUnitId: req.tenant!.id, locationId: id },
            include: { category: { select: { sector: true, sectors: true } } },
          });
          const currentCategories = currentCategoryLinks.map(link => link.category);
          if (existing.categoryId && !currentCategoryLinks.some(link => link.categoryId === existing.categoryId)) {
            const primaryCategory = await tx.categoryConfig.findFirst({
              where: { id: existing.categoryId, factoryUnitId: req.tenant!.id },
              select: { sector: true, sectors: true },
            });
            if (primaryCategory) currentCategories.push(primaryCategory);
          }
          if (targetSector && currentCategories.some(category => !categoryAppliesToSector(category, targetSector!))) {
            throw new Error('A localização não pode mudar para um setor incompatível com suas categorias vinculadas.');
          }
        }
        if (finalCategoryIds !== undefined) {
          // Remove vínculos antigos
          await tx.locationCategory.deleteMany({
            where: { locationId: id, factoryUnitId: req.tenant!.id }
          });
          if (finalCategoryIds.length > 0) {
            // Cria novos vínculos
            await tx.locationCategory.createMany({
              data: finalCategoryIds.map(cId => ({
                locationId: id,
                categoryId: cId,
                factoryUnitId: req.tenant!.id
              }))
            });
          }
        }

        const loc = await tx.location.update({
          where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id }, AND: [locationScopeWhere(requestStockAccess(req))] },
          data: {
            name: name ? String(name).trim().toUpperCase() : undefined,
            sector: targetSector as any,
            subsectorId: targetSubsectorId,
            categoryId: finalCategoryIds !== undefined ? (finalCategoryIds.length > 0 ? finalCategoryIds[0] : null) : undefined
          },
          include: {
            category: true,
            subsector: { select: { id: true, name: true, sector: true, active: true } },
            categoryLinks: {
              include: { category: true }
            }
          }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EDICAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Localizações',
            reason: `Edição de Localização: ${existing.name}${name && name !== existing.name ? ` para ${name}` : ''}${targetSubsectorId !== existing.subsectorId ? ` (subsetor ${targetSubsectorId || 'removido'})` : ''}`
          }
        });

        return loc;
      });

      res.json(updated);
    } catch (error: unknown) {
      if ((error as any)?.status) return res.status((error as any).status).json({ error: (error as Error).message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof Error && error.message.includes('Movimentações entre setores não são permitidas')) {
        return res.status(400).json({ error: 'Não é possível vincular a localização a um setor diferente dos itens já alocados nela.' });
      }
      if (error instanceof Error && error.message.startsWith('A localização ')) return res.status(400).json({ error: error.message });
      if (error instanceof Error && error.message.startsWith('A categoria não pode')) return res.status(400).json({ error: error.message });
      console.error('Erro ao atualizar localização:', error);
      res.status(500).json({ error: 'Erro ao atualizar localização' });
    }
  }

  async deleteLocation(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const location = await prisma.location.findFirst({
        where: { id, factoryUnitId: req.tenant!.id, ...locationScopeWhere(requestStockAccess(req)) }
      });
      if (!location) {
        return res.status(404).json({ error: 'Localização não encontrada.' });
      }

      const stockCount = await prisma.stockItemLocation.count({
        where: { factoryUnitId: req.tenant!.id, locationId: id }
      });
      const totalActive = stockCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} material(is) ou item(ns) vinculados a esta localização. Apenas o Administrador Master pode gerenciar esta exclusão.`
        });
      }

      // 2. Execução transacional atômica com gravação de auditoria em StockMovement
      await prisma.$transaction(async (tx) => {
        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EXCLUSAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Localizações',
            reason: `Exclusão de Localização: ${location.name}${totalActive > 0 ? ` (com ${totalActive} itens vinculados)` : ''}`
          }
        });

        await tx.locationCategory.deleteMany({ where: { locationId: id, factoryUnitId: req.tenant!.id } });
        await tx.stockItemLocation.deleteMany({ where: { locationId: id, factoryUnitId: req.tenant!.id } });
        await tx.location.delete({ where: { id_factoryUnitId: { id, factoryUnitId: req.tenant!.id }, AND: [locationScopeWhere(requestStockAccess(req))] } });
      });

      res.json({ message: 'Localização excluída com sucesso.' });
    } catch (error: unknown) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir localização:', error);
      res.status(500).json({ error: 'Erro ao excluir localização' });
    }
  }

  async getOrigins(req: Request, res: Response) {
    try {
      const sectorFilter = req.query.sector as string | undefined;
      let targetSector = sectorFilter ? requireActiveStockSector(sectorFilter) : undefined;

      const whereClause: any = { factoryUnitId: req.tenant!.id };
      const assignedSector = assignedStockSector(requestStockAccess(req));
      if (assignedSector) {
        whereClause.OR = [
          { sector: assignedSector },
          { sector: null },
          ...(assignedSector === 'DISTRIBUICAO' ? [{ sector: 'EXPEDICAO' }] : []),
        ];
      } else if (targetSector) {
        whereClause.OR = [
          { sector: targetSector as any },
          { sector: null }
        ];
      }

      const origins = await prisma.originConfig.findMany({
        where: whereClause,
        orderBy: { id: 'desc' }
      });

      const originsWithCount = await Promise.all(
        origins.map(async (orig) => {
          const stockMovCount = await prisma.stockMovement.count({ where: { factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)), origem: orig.name } });
          return {
            ...orig,
            linkedCount: stockMovCount,
          };
        })
      );

      res.json(originsWithCount);
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro ao buscar origens:', error);
      res.status(500).json({ error: 'Erro ao buscar origens' });
    }
  }

  async createOrigin(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { name, sector } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'O nome da origem é obrigatório.' });
      }

      let targetSector = sector ? requireActiveStockSector(sector) : (req.user?.assignedSector ? requireActiveStockSector(req.user.assignedSector) : null);
      if (req.user?.role === 'admin_setor' && req.user.assignedSector) {
        targetSector = req.user.assignedSector as any;
      }

      const origin = await prisma.$transaction(async (tx) => {
        const orig = await tx.originConfig.create({
          data: {
            name: String(name).trim().toUpperCase(),
            sector: targetSector as any,
            factoryUnitId: req.tenant!.id
          }
        });

        await tx.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'CRIACAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Origens',
            reason: `Criação de Origem: ${orig.name} (Setor: ${targetSector || 'GERAL'})`
          }
        });

        return orig;
      });
      res.status(201).json(origin);
    } catch (error: unknown) {
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Essa origem já existe.' });
      }
      console.error('Erro ao criar origem:', error);
      res.status(500).json({ error: 'Erro ao criar origem' });
    }
  }

  async deleteOrigin(req: Request, res: Response) {
    try {
      const perm = checkSettingsPermission(req);
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const id = Number(req.params.id);
      const origin = await prisma.originConfig.findFirst({
        where: { id, factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)) }
      });
      if (!origin) {
        return res.status(404).json({ error: 'Origem não encontrada.' });
      }

      const stockMovementCount = await prisma.stockMovement.count({
        where: { factoryUnitId: req.tenant!.id, origem: origin.name }
      });
      const totalActive = stockMovementCount;

      const isAdmin = req.user?.role === 'admin' || req.isGlobalAdmin;

      if (totalActive > 0 && !isAdmin) {
        return res.status(400).json({
          error: `Não é possível excluir: existem ${totalActive} movimentação(ões) vinculadas a esta origem. Apenas o Administrador Master pode gerenciar esta exclusão.`
        });
      }

      await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            factoryUnitId: req.tenant!.id,
            sector: 'CONFIGURACOES',
            type: 'EXCLUSAO_CONFIGURACAO',
            quantity: 0,
            operatorId: req.user?.matricula ? String(req.user.matricula) : (req.user?.usuario || null),
            operatorName: req.user?.nome || req.user?.usuario || 'Administrador',
            origem: 'Configurações - Origens',
            reason: `Exclusão de Origem de Sobra: ${origin.name}${totalActive > 0 ? ` (com ${totalActive} registros vinculados)` : ''}`
          }
        }),
        prisma.originConfig.delete({ where: { id, factoryUnitId: req.tenant!.id, ...sectorAccessWhere(requestStockAccess(req)) } })
      ]);

      res.json({ message: 'Origem excluída com sucesso.' });
    } catch (error: unknown) {
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (hasPrismaCode(error, 'P2003')) {
        return res.status(400).json({ error: 'Não é possível excluir este item pois ele já está vinculado a outros registros no sistema.' });
      }
      console.error('Erro ao excluir origem:', error);
      res.status(500).json({ error: 'Erro ao excluir origem' });
    }
  }
}
