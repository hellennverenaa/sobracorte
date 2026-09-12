import { Request, Response } from 'express';
import { prisma } from '../prisma';

const db = prisma as any;

function decimalString(value: unknown): string {
  if (value === null || value === undefined) return '0.000';
  if (typeof value === 'object' && value !== null && 'toFixed' in value) return (value as any).toFixed(3);
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(3) : '0.000';
}

function paging(query: Request['query']) {
  const pageValue = Number(query.page ?? query._page);
  const sizeValue = Number(query.pageSize ?? query._limit);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = Number.isInteger(sizeValue) && sizeValue > 0 ? Math.min(sizeValue, 500) : 100;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function dateRange(query: Request['query']): { value?: { gte?: Date; lte?: Date }; error?: string } {
  const startValue = query.dataInicio ?? query.startDate;
  const endValue = query.dataFim ?? query.endDate;
  const date = (value: unknown, end: boolean) => {
    if (value === undefined || value === '') return undefined;
    const raw = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    // Interpret calendar filters in the server/application timezone, matching
    // the dates users see in the Brazilian UI (rather than UTC midnight).
    const result = new Date(`${raw}T${end ? '23:59:59.999' : '00:00:00.000'}`);
    const [year, month, day] = raw.split('-').map(Number);
    return Number.isNaN(result.getTime()) || result.getFullYear() !== year || result.getMonth() + 1 !== month || result.getDate() !== day ? null : result;
  };
  const start = date(startValue, false);
  const end = date(endValue, true);
  if (start === null || end === null) return { error: 'As datas devem estar no formato AAAA-MM-DD.' };
  if (start && end && start > end) return { error: 'A data inicial não pode ser posterior à data final.' };
  return { value: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } };
}

function movementFilters(query: Request['query'], factoryUnitId: number, createdAt?: { gte?: Date; lte?: Date }) {
  const type = query.type === undefined || query.type === '' || query.type === 'todos'
    ? undefined
    : String(query.type).toLowerCase();
  if (type && type !== 'entrada' && type !== 'saida') return { error: 'Tipo de movimentação inválido.' };
  const category = query.category === undefined || query.category === '' || query.category === 'todos'
    ? undefined
    : String(query.category).trim();
  if (category && category.length > 100) return { error: 'Categoria inválida.' };
  return {
    value: {
      factoryUnitId,
      ...(createdAt && { createdAt }),
      ...(type && { type }),
      ...(category && { materialCategory: { equals: category, mode: 'insensitive' } }),
    },
  };
}

function materialDto(material: any, movement?: any) {
  const snapshot = (names: string[], fallback: unknown = null) => {
    for (const name of names) if (movement?.[name] !== undefined && movement[name] !== null) return movement[name];
    return fallback;
  };
  return {
    id: material?.id ?? movement?.materialId ?? null,
    code: snapshot(['materialCodeSnapshot', 'codeSnapshot', 'materialCode'], material?.code ?? null),
    name: snapshot(['materialNameSnapshot', 'nameSnapshot', 'materialName'], material?.name ?? null),
    categoryId: material?.categoryId ?? movement?.categoryIdSnapshot ?? null,
    unitId: material?.unitId ?? movement?.unitIdSnapshot ?? null,
    categoryName: snapshot(['materialCategory'], material?.category?.name ?? null),
    unit: snapshot(['materialUnit'], material?.unit?.symbol ?? null),
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution when a value came from a user/import.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(';')}\r\n`;
}

export class ReportController {
  async inventory(req: Request, res: Response) {
    try {
      const { page, pageSize, skip } = paging(req.query);
      const where = { factoryUnitId: req.tenant!.id };
      const [total, materials] = await Promise.all([
        db.material.count({ where }),
        db.material.findMany({
          where, skip, take: pageSize,
          orderBy: [{ quantity: 'desc' }, { id: 'asc' }],
          include: { category: true, unit: true, locations: { include: { location: true } } },
        }),
      ]);
      const data = materials.map((material: any) => ({
        id: material.id,
        code: material.code,
        name: material.name,
        quantity: decimalString(material.quantity),
        categoryId: material.categoryId ?? null,
        unitId: material.unitId ?? null,
        category: material.category?.name ?? null,
        unit: material.unit?.symbol ?? null,
        createdAt: material.createdAt,
        locations: (material.locations ?? []).map((entry: any) => ({
          id: entry.locationId,
          name: entry.location?.name ?? null,
          quantity: decimalString(entry.quantity),
        })),
      }));
      return res.json({ data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (error) {
      console.error('Erro no relatório de estoque:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório de inventário' });
    }
  }

  async movements(req: Request, res: Response) {
    const range = dateRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    const filters = movementFilters(req.query, req.tenant!.id, range.value);
    if (filters.error) return res.status(400).json({ error: filters.error });
    try {
      const { page, pageSize, skip } = paging(req.query);
      const where = filters.value;
      const [total, movements] = await Promise.all([
        db.movement.count({ where }),
        db.movement.findMany({ where, skip, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { material: true, location: true, origin: true } }),
      ]);
      const data = movements.map((movement: any) => ({
        id: movement.id,
        createdAt: movement.createdAt,
        type: String(movement.type).toLowerCase(),
        quantity: decimalString(movement.quantity),
        reason: movement.reason ?? null,
        operator: { id: movement.operatorId ?? null, name: movement.operatorName ?? 'Sistema' },
        operatorId: movement.operatorId ?? null,
        operatorName: movement.operatorName ?? 'Sistema',
        originId: movement.origin?.id ?? movement.originId ?? null,
        originName: movement.origin?.name ?? movement.originName ?? null,
        locationId: movement.location?.id ?? movement.locationId ?? null,
        locationName: movement.location?.name ?? movement.locationName ?? null,
        origin: movement.origin ? { id: movement.origin.id, name: movement.origin.name } : (movement.originId ? { id: movement.originId, name: movement.originName ?? null } : null),
        location: movement.location ? { id: movement.location.id, name: movement.location.name } : (movement.locationId ? { id: movement.locationId, name: movement.locationName ?? null } : null),
        material: materialDto(movement.material, movement),
      }));
      return res.json({ data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (error) {
      console.error('Erro no relatório de movimentações:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório de movimentações' });
    }
  }

  /** Stream complete reports so exports do not have a silent row cap. */
  async exportInventory(req: Request, res: Response) {
    try {
      const batchSize = 500;
      const findBatch = (cursorId?: number) => db.material.findMany({
        where: { factoryUnitId: req.tenant!.id, ...(cursorId !== undefined && { id: { gt: cursorId } }) },
        take: batchSize,
        orderBy: [{ id: 'asc' }],
        include: { category: true, unit: true, locations: { include: { location: true } } },
      });
      let materials = await findBatch();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sobracorte-inventario.csv"');
      res.write('\uFEFF' + csvLine(['CODIGO', 'DESCRICAO', 'CATEGORIA', 'UNIDADE', 'QUANTIDADE', 'LOCALIZACAO']));
      while (true) {
        if (!materials.length) break;
        for (const material of materials) {
          const locations = (material.locations ?? []).map((entry: any) => entry.location?.name).filter(Boolean).join(' | ');
          res.write(csvLine([material.code, material.name, material.category?.name, material.unit?.symbol, decimalString(material.quantity), locations]));
        }
        if (materials.length < batchSize) break;
        materials = await findBatch(materials[materials.length - 1].id);
      }
      return res.end();
    } catch (error) {
      console.error('Erro ao exportar inventário:', error);
      if (!res.headersSent) return res.status(500).json({ error: 'Erro ao exportar inventário.' });
      return res.end();
    }
  }

  async exportMovements(req: Request, res: Response) {
    const range = dateRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    const filters = movementFilters(req.query, req.tenant!.id, range.value);
    if (filters.error) return res.status(400).json({ error: filters.error });
    try {
      const batchSize = 500;
      const where = filters.value;
      const findBatch = (cursorId?: number) => db.movement.findMany({
        where: { ...where, ...(cursorId !== undefined && { id: { lt: cursorId } }) },
        take: batchSize,
        orderBy: [{ id: 'desc' }],
        include: { material: true, location: true, origin: true },
      });
      let movements = await findBatch();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sobracorte-movimentacoes.csv"');
      res.write('\uFEFF' + csvLine(['DATA', 'TIPO', 'CODIGO', 'DESCRICAO', 'CATEGORIA', 'UNIDADE', 'QUANTIDADE', 'LOCALIZACAO', 'ORIGEM', 'MOTIVO', 'OPERADOR']));
      while (true) {
        if (!movements.length) break;
        for (const movement of movements) {
          const material = materialDto(movement.material, movement);
          res.write(csvLine([movement.createdAt?.toISOString?.() ?? movement.createdAt, String(movement.type).toLowerCase(), material.code, material.name, material.categoryName, material.unit, decimalString(movement.quantity), movement.location?.name ?? movement.locationName, movement.origin?.name ?? movement.originName, movement.reason, movement.operatorName ?? 'Sistema']));
        }
        if (movements.length < batchSize) break;
        movements = await findBatch(movements[movements.length - 1].id);
      }
      return res.end();
    } catch (error) {
      console.error('Erro ao exportar movimentações:', error);
      if (!res.headersSent) return res.status(500).json({ error: 'Erro ao exportar movimentações.' });
      return res.end();
    }
  }
}

export { csvCell, csvLine, decimalString, dateRange, movementFilters, paging };
