import { Request, Response } from 'express';
import { prisma } from '../prisma';

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

export class ReportController {
  async inventory(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const stockItems = await prisma.stockItem.findMany({
          where: { factoryUnitId },
          orderBy: { quantity: 'desc' },
          include: {
            locations: {
              include: { location: true },
            },
          },
        });

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

      return res.json(formattedStock);
    } catch (error) {
      console.error('Erro no relatório de estoque:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório de inventário' });
    }
  }

  async movements(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const {
        dataInicio,
        dataFim,
        startDate,
        endDate,
        sector,
        tipoMovimento,
        movementType,
        operatorId,
        origin,
        origem,
        search,
      } = req.query;

      const rawStart = dataInicio || startDate;
      const rawEnd = dataFim || endDate;
      const rawPeriod = String(req.query.periodo || req.query.period || '').trim().toLowerCase();
      const rawSector = sector ? String(sector).trim().toUpperCase() : 'TODOS';
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

      // --- FILTROS PRISMA PARA STOCKMOVEMENT ---
      const stockWhere: Record<string, any> = {
        factoryUnitId,
      };

      if (start && end) {
        stockWhere.createdAt = { gte: start, lte: end };
      }

      if (rawSector === 'CORTE') {
        stockWhere.sector = 'CORTE';
      } else if (rawSector !== 'TODOS' && rawSector !== 'ALL') {
        const sec = (rawSector === 'CABEDAIS' || rawSector === 'EXPEDICAO') ? 'DISTRIBUICAO' : rawSector;
        if (sec === 'DISTRIBUICAO') {
          stockWhere.sector = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
        } else if (sec === 'CONFIGURACOES') {
          stockWhere.sector = 'NEVER_MATCH';
        } else {
          stockWhere.sector = sec;
        }
      } else {
        stockWhere.sector = { not: 'CONFIGURACOES' };
      }

      if (rawType !== 'TODOS') {
        if (rawType === 'SAIDA' || rawType === 'SAIDAS') {
          stockWhere.type = { in: ['SAIDA', 'CASAMENTO_PAR'] };
        } else if (['ENTRADA', 'TRANSFERENCIA', 'CASAMENTO_PAR', 'REFUGO'].includes(rawType)) {
          stockWhere.type = rawType;
        } else {
          stockWhere.type = 'NEVER_MATCH';
        }
      } else {
        stockWhere.type = { in: ['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'CASAMENTO_PAR', 'REFUGO'] };
      }

      if (rawOrigin && rawOrigin !== 'TODOS') {
        stockWhere.origem = { contains: rawOrigin, mode: 'insensitive' };
      }

      if (rawOperator && rawOperator !== 'TODOS') {
        stockWhere.OR = [
          { operatorName: { contains: rawOperator, mode: 'insensitive' } },
          { operatorId: { contains: rawOperator, mode: 'insensitive' } },
        ];
      }

      if (rawSearch) {
        stockWhere.OR = [
          { itemCode: { contains: rawSearch, mode: 'insensitive' } },
          { itemName: { contains: rawSearch, mode: 'insensitive' } },
          { stockItem: {
            OR: [
              { code: { contains: rawSearch, mode: 'insensitive' } },
              { description: { contains: rawSearch, mode: 'insensitive' } },
              { name: { contains: rawSearch, mode: 'insensitive' } },
              { sku: { contains: rawSearch, mode: 'insensitive' } },
              { productName: { contains: rawSearch, mode: 'insensitive' } },
              { pieceCode: { contains: rawSearch, mode: 'insensitive' } },
            ],
          } },
        ];
      }

      const [stockMovements, locationsList] = await Promise.all([
          prisma.stockMovement.findMany({
              where: stockWhere,
              orderBy: { createdAt: 'desc' },
              take: start ? undefined : 500,
              include: {
                stockItem: true,
              },
            }),
        prisma.location.findMany({
          where: { factoryUnitId },
          select: { id: true, name: true },
        }),
      ]);

      const locationMap = new Map(locationsList.map((l) => [l.id, l.name]));

      const formattedStock = stockMovements.map((m) => {
        const item = m.stockItem;
        const code = item?.sku || item?.pieceCode || item?.code || item?.productName || m.itemCode || '-';
        const modelName = item?.productName || '';
        const desc = item?.description || item?.name || (item?.productName ? `${item.productName}${item.color ? ' - ' + item.color : ''}` : '') || item?.sku || m.itemName || 'Componente Multi-Setor';

        const srcLoc = (m.sourceLocationId ? locationMap.get(m.sourceLocationId) : null) || m.sourceLocationName;
        const dstLoc = (m.destinationLocationId ? locationMap.get(m.destinationLocationId) : null) || m.destinationLocationName;
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
          tipoMaterial: item?.type || item?.sector || m.itemCategory || m.sector,
          gradeTamanho: item?.sizeGrade || '-',
          ladoPe: item?.footSide || '-',
          quantidade: m.quantity,
          unidade: item?.unit || m.itemUnit || 'UND',
          prateleira: locFormatted,
          origem: m.origem || 'Geração no Setor',
          motivo: m.reason || m.origem || '-',
          operador: m.operatorName || 'Operador DASS',
          matricula: m.operatorId || null,
          responsavel: m.operatorName || 'Operador DASS',
          material: {
            codigo: code,
            descricao: desc,
            tipo: item?.type || item?.sector || m.itemCategory || m.sector,
            unidade: item?.unit || m.itemUnit || 'UND',
          },
          nomeMaterial: desc,
        };
      });

      const allItems = formattedStock.sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
      );

      const entradas = allItems.filter((m) => m.tipo === 'ENTRADA');
      const saidas = allItems.filter((m) => m.tipo === 'SAIDA' || m.tipo === 'CASAMENTO_PAR');
      const refugos = allItems.filter((m) => m.tipo === 'REFUGO');
      const transferencias = allItems.filter((m) => m.tipo === 'TRANSFERENCIA');
      const casamentos = allItems.filter((m) => m.tipo === 'CASAMENTO_PAR');

      const volumeTotalEntrada = entradas.reduce((a, c) => a + Number(c.quantidade), 0);
      const volumeTotalSaida = saidas.reduce((a, c) => a + Number(c.quantidade), 0);
      const volumeTotalRefugo = refugos.reduce((a, c) => a + Number(c.quantidade), 0);
      const volumeTotalTransferencia = transferencias.reduce((a, c) => a + Number(c.quantidade), 0);
      const volumeTotalCasamentos = casamentos.reduce((a, c) => a + Number(c.quantidade), 0);

      // Segmentação para visão de Todos os Setores (Corte m² vs Outros un/pares)
      const volumeEntradaCorte = entradas.filter((m) => m.setor === 'CORTE').reduce((a, c) => a + Number(c.quantidade), 0);
      const volumeEntradaOutros = entradas.filter((m) => m.setor !== 'CORTE').reduce((a, c) => a + Number(c.quantidade), 0);
      const volumeSaidaCorte = saidas.filter((m) => m.setor === 'CORTE').reduce((a, c) => a + Number(c.quantidade), 0);
      const volumeSaidaOutros = saidas.filter((m) => m.setor !== 'CORTE').reduce((a, c) => a + Number(c.quantidade), 0);

      const totals = {
        totalRegistros: allItems.length,
        // 1. Quantidade de Operações (Lançamentos / Frequência de Linha)
        qtdOperacoesEntrada: entradas.length,
        qtdOperacoesSaida: saidas.length,
        qtdOperacoesRefugo: refugos.length,
        qtdOperacoesTransferencia: transferencias.length,
        qtdOperacoesCasamento: casamentos.length,
        // 2. Volume Físico Total (Soma real de peças / metros nos lotes)
        volumeTotalEntrada,
        volumeTotalSaida,
        totalRefugos: volumeTotalRefugo,
        totalTransferencias: volumeTotalTransferencia,
        totalCasamentosPares: Math.floor(volumeTotalCasamentos / 2),
        // Quebra segmentada para relatórios gerais
        volumeEntradaCorte,
        volumeEntradaOutros,
        volumeSaidaCorte,
        volumeSaidaOutros,
        // Retrocompatibilidade provisória com código legado:
        volumeEntradas: volumeTotalEntrada,
        volumeSaidas: volumeTotalSaida,
      };

      return res.json({
        totals,
        items: allItems,
        totalRegistros: totals.totalRegistros,
        qtdOperacoesEntrada: totals.qtdOperacoesEntrada,
        qtdOperacoesSaida: totals.qtdOperacoesSaida,
        qtdOperacoesRefugo: totals.qtdOperacoesRefugo,
        volumeTotalEntrada: totals.volumeTotalEntrada,
        volumeTotalSaida: totals.volumeTotalSaida,
        volumeEntradas: totals.volumeEntradas,
        volumeSaidas: totals.volumeSaidas,
        totalRefugos: totals.totalRefugos,
        totalCasamentosPares: totals.totalCasamentosPares,
      });
    } catch (error) {
      console.error('Erro no relatório analítico de movimentações:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório de movimentações.' });
    }
  }

  async requisitions(req: Request, res: Response) {
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
      const rawSector = sector ? String(sector).trim().toUpperCase() : 'TODOS';
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
        const sec = (rawSector === 'CABEDAIS' || rawSector === 'EXPEDICAO') ? 'DISTRIBUICAO' : rawSector;
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

      const requisitions = await prisma.materialRequisition.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
      });

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

      const totalRegistros = formatted.length;
      const totalAtendidas = formatted.filter(r => r.status === 'ATENDIDA_TOTAL' || r.status === 'ATENDIDA_PARCIAL').length;
      const totalPendentes = formatted.filter(r => r.status === 'PENDENTE').length;
      const totalCanceladas = formatted.filter(r => r.status === 'CANCELADA').length;
      const taxaAtendimento = totalRegistros > 0 ? Number(((totalAtendidas / totalRegistros) * 100).toFixed(1)) : 0;

      return res.json({
        totals: {
          totalRegistros,
          totalAtendidas,
          totalPendentes,
          totalCanceladas,
          taxaAtendimento,
        },
        items: formatted,
      });
    } catch (error) {
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
      const targetSector = req.query.sector ? String(req.query.sector).toUpperCase().trim() : 'TODOS';
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
      const shouldStreamCorte = targetSector === 'TODOS' || targetSector === 'CORTE';
      const shouldStreamStock = targetSector !== 'CORTE';

      // 1. Stream de materiais do CORTE
      if (shouldStreamCorte) {
        let lastMaterialId: number | undefined = undefined;
        const materialWhere: any = {
          factoryUnitId,
          ...(rawSearch && {
            OR: [
              { code: { contains: rawSearch, mode: 'insensitive' } },
              { name: { contains: rawSearch, mode: 'insensitive' } },
              { type: { contains: rawSearch, mode: 'insensitive' } },
            ],
          }),
        };

        while (true) {
          const batch: any[] = await prisma.stockItem.findMany({
            where: {
              ...materialWhere, sector: 'CORTE',
              ...(lastMaterialId !== undefined && { id: { gt: lastMaterialId } }),
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

          for (const m of batch) {
            const locs = (m.locations ?? []).map((l: any) => l.location?.name).filter(Boolean).join(' | ') || '-';
            res.write(csvLine([
              'CORTE',
              m.code,
              m.name,
              m.type.toUpperCase(),
              '-',
              '-',
              decimalString(m.quantity),
              m.unit || 'm²',
              locs,
              m.createdAt ? new Date(m.createdAt).toLocaleDateString('pt-BR') : '-',
            ]));
          }

          if (batch.length < batchSize) break;
          lastMaterialId = batch[batch.length - 1].id;
        }
      }

      // 2. Stream de itens dos outros setores (APOIO, PRE_FABRICADO, DISTRIBUICAO, MONTAGEM)
      if (shouldStreamStock) {
        let lastStockId: number | undefined = undefined;
        const stockWhere: any = {
          factoryUnitId,
          ...(targetSector !== 'TODOS' && {
            sector: (targetSector === 'EXPEDICAO' || targetSector === 'CABEDAIS') ? 'DISTRIBUICAO' : targetSector,
          }),
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
        };

        while (true) {
          const batch: any[] = await prisma.stockItem.findMany({
            where: {
              ...stockWhere,
              ...(lastStockId !== undefined && { id: { gt: lastStockId } }),
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
            const code = s.code || s.pieceCode || s.sku || s.productName || `Item #${s.id}`;
            const desc = s.description || s.name || s.productName || s.sku || 'Componente Multi-Setor';
            const locs = (s.locations ?? []).map((l: any) => l.location?.name).filter(Boolean).join(' | ') || '-';

            res.write(csvLine([
              s.sector,
              code,
              desc,
              s.type || s.sector,
              s.sizeGrade || '-',
              s.footSide || '-',
              decimalString(s.quantity),
              s.unit || 'UND',
              locs,
              s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '-',
            ]));
          }

          if (batch.length < batchSize) break;
          lastStockId = batch[batch.length - 1].id;
        }
      }

      return res.end();
    } catch (error) {
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
      const {
        dataInicio,
        dataFim,
        startDate,
        endDate,
        sector,
        tipoMovimento,
        movementType,
        operatorId,
        origin,
        origem,
        search,
      } = req.query;

      const rawStart = dataInicio || startDate;
      const rawEnd = dataFim || endDate;
      const rawPeriod = String(req.query.periodo || req.query.period || '').trim().toLowerCase();
      const rawSector = sector ? String(sector).trim().toUpperCase() : 'TODOS';
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

      // --- FILTROS PARA STOCKMOVEMENT ---
      const stockWhere: Record<string, any> = { factoryUnitId };
      if (start && end) stockWhere.createdAt = { gte: start, lte: end };

      if (rawSector === 'CORTE') {
        stockWhere.sector = 'CORTE';
      } else if (rawSector !== 'TODOS' && rawSector !== 'ALL') {
        const sec = (rawSector === 'CABEDAIS' || rawSector === 'EXPEDICAO') ? 'DISTRIBUICAO' : rawSector;
        if (sec === 'DISTRIBUICAO') {
          stockWhere.sector = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
        } else if (sec === 'CONFIGURACOES') {
          stockWhere.sector = 'NEVER_MATCH';
        } else {
          stockWhere.sector = sec;
        }
      } else {
        stockWhere.sector = { not: 'CONFIGURACOES' };
      }

      if (rawType !== 'TODOS') {
        if (rawType === 'SAIDA' || rawType === 'SAIDAS') {
          stockWhere.type = { in: ['SAIDA', 'CASAMENTO_PAR'] };
        } else if (['ENTRADA', 'TRANSFERENCIA', 'CASAMENTO_PAR', 'REFUGO'].includes(rawType)) {
          stockWhere.type = rawType;
        } else {
          stockWhere.type = 'NEVER_MATCH';
        }
      } else {
        stockWhere.type = { in: ['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'CASAMENTO_PAR', 'REFUGO'] };
      }

      if (rawOrigin && rawOrigin !== 'TODOS') {
        stockWhere.origem = { contains: rawOrigin, mode: 'insensitive' };
      }

      if (rawOperator && rawOperator !== 'TODOS') {
        stockWhere.OR = [
          { operatorName: { contains: rawOperator, mode: 'insensitive' } },
          { operatorId: { contains: rawOperator, mode: 'insensitive' } },
        ];
      }

      if (rawSearch) {
        stockWhere.OR = [
          { itemCode: { contains: rawSearch, mode: 'insensitive' } },
          { itemName: { contains: rawSearch, mode: 'insensitive' } },
          { stockItem: {
            OR: [
              { code: { contains: rawSearch, mode: 'insensitive' } },
              { description: { contains: rawSearch, mode: 'insensitive' } },
              { name: { contains: rawSearch, mode: 'insensitive' } },
              { sku: { contains: rawSearch, mode: 'insensitive' } },
              { productName: { contains: rawSearch, mode: 'insensitive' } },
              { pieceCode: { contains: rawSearch, mode: 'insensitive' } },
            ],
          } },
        ];
      }

      const locationsList = await prisma.location.findMany({
        where: { factoryUnitId },
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
            const code = item?.sku || item?.pieceCode || item?.code || item?.productName || m.itemCode || '-';
            const desc = item?.description || item?.name || (item?.productName ? `${item.productName}${item.color ? ' - ' + item.color : ''}` : '') || item?.sku || m.itemName || 'Componente Multi-Setor';

            const srcLoc = (m.sourceLocationId ? locationMap.get(m.sourceLocationId) : null) || m.sourceLocationName;
            const dstLoc = (m.destinationLocationId ? locationMap.get(m.destinationLocationId) : null) || m.destinationLocationName;
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
              item?.type || item?.sector || m.itemCategory || m.sector,
              item?.sizeGrade || '-',
              item?.footSide || '-',
              decimalString(m.quantity),
              item?.unit || m.itemUnit || 'UND',
              locFormatted,
              m.origem || 'Geração no Setor',
              m.reason || m.origem || '-',
              m.operatorName || 'Operador DASS',
              m.operatorId || '-',
            ]));
          }

          if (batch.length < batchSize) break;
          lastStockId = batch[batch.length - 1].id;
        }
      }

      return res.end();
    } catch (error) {
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
      const rawSector = sector ? String(sector).trim().toUpperCase() : 'TODOS';
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
        const sec = (rawSector === 'CABEDAIS' || rawSector === 'EXPEDICAO') ? 'DISTRIBUICAO' : rawSector;
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
      console.error('Erro ao exportar requisições por streaming:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Erro interno ao exportar requisições.' });
      }
      return res.end();
    }
  }
}
