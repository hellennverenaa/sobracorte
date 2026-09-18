import { requestStockAccess, assignedStockSector, sectorAccessWhere, StockAccessError } from '../auth/stockAccess';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { normalizeUnit } from '../utils/unitHelper';
import { requireActiveStockSector, SectorValidationError } from '../utils/sectorHelper';
import type { Prisma, SectorType } from '../generated/prisma';

export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution (CSV Injection CWE-1236)
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(';')}\r\n`;
}

export function decimalString(val: unknown): string {
  if (val === null || val === undefined) return '0';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function getPagination(req: Request) {
  const parsedPage = Number.parseInt(String(req.query.page ?? '1'), 10);
  const parsedLimit = Number.parseInt(String(req.query.limit ?? '50'), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 200)
    : 50;

  return { page, limit, skip: (page - 1) * limit };
}

function paginationResponse(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrevious: page > 1,
  };
}

function buildMovementWhere(req: Request): Record<string, any> {
  const factoryUnitId = req.tenant!.id;
  const { dataInicio, dataFim, startDate, endDate, sector, tipoMovimento, movementType, operatorId, origin, origem, search } = req.query;
  const rawStart = dataInicio || startDate;
  const rawEnd = dataFim || endDate;
  const rawPeriod = String(req.query.periodo || req.query.period || '').trim().toLowerCase();
  const requestedSector = sector ? String(sector).trim() : 'TODOS';
  const rawSector = assignedStockSector(requestStockAccess(req)) || (requestedSector === 'TODOS' || requestedSector === 'ALL'
    ? 'TODOS'
    : requireActiveStockSector(requestedSector));
  const rawType = tipoMovimento || movementType ? String(tipoMovimento || movementType).trim().toUpperCase() : 'TODOS';
  const rawOrigin = origin || origem ? String(origin || origem).trim() : null;
  const rawSearch = search ? String(search).trim() : null;
  const rawOperator = operatorId ? String(operatorId).trim() : null;

  let start: Date | null = null;
  let end: Date | null = null;
  if (rawStart && rawEnd) {
    start = new Date(String(rawStart));
    start.setHours(0, 0, 0, 0);
    end = new Date(String(rawEnd));
    end.setHours(23, 59, 59, 999);
  } else if (rawPeriod === 'last_30_days' || rawPeriod === 'ultimos_30_dias') {
    start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  }

  const stockWhere: Record<string, any> = { factoryUnitId };
  if (start && end) stockWhere.createdAt = { gte: start, lte: end };
  if (rawSector === 'CORTE') {
    stockWhere.sector = 'CORTE';
  } else if (String(rawSector) !== 'TODOS' && String(rawSector) !== 'ALL') {
    const sec = String(rawSector) === 'EXPEDICAO' ? 'DISTRIBUICAO' : rawSector;
    if (sec === 'DISTRIBUICAO') stockWhere.sector = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
    else if (sec === 'CONFIGURACOES') stockWhere.sector = 'NEVER_MATCH';
    else stockWhere.sector = sec;
  } else {
    stockWhere.sector = { not: 'CONFIGURACOES' };
  }

  if (rawType !== 'TODOS') {
    if (rawType === 'SAIDA' || rawType === 'SAIDAS') {
      stockWhere.type = { in: ['SAIDA', 'CASAMENTO_PAR', 'SAIDA_REQUISICAO'] };
    } else if (['ENTRADA', 'TRANSFERENCIA', 'CASAMENTO_PAR', 'REFUGO', 'SAIDA_REQUISICAO'].includes(rawType)) {
      stockWhere.type = rawType;
    } else {
      stockWhere.type = 'NEVER_MATCH';
    }
  } else {
    stockWhere.type = { in: ['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'CASAMENTO_PAR', 'REFUGO', 'SAIDA_REQUISICAO'] };
  }

  if (rawOrigin && rawOrigin !== 'TODOS') stockWhere.origem = { contains: rawOrigin, mode: 'insensitive' };

  const movementTextFilters: Record<string, any>[] = [];
  if (rawOperator && rawOperator !== 'TODOS') {
    movementTextFilters.push({ OR: [
      { operatorName: { contains: rawOperator, mode: 'insensitive' } },
      { operatorId: { contains: rawOperator, mode: 'insensitive' } },
    ] });
  }
  if (rawSearch) {
    movementTextFilters.push({ OR: [
      { itemCode: { contains: rawSearch, mode: 'insensitive' } },
      { itemName: { contains: rawSearch, mode: 'insensitive' } },
      { itemModelName: { contains: rawSearch, mode: 'insensitive' } },
      { itemModelName: null, stockItem: { productName: { contains: rawSearch, mode: 'insensitive' } } },
      { itemCode: null, itemName: null, stockItem: {
        OR: [
          { code: { contains: rawSearch, mode: 'insensitive' } },
          { description: { contains: rawSearch, mode: 'insensitive' } },
          { name: { contains: rawSearch, mode: 'insensitive' } },
          { sku: { contains: rawSearch, mode: 'insensitive' } },
          { productName: { contains: rawSearch, mode: 'insensitive' } },
          { pieceCode: { contains: rawSearch, mode: 'insensitive' } },
        ],
      } },
    ] });
  }
  if (movementTextFilters.length > 0) stockWhere.AND = movementTextFilters;
  return stockWhere;
}

export class ReportController {
  async inventory(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const { page, limit, skip } = getPagination(req);
      const where = { factoryUnitId, ...sectorAccessWhere(requestStockAccess(req)) };
      const stockItems = await prisma.stockItem.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: {
          locations: {
            include: { location: true },
          },
        },
      });

      const [total, quantityTotals, sectorTotals, unitTotals] = await Promise.all([
        prisma.stockItem.count({ where }),
        prisma.stockItem.aggregate({ where, _sum: { quantity: true } }),
        prisma.stockItem.groupBy({
          by: ['sector'],
          where,
          _count: { _all: true },
          _sum: { quantity: true },
        }),
        prisma.stockItem.groupBy({
          by: ['sector', 'unit'],
          where,
          _count: { _all: true },
          _sum: { quantity: true },
        }),
      ]);

      const formattedStock = stockItems.map((s) => ({
        id: `stk_${s.id}`,
        setor: s.sector,
        codigo: s.code || s.pieceCode || s.sku || s.productName || `Item #${s.id}`,
        material: s.description || s.name || s.productName || s.sku || 'Componente Multi-Setor',
        descricao: s.description || s.name || s.productName || s.sku || 'Componente Multi-Setor',
        quantidade: s.quantity,
        unidade: s.unit || 'UND',
        categoria: s.sector,
        gradeTamanho: s.sizeGrade || '-',
        ladoPe: s.footSide || '-',
        prateleira: s.locations.map((l) => l.location.name).join(', ') || '-',
        data_cadastro: s.createdAt,
      }));

      const byUnit = new Map<string, { totalRegistros: number; quantidadeTotal: number }>();
      const bySectorUnit = new Map<string, Map<string, { totalRegistros: number; quantidadeTotal: number }>>();
      for (const group of unitTotals) {
        const unit = normalizeUnit(group.unit, group.sector);
        const global = byUnit.get(unit) || { totalRegistros: 0, quantidadeTotal: 0 };
        global.totalRegistros += group._count._all;
        global.quantidadeTotal += Number(group._sum.quantity ?? 0);
        byUnit.set(unit, global);
        const sectorMap = bySectorUnit.get(group.sector) || new Map();
        const sector = sectorMap.get(unit) || { totalRegistros: 0, quantidadeTotal: 0 };
        sector.totalRegistros += group._count._all;
        sector.quantidadeTotal += Number(group._sum.quantity ?? 0);
        sectorMap.set(unit, sector);
        bySectorUnit.set(group.sector, sectorMap);
      }
      const formatUnitMap = (map: Map<string, { totalRegistros: number; quantidadeTotal: number }>) => Object.fromEntries(map);
      const porUnidade = formatUnitMap(byUnit);
      const porSetor = Object.fromEntries(sectorTotals.map((group) => {
        const units = bySectorUnit.get(group.sector) || new Map();
        return [group.sector, {
          totalRegistros: group._count._all,
          quantidadeTotal: units.size === 1 ? Number(group._sum.quantity ?? 0) : null,
          porUnidade: formatUnitMap(units),
        }];
      }));
      const quantidadeTotal = byUnit.size === 1
        ? Number(quantityTotals._sum.quantity ?? 0)
        : null;

      return res.json({
        items: formattedStock,
        pagination: paginationResponse(page, limit, total),
        totals: {
          totalRegistros: total,
          quantidadeTotal,
          totalQuantidade: quantidadeTotal,
          porUnidade,
          porSetor,
        },
      });
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro no relatório de estoque:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório de inventário' });
    }
  }

  async movements(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const { page, limit, skip } = getPagination(req);
      const stockWhere = buildMovementWhere(req);

      const [stockMovements, locationsList, total, quantityTotals, movementGroups, movementUnitGroups] = await Promise.all([
        prisma.stockMovement.findMany({
          where: stockWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
          include: { stockItem: true },
        }),
        prisma.location.findMany({
          where: { factoryUnitId, ...sectorAccessWhere(requestStockAccess(req)) },
          select: { id: true, name: true },
        }),
        prisma.stockMovement.count({ where: stockWhere }),
        prisma.stockMovement.aggregate({ where: stockWhere, _sum: { quantity: true } }),
        prisma.stockMovement.groupBy({
          by: ['type', 'sector'],
          where: stockWhere,
          _count: { _all: true },
          _sum: { quantity: true },
        }),
        prisma.stockMovement.groupBy({
          by: ['type', 'sector', 'itemUnit'],
          where: stockWhere,
          _sum: { quantity: true },
          _count: { _all: true },
        }),
      ]);

      const locationMap = new Map(locationsList.map((l) => [l.id, l.name]));

      const formattedStock = stockMovements.map((m) => {
        const item = m.stockItem;
        const code = m.itemCode ?? (item?.sku || item?.pieceCode || item?.code || item?.productName || '-');
        const modelName = m.itemModelName ?? item?.productName ?? '';
        const desc = m.itemName ?? (item?.description || item?.name || item?.productName || item?.sku || 'Componente Multi-Setor');

        const srcLoc = m.sourceLocationName ?? (m.sourceLocationId ? locationMap.get(m.sourceLocationId) : null);
        const dstLoc = m.destinationLocationName ?? (m.destinationLocationId ? locationMap.get(m.destinationLocationId) : null);
        const locFormatted = srcLoc && dstLoc ? `${srcLoc} ➔ ${dstLoc}` : (dstLoc || srcLoc || '-');

        return {
          id: `stk_${m.id}`,
          data: m.createdAt,
          data_hora: m.createdAt,
          sector: m.sector,
          setor: m.sector,
          tipo: m.type,
          codigo: code,
          nomeModelo: modelName,
          descricao: desc,
          tipoMaterial: m.itemCategory ?? item?.type ?? m.sector,
          gradeTamanho: m.itemSizeGrade ?? item?.sizeGrade ?? '-',
          ladoPe: m.itemFootSide ?? item?.footSide ?? '-',
          cor: m.itemColor ?? item?.materialColor ?? item?.color ?? '',
          itemOrigemId: m.sourceStockItemId,
          itemDestinoId: m.destinationStockItemId,
          setorOrigem: m.sourceSector,
          setorDestino: m.destinationSector,
          quantidade: m.quantity,
          unidade: m.itemUnit ?? item?.unit ?? 'UND',
          prateleira: locFormatted,
          origem: m.origem || 'Geração no Setor',
          motivo: m.reason || m.origem || '-',
          operador: m.operatorName || 'Operador DASS',
          matricula: m.operatorId || null,
          responsavel: m.operatorName || 'Operador DASS',
          material: {
            codigo: code,
            descricao: desc,
            tipo: m.itemCategory ?? item?.type ?? m.sector,
            unidade: m.itemUnit ?? item?.unit ?? 'UND',
          },
          nomeMaterial: desc,
        };
      });

      const groupsByType = new Map<string, { count: number; quantity: number }>();
      const groupsBySector = new Map<string, { count: number; quantity: number }>();
      for (const group of movementGroups) {
        const quantity = Number(group._sum.quantity ?? 0);
        const type = groupsByType.get(group.type) ?? { count: 0, quantity: 0 };
        type.count += group._count._all;
        type.quantity += quantity;
        groupsByType.set(group.type, type);
        const sector = groupsBySector.get(group.sector) ?? { count: 0, quantity: 0 };
        sector.count += group._count._all;
        sector.quantity += quantity;
        groupsBySector.set(group.sector, sector);
      }

      const typeStats = (type: string) => groupsByType.get(type) ?? { count: 0, quantity: 0 };
      const entrada = typeStats('ENTRADA');
      const saida = typeStats('SAIDA');
      const casamento = typeStats('CASAMENTO_PAR');
      const requisicao = typeStats('SAIDA_REQUISICAO');
      const refugo = typeStats('REFUGO');
      const transferencia = typeStats('TRANSFERENCIA');
      const volumeByUnit = new Map<string, { entrada: number; saida: number; refugo: number; transferencia: number }>();
      for (const group of movementUnitGroups) {
        const unit = normalizeUnit(group.itemUnit, group.sector);
        const current = volumeByUnit.get(unit) || { entrada: 0, saida: 0, refugo: 0, transferencia: 0 };
        const quantity = Number(group._sum.quantity ?? 0);
        if (group.type === 'ENTRADA') current.entrada += quantity;
        if (group.type === 'SAIDA' || group.type === 'CASAMENTO_PAR' || group.type === 'SAIDA_REQUISICAO') current.saida += quantity;
        if (group.type === 'REFUGO') current.refugo += quantity;
        if (group.type === 'TRANSFERENCIA') current.transferencia += quantity;
        volumeByUnit.set(unit, current);
      }
      const unitSubtotal = (field: 'type' | 'sector', key: string) => {
        const units = new Map<string, { quantidadeTotal: number }>();
        for (const group of movementUnitGroups.filter(group => group[field] === key)) {
          const unit = normalizeUnit(group.itemUnit, group.sector);
          const current = units.get(unit) || { quantidadeTotal: 0 };
          current.quantidadeTotal += Number(group._sum.quantity ?? 0);
          units.set(unit, current);
        }
        return {
          quantidadeTotal: units.size === 1 ? [...units.values()][0].quantidadeTotal : null,
          porUnidade: Object.fromEntries(units),
        };
      };
      const volumePorUnidade = Object.fromEntries(volumeByUnit);
      const singleReportUnit = volumeByUnit.size === 1;
      const volumeTotalSaida = saida.quantity + casamento.quantity + requisicao.quantity;
      const saidaCount = saida.count + casamento.count + requisicao.count;
      const volumeEntradaCorte = movementGroups
        .filter((group) => group.type === 'ENTRADA' && group.sector === 'CORTE')
        .reduce((sum, group) => sum + Number(group._sum.quantity ?? 0), 0);
      const volumeSaidaCorte = movementGroups
        .filter((group) => (group.type === 'SAIDA' || group.type === 'CASAMENTO_PAR' || group.type === 'SAIDA_REQUISICAO') && group.sector === 'CORTE')
        .reduce((sum, group) => sum + Number(group._sum.quantity ?? 0), 0);
      const totals = {
        totalRegistros: total,
        qtdOperacoesEntrada: entrada.count,
        qtdOperacoesSaida: saidaCount,
        qtdOperacoesRefugo: refugo.count,
        qtdOperacoesTransferencia: transferencia.count,
        qtdOperacoesCasamento: casamento.count,
        volumeTotalEntrada: singleReportUnit ? entrada.quantity : null,
        volumeTotalSaida: singleReportUnit ? volumeTotalSaida : null,
        totalRefugos: singleReportUnit ? refugo.quantity : null,
        totalTransferencias: singleReportUnit ? transferencia.quantity : null,
        totalCasamentosPares: Math.floor(casamento.quantity / 2),
        volumeEntradaCorte: singleReportUnit ? volumeEntradaCorte : null,
        volumeEntradaOutros: singleReportUnit ? entrada.quantity - volumeEntradaCorte : null,
        volumeSaidaCorte: singleReportUnit ? volumeSaidaCorte : null,
        volumeSaidaOutros: singleReportUnit ? volumeTotalSaida - volumeSaidaCorte : null,
        volumeEntradas: singleReportUnit ? entrada.quantity : null,
        volumeSaidas: singleReportUnit ? volumeTotalSaida : null,
        quantidadeTotal: singleReportUnit ? Number(quantityTotals._sum.quantity ?? 0) : null,
        volumePorUnidade,
        porTipo: Object.fromEntries([...groupsByType].map(([key, value]) => [key, {
          totalRegistros: value.count,
          ...unitSubtotal('type', key),
        }])),
        porSetor: Object.fromEntries([...groupsBySector].map(([key, value]) => [key, {
          totalRegistros: value.count,
          ...unitSubtotal('sector', key),
        }])),
      };

      return res.json({
        items: formattedStock,
        pagination: paginationResponse(page, limit, total),
        totals,
      });
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro no relatório analítico de movimentações:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório de movimentações.' });
    }
  }

  async requisitions(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const { page, limit, skip } = getPagination(req);
      const {
        dataInicio,
        dataFim,
        startDate,
        endDate,
        sector,
        status,
        search,
      } = req.query;

      const rawStart = dataInicio || startDate;
      const rawEnd = dataFim || endDate;
      const rawPeriod = String(req.query.periodo || req.query.period || '').trim().toLowerCase();
      const requestedSector = sector ? String(sector).trim() : 'TODOS';
      const rawSector = assignedStockSector(requestStockAccess(req)) || (requestedSector === 'TODOS' || requestedSector === 'ALL' ? 'TODOS' : requireActiveStockSector(requestedSector));
      const rawStatus = status ? String(status).trim().toUpperCase() : 'TODOS';
      const rawSearch = search ? String(search).trim() : null;

      let start: Date | null = null;
      let end: Date | null = null;

      if (rawStart && rawEnd) {
        start = new Date(String(rawStart));
        start.setHours(0, 0, 0, 0);
        end = new Date(String(rawEnd));
        end.setHours(23, 59, 59, 999);
      } else if (rawPeriod === 'last_30_days' || rawPeriod === 'ultimos_30_dias') {
        start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      }

      const whereClause: any = { factoryUnitId };

      if (start && end) {
        whereClause.createdAt = {
          gte: start,
          lte: end,
        };
      }

      if (rawSector !== 'TODOS') {
        const sec = rawSector === 'EXPEDICAO' ? 'DISTRIBUICAO' : rawSector;
        if (sec === 'DISTRIBUICAO') {
          whereClause.requestSector = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
        } else {
          whereClause.requestSector = sec;
        }
      }

      if (rawStatus !== 'TODOS') {
        whereClause.status = rawStatus;
      }

      if (rawSearch) {
        whereClause.OR = [
          { code: { contains: rawSearch, mode: 'insensitive' } },
          { sku: { contains: rawSearch, mode: 'insensitive' } },
          { modelName: { contains: rawSearch, mode: 'insensitive' } },
          { description: { contains: rawSearch, mode: 'insensitive' } },
          { requesterName: { contains: rawSearch, mode: 'insensitive' } },
          { reason: { contains: rawSearch, mode: 'insensitive' } },
        ];
      }

      const [requisitions, totalRegistros, requisitionTotals, statusGroups] = await Promise.all([
        prisma.materialRequisition.findMany({
          where: whereClause,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
        }),
        prisma.materialRequisition.count({ where: whereClause }),
        prisma.materialRequisition.aggregate({
          where: whereClause,
          _sum: { quantityRequested: true, quantityFulfilled: true },
        }),
        prisma.materialRequisition.groupBy({
          by: ['status'],
          where: whereClause,
          _count: { _all: true },
        }),
      ]);

      const formatted = requisitions.map(r => ({
        id: r.id,
        code: r.code,
        data: r.createdAt,
        data_hora: r.createdAt,
        setorSolicitante: r.requestSector,
        sku: r.sku || '-',
        nomeModelo: r.modelName || '-',
        descricao: r.description,
        gradeTamanho: r.sizeGrade || '-',
        ladoPe: r.footSide || '-',
        quantidadeSolicitada: r.quantityRequested,
        quantidadeAtendida: r.quantityFulfilled,
        motivo: r.reason,
        status: r.status,
        solicitante: r.requesterName || r.requesterId || 'Operador DASS',
        matriculaSolicitante: r.requesterId || '-',
        updatedAt: r.updatedAt,
      }));

      const statusCounts = new Map(statusGroups.map((group) => [group.status, group._count._all]));
      const totalAtendidas = (statusCounts.get('ATENDIDA_TOTAL') ?? 0) + (statusCounts.get('ATENDIDA_PARCIAL') ?? 0);
      const totalPendentes = statusCounts.get('PENDENTE') ?? 0;
      const totalCanceladas = statusCounts.get('CANCELADA') ?? 0;
      const taxaAtendimento = totalRegistros > 0 ? Number(((totalAtendidas / totalRegistros) * 100).toFixed(1)) : 0;

      return res.json({
        items: formatted,
        pagination: paginationResponse(page, limit, totalRegistros),
        totals: {
          totalRegistros,
          totalAtendidas,
          totalPendentes,
          totalCanceladas,
          taxaAtendimento,
          quantidadeSolicitada: Number(requisitionTotals._sum.quantityRequested ?? 0),
          quantidadeAtendida: Number(requisitionTotals._sum.quantityFulfilled ?? 0),
          porStatus: Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all])),
        },
      });
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro no relatório de requisições:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório de requisições.' });
    }
  }

  /**
   * Exportação contínua de inventário por streaming HTTP em lotes de 500 registros
   */
  async exportInventory(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const requestedSector = req.query.sector ? String(req.query.sector).trim() : 'TODOS';
      const targetSector = assignedStockSector(requestStockAccess(req)) || (requestedSector === 'TODOS' || requestedSector === 'ALL'
        ? 'TODOS'
        : requireActiveStockSector(requestedSector));
      const rawSearch = req.query.search ? String(req.query.search).trim() : null;

      const dateStr = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sobracorte-inventario-${dateStr}.csv"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      // Inicia com BOM UTF-8 para exibição correta no Excel
      res.write('\uFEFF' + csvLine([
        'SETOR',
        'CODIGO',
        'DESCRICAO',
        'CATEGORIA',
        'GRADE',
        'LADO',
        'QUANTIDADE',
        'UNIDADE',
        'LOCALIZACAO',
        'DATA_CADASTRO',
      ]));

      const batchSize = 500;
      async function stream(where: Prisma.StockItemWhereInput) {
        let lastItemId: number | undefined;
        while (true) {
          const batch = await prisma.stockItem.findMany({
            where: {
              ...where,
              ...(lastItemId !== undefined && { id: { gt: lastItemId } }),
            },
            take: batchSize,
            orderBy: { id: 'asc' },
            include: {
              locations: {
                include: { location: true },
              },
            },
          });

          if (batch.length === 0) break;

          for (const s of batch) {
            const isCorte = s.sector === 'CORTE';
            const locs = (s.locations ?? []).map(l => l.location?.name).filter(Boolean).join(' | ') || '-';
            res.write(csvLine([
              s.sector,
              isCorte ? s.code : s.code || s.pieceCode || s.sku || s.productName || `Item #${s.id}`,
              isCorte ? s.name : s.description || s.name || s.productName || s.sku || 'Componente Multi-Setor',
              isCorte ? s.type!.toUpperCase() : s.type || s.sector,
              isCorte ? '-' : s.sizeGrade || '-',
              isCorte ? '-' : s.footSide || '-',
              decimalString(s.quantity),
              s.unit || (isCorte ? 'm²' : 'UND'),
              locs,
              s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '-',
            ]));
          }

          if (batch.length < batchSize) break;
          lastItemId = batch[batch.length - 1].id;
        }
      }

      // Preserve Corte-first ordering and the sector-specific search fields.
      if (targetSector === 'TODOS' || targetSector === 'CORTE') {
        await stream({
          factoryUnitId, sector: 'CORTE',
          ...(rawSearch && {
            OR: [
              { code: { contains: rawSearch, mode: 'insensitive' } },
              { name: { contains: rawSearch, mode: 'insensitive' } },
              { type: { contains: rawSearch, mode: 'insensitive' } },
            ],
          }),
        });
      }
      if (targetSector !== 'CORTE') {
        await stream({
          factoryUnitId,
          ...(targetSector !== 'TODOS' && {
            sector: ['DISTRIBUICAO', 'EXPEDICAO', 'CABEDAIS'].includes(targetSector) ? { in: ['DISTRIBUICAO', 'EXPEDICAO'] } : targetSector as SectorType,
          }),
          ...(targetSector === 'TODOS' && { sector: { not: 'CORTE' } }),
          ...(rawSearch && {
            OR: [
              { code: { contains: rawSearch, mode: 'insensitive' } },
              { name: { contains: rawSearch, mode: 'insensitive' } },
              { description: { contains: rawSearch, mode: 'insensitive' } },
              { pieceCode: { contains: rawSearch, mode: 'insensitive' } },
              { sku: { contains: rawSearch, mode: 'insensitive' } },
              { productName: { contains: rawSearch, mode: 'insensitive' } },
            ],
          }),
        });
      }

      return res.end();
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro ao exportar inventário por streaming:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Erro interno ao exportar inventário.' });
      }
      return res.end();
    }
  }

  /**
   * Exportação contínua de movimentações por streaming HTTP em lotes de 500 registros
   */
  async exportMovements(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const stockWhere = buildMovementWhere(req);

      const locationsList = await prisma.location.findMany({
        where: { factoryUnitId, ...sectorAccessWhere(requestStockAccess(req)) },
        select: { id: true, name: true },
      });
      const locationMap = new Map(locationsList.map((l) => [l.id, l.name]));

      const dateStr = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sobracorte-movimentacoes-${dateStr}.csv"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      // BOM UTF-8 + Cabeçalhos
      res.write('\uFEFF' + csvLine([
        'DATA',
        'HORA',
        'SETOR',
        'TIPO_OPERACAO',
        'CODIGO_ITEM',
        'DESCRICAO_ITEM',
        'TIPO_MATERIAL',
        'GRADE',
        'LADO',
        'QUANTIDADE',
        'UNIDADE',
        'LOCALIZACAO',
        'ORIGEM_SOBRA',
        'MOTIVO_OPERACAO',
        'RESPONSAVEL',
        'MATRICULA',
        'MODELO',
        'COR',
        'ITEM_ORIGEM',
        'ITEM_DESTINO',
        'SETOR_ORIGEM',
        'SETOR_DESTINO',
      ]));

      const batchSize = 500;

      // 1. Stream StockMovement
      {
        let lastStockId: number | undefined = undefined;
        while (true) {
          const batch: any[] = await prisma.stockMovement.findMany({
            where: {
              ...stockWhere,
              ...(lastStockId !== undefined && { id: { lt: lastStockId } }),
            },
            take: batchSize,
            orderBy: { id: 'desc' },
            include: {
              stockItem: true,
            },
          });

          if (batch.length === 0) break;

          for (const m of batch) {
            const item = m.stockItem;
            const code = m.itemCode ?? (item?.sku || item?.pieceCode || item?.code || item?.productName || '-');
            const desc = m.itemName ?? (item?.description || item?.name || item?.productName || item?.sku || 'Componente Multi-Setor');

            const srcLoc = m.sourceLocationName ?? (m.sourceLocationId ? locationMap.get(m.sourceLocationId) : null);
            const dstLoc = m.destinationLocationName ?? (m.destinationLocationId ? locationMap.get(m.destinationLocationId) : null);
            const locFormatted = srcLoc && dstLoc ? `${srcLoc} ➔ ${dstLoc}` : (dstLoc || srcLoc || '-');

            const dateObj = new Date(m.createdAt);
            const dataStr = dateObj.toLocaleDateString('pt-BR');
            const horaStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            res.write(csvLine([
              dataStr,
              horaStr,
              m.sector,
              m.type,
              code,
              desc,
              m.itemCategory ?? item?.type ?? m.sector,
              m.itemSizeGrade ?? item?.sizeGrade ?? '-',
              m.itemFootSide ?? item?.footSide ?? '-',
              decimalString(m.quantity),
              m.itemUnit ?? item?.unit ?? 'UND',
              locFormatted,
              m.origem || 'Geração no Setor',
              m.reason || m.origem || '-',
              m.operatorName || 'Operador DASS',
              m.operatorId || '-',
              m.itemModelName ?? item?.productName ?? '',
              m.itemColor ?? item?.materialColor ?? item?.color ?? '',
              m.sourceStockItemId ?? '',
              m.destinationStockItemId ?? '',
              m.sourceSector ?? '',
              m.destinationSector ?? '',
            ]));
          }

          if (batch.length < batchSize) break;
          lastStockId = batch[batch.length - 1].id;
        }
      }

      return res.end();
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro ao exportar movimentações por streaming:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Erro interno ao exportar movimentações.' });
      }
      return res.end();
    }
  }

  /**
   * Exportação contínua de requisições por streaming HTTP em lotes de 500 registros
   */
  async exportRequisitions(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const {
        dataInicio,
        dataFim,
        startDate,
        endDate,
        sector,
        status,
        search,
      } = req.query;

      const rawStart = dataInicio || startDate;
      const rawEnd = dataFim || endDate;
      const rawPeriod = String(req.query.periodo || req.query.period || '').trim().toLowerCase();
      const requestedSector = sector ? String(sector).trim() : 'TODOS';
      const rawSector = assignedStockSector(requestStockAccess(req)) || (requestedSector === 'TODOS' || requestedSector === 'ALL' ? 'TODOS' : requireActiveStockSector(requestedSector));
      const rawStatus = status ? String(status).trim().toUpperCase() : 'TODOS';
      const rawSearch = search ? String(search).trim() : null;

      let start: Date | null = null;
      let end: Date | null = null;

      if (rawStart && rawEnd) {
        start = new Date(String(rawStart));
        start.setHours(0, 0, 0, 0);
        end = new Date(String(rawEnd));
        end.setHours(23, 59, 59, 999);
      } else if (rawPeriod === 'last_30_days' || rawPeriod === 'ultimos_30_dias') {
        start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      }

      const whereClause: any = { factoryUnitId };
      if (start && end) whereClause.createdAt = { gte: start, lte: end };

      if (rawSector !== 'TODOS') {
        const sec = rawSector === 'EXPEDICAO' ? 'DISTRIBUICAO' : rawSector;
        if (sec === 'DISTRIBUICAO') {
          whereClause.requestSector = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
        } else {
          whereClause.requestSector = sec;
        }
      }

      if (rawStatus !== 'TODOS') {
        whereClause.status = rawStatus;
      }

      if (rawSearch) {
        whereClause.OR = [
          { code: { contains: rawSearch, mode: 'insensitive' } },
          { sku: { contains: rawSearch, mode: 'insensitive' } },
          { modelName: { contains: rawSearch, mode: 'insensitive' } },
          { description: { contains: rawSearch, mode: 'insensitive' } },
          { requesterName: { contains: rawSearch, mode: 'insensitive' } },
          { reason: { contains: rawSearch, mode: 'insensitive' } },
        ];
      }

      const dateStr = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sobracorte-requisicoes-${dateStr}.csv"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      // BOM UTF-8 + Cabeçalhos
      res.write('\uFEFF' + csvLine([
        'CODIGO',
        'DATA',
        'HORA',
        'SETOR_SOLICITANTE',
        'SKU_MATERIAL',
        'MODELO',
        'DESCRICAO',
        'GRADE',
        'LADO',
        'QTD_SOLICITADA',
        'QTD_ATENDIDA',
        'MOTIVO',
        'STATUS',
        'SOLICITANTE',
        'MATRICULA',
      ]));

      const batchSize = 500;
      let lastId: number | undefined = undefined;

      while (true) {
        const batch: any[] = await prisma.materialRequisition.findMany({
          where: {
            ...whereClause,
            ...(lastId !== undefined && { id: { lt: lastId } }),
          },
          take: batchSize,
          orderBy: { id: 'desc' },
        });

        if (batch.length === 0) break;

        for (const r of batch) {
          const dateObj = new Date(r.createdAt);
          const dataStr = dateObj.toLocaleDateString('pt-BR');
          const horaStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          res.write(csvLine([
            r.code,
            dataStr,
            horaStr,
            r.requestSector,
            r.sku || '-',
            r.modelName || '-',
            r.description,
            r.sizeGrade || '-',
            r.footSide || '-',
            decimalString(r.quantityRequested),
            decimalString(r.quantityFulfilled),
            r.reason || '-',
            r.status,
            r.requesterName || r.requesterId || 'Operador DASS',
            r.requesterId || '-',
          ]));
        }

        if (batch.length < batchSize) break;
        lastId = batch[batch.length - 1].id;
      }

      return res.end();
    } catch (error) {
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      console.error('Erro ao exportar requisições por streaming:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Erro interno ao exportar requisições.' });
      }
      return res.end();
    }
  }
}
