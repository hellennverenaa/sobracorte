import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { prisma } from '../prisma';
import { SectorType } from '../generated/prisma';
import { normalizeStockColor, normalizeStockSector, normalizeStockText } from '../services/stockIdentity';
import { requireActiveStockSector, SectorValidationError } from '../utils/sectorHelper';
import { validateUnit } from '../utils/unitHelper';

const CompatibilitySchema = z.object({
  requestSector: z.string().trim().min(1),
  requestSku: z.string().trim().max(120).optional().default(''),
  requestDescription: z.string().trim().max(240).optional().default(''),
  requestModelName: z.string().trim().max(160).optional().default(''),
  requestType: z.string().trim().max(100).optional().default(''),
  requestColor: z.string().trim().max(100).optional().default(''),
  requestSizeGrade: z.string().trim().max(100).optional().default(''),
  requestFootSide: z.enum(['E', 'D', 'PAR']).optional().nullable(),
  requestUnit: z.string().trim().min(1).max(30),
  sourceStockItemId: z.coerce.number().int().positive(),
  sourceQuantityPerRequestUnit: z.coerce.number().positive().max(1000000),
  reason: z.string().trim().min(3).max(240),
}).refine(value => value.requestSku || value.requestDescription, {
  message: 'Informe o SKU/código solicitado ou a descrição usada na requisição.',
  path: ['requestSku'],
});

function matchKey(value: {
  requestSku?: string | null; requestDescription?: string | null; requestModelName?: string | null; requestType?: string | null;
  requestColor?: string | null; requestSizeGrade?: string | null; requestFootSide?: string | null;
}) {
  return JSON.stringify([
    value.requestSku ? `SKU:${normalizeStockText(value.requestSku)}` : `DESCRIPTION:${normalizeStockText(value.requestDescription)}`,
    normalizeStockText(value.requestModelName),
    normalizeStockText(value.requestType),
    normalizeStockColor(value.requestColor),
    normalizeStockText(value.requestSizeGrade),
    normalizeStockText(value.requestFootSide),
  ]);
}

function isMasterAdmin(req: Request) {
  return (req.effectiveContext?.isGlobalAdmin ?? req.isGlobalAdmin) === true
    || (req.effectiveContext?.effectiveRole ?? req.user?.role) === 'admin';
}

function normalizedItem(item: any) {
  return {
    ...item,
    sourceSector: item.sourceStockItem?.sector || item.sourceSector,
    sourceItem: item.sourceStockItem,
    sourceStockItem: undefined,
  };
}

export class RequisitionStockCompatibilityController {
  async list(req: Request, res: Response) {
    if (!isMasterAdmin(req)) return res.status(403).json({ error: 'Somente um Administrador Master pode gerenciar vínculos de produto/BOM.' });
    if (!req.tenant) return res.status(400).json({ error: 'Unidade fabril não identificada.' });
    try {
      const mappings = await prisma.requisitionStockCompatibility.findMany({
        where: { factoryUnitId: req.tenant.id },
        include: { sourceStockItem: true },
        orderBy: [{ requestSector: 'asc' }, { requestSku: 'asc' }, { id: 'desc' }],
      });
      return res.json(mappings.map(normalizedItem));
    } catch (error) {
      console.error('Erro ao listar vínculos de produto para requisições:', error);
      return res.status(500).json({ error: 'Erro ao carregar vínculos de produto/BOM.' });
    }
  }

  async listSourceItems(req: Request, res: Response) {
    if (!isMasterAdmin(req)) return res.status(403).json({ error: 'Somente um Administrador Master pode gerenciar vínculos de produto/BOM.' });
    if (!req.tenant) return res.status(400).json({ error: 'Unidade fabril não identificada.' });
    try {
      const rawSector = String(req.query.sector || '');
      const sector = requireActiveStockSector(rawSector);
      const search = String(req.query.search || '').trim();
      if (search.length < 2) return res.json([]);
      const rows = await prisma.stockItem.findMany({
        where: {
          factoryUnitId: req.tenant.id,
          sector: normalizeStockSector(sector) === 'DISTRIBUICAO'
            ? { in: ['DISTRIBUICAO', 'EXPEDICAO'] }
            : sector as SectorType,
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { pieceCode: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { productName: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { type: { contains: search, mode: 'insensitive' } },
            { color: { contains: search, mode: 'insensitive' } },
            { materialColor: { contains: search, mode: 'insensitive' } },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      return res.json(rows);
    } catch (error) {
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro ao pesquisar itens para vínculo de produto:', error);
      return res.status(500).json({ error: 'Erro ao pesquisar materiais fornecedores.' });
    }
  }

  async create(req: Request, res: Response) {
    if (!isMasterAdmin(req)) return res.status(403).json({ error: 'Somente um Administrador Master pode gerenciar vínculos de produto/BOM.' });
    if (!req.tenant) return res.status(400).json({ error: 'Unidade fabril não identificada.' });
    try {
      const parsed = CompatibilitySchema.parse(req.body);
      const requestSector = requireActiveStockSector(parsed.requestSector);
      const targetSku = normalizeStockText(parsed.requestSku);
      const targetDescription = normalizeStockText(parsed.requestDescription);
      const targetModelName = normalizeStockText(parsed.requestModelName);
      const targetType = normalizeStockText(parsed.requestType);
      const targetColor = normalizeStockColor(parsed.requestColor);
      const targetSizeGrade = normalizeStockText(parsed.requestSizeGrade);
      const requestUnit = validateUnit(parsed.requestUnit);
      const sourceItem = await prisma.stockItem.findFirst({
        where: { id: parsed.sourceStockItemId, factoryUnitId: req.tenant.id },
        select: { id: true, sector: true },
      });
      if (!sourceItem) return res.status(404).json({ error: 'Item fornecedor não encontrado nesta unidade fabril.' });
      const sourceSector = requireActiveStockSector(sourceItem.sector);
      if (normalizeStockSector(requestSector) === normalizeStockSector(sourceSector)) {
        return res.status(400).json({ error: 'O vínculo de compatibilidade deve apontar para um setor diferente do setor solicitante.' });
      }
      const normalizedInput = {
        requestSku: targetSku || null,
        requestDescription: targetSku ? null : targetDescription || null,
        requestModelName: targetModelName,
        requestType: targetType,
        requestColor: targetColor,
        requestSizeGrade: targetSizeGrade,
        requestFootSide: parsed.requestFootSide || null,
      };
      const key = matchKey(normalizedInput);
      const created = await prisma.requisitionStockCompatibility.create({
        data: {
          factoryUnitId: req.tenant.id,
          requestSector: requestSector as SectorType,
          ...normalizedInput,
          matchKey: key,
          requestUnit,
          sourceStockItemId: sourceItem.id,
          sourceSector: sourceSector as SectorType,
          sourceQuantityPerRequestUnit: parsed.sourceQuantityPerRequestUnit,
          reason: parsed.reason.trim(),
        },
        include: { sourceStockItem: true },
      });
      return res.status(201).json(normalizedItem(created));
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json({ error: 'Dados do vínculo inválidos.', details: error.flatten().fieldErrors });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        return res.status(409).json({ error: 'Este item fornecedor já está vinculado a esse produto e conjunto de variantes.' });
      }
      console.error('Erro ao criar vínculo de produto para requisição:', error);
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao salvar vínculo de produto/BOM.' });
    }
  }

  async remove(req: Request, res: Response) {
    if (!isMasterAdmin(req)) return res.status(403).json({ error: 'Somente um Administrador Master pode gerenciar vínculos de produto/BOM.' });
    if (!req.tenant) return res.status(400).json({ error: 'Unidade fabril não identificada.' });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Identificador do vínculo inválido.' });
    try {
      const result = await prisma.requisitionStockCompatibility.deleteMany({ where: { id, factoryUnitId: req.tenant.id } });
      if (!result.count) return res.status(404).json({ error: 'Vínculo não encontrado nesta unidade fabril.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir vínculo de produto para requisição:', error);
      return res.status(500).json({ error: 'Erro ao excluir vínculo de produto/BOM.' });
    }
  }
}
