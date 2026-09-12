import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class ReportController {
  async inventory(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const [materials, stockItems] = await Promise.all([
        prisma.material.findMany({
          where: { factoryUnitId },
          orderBy: { quantity: 'desc' },
          include: {
            locations: {
              include: { location: true },
            },
          },
        }),
        prisma.stockItem.findMany({
          where: { factoryUnitId },
          orderBy: { quantity: 'desc' },
          include: {
            locations: {
              include: { location: true },
            },
          },
        }),
      ]);

      const formattedMaterials = materials.map((m) => ({
        id: `mat_${m.id}`,
        setor: 'CORTE',
        codigo: m.code,
        material: m.name,
        descricao: m.name,
        quantidade: m.quantity,
        unidade: m.unit,
        categoria: m.type.toUpperCase(),
        gradeTamanho: '-',
        ladoPe: '-',
        prateleira: m.locations.map((l) => l.location.name).join(', ') || '-',
        data_cadastro: m.createdAt,
      }));

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

      const all = [...formattedMaterials, ...formattedStock];

      return res.json(all);
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

      if (rawSector !== 'TODOS' && rawSector !== 'ALL' && rawSector !== 'CORTE') {
        const sec = (rawSector === 'CABEDAIS' || rawSector === 'EXPEDICAO') ? 'DISTRIBUICAO' : rawSector;
        if (sec === 'DISTRIBUICAO') {
          stockWhere.sector = { in: ['DISTRIBUICAO', 'EXPEDICAO'] };
        } else if (sec === 'CONFIGURACOES') {
          stockWhere.sector = 'NEVER_MATCH';
        } else {
          stockWhere.sector = sec;
        }
      } else {
        stockWhere.sector = { notIn: ['CORTE', 'CONFIGURACOES'] };
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
        stockWhere.stockItem = {
          OR: [
            { code: { contains: rawSearch, mode: 'insensitive' } },
            { description: { contains: rawSearch, mode: 'insensitive' } },
            { name: { contains: rawSearch, mode: 'insensitive' } },
            { sku: { contains: rawSearch, mode: 'insensitive' } },
            { productName: { contains: rawSearch, mode: 'insensitive' } },
            { pieceCode: { contains: rawSearch, mode: 'insensitive' } },
          ],
        };
      }

      // --- FILTROS PRISMA PARA MOVEMENT (CORTE) & STOCKMOVEMENT (OUTROS SETORES) ---
      const shouldQueryStock = rawSector !== 'CORTE';
      const shouldQueryLegacy = rawSector === 'TODOS' || rawSector === 'ALL' || rawSector === 'CORTE';
      const legacyWhere: Record<string, any> = {
        factoryUnitId,
      };

      if (start && end) {
        legacyWhere.createdAt = { gte: start, lte: end };
      }

      if (rawType !== 'TODOS') {
        if (rawType === 'SAIDA' || rawType === 'SAIDAS') {
          legacyWhere.type = { in: ['saida', 'refugo'] };
        } else if (rawType === 'CASAMENTO_PAR') {
          legacyWhere.type = 'never_match';
        } else {
          legacyWhere.type = rawType.toLowerCase();
        }
      }

      if (rawOrigin && rawOrigin !== 'TODOS') {
        legacyWhere.origem = { contains: rawOrigin, mode: 'insensitive' };
      }

      if (rawOperator && rawOperator !== 'TODOS') {
        legacyWhere.OR = [
          { operatorName: { contains: rawOperator, mode: 'insensitive' } },
          { operatorId: { contains: rawOperator, mode: 'insensitive' } },
        ];
      }

      if (rawSearch) {
        legacyWhere.material = {
          OR: [
            { code: { contains: rawSearch, mode: 'insensitive' } },
            { name: { contains: rawSearch, mode: 'insensitive' } },
          ],
        };
      }

      const [stockMovements, legacyMovements, locationsList] = await Promise.all([
        shouldQueryStock
          ? prisma.stockMovement.findMany({
              where: stockWhere,
              orderBy: { createdAt: 'desc' },
              take: start ? undefined : 500,
              include: {
                stockItem: true,
              },
            })
          : [],
        shouldQueryLegacy
          ? prisma.movement.findMany({
              where: legacyWhere,
              orderBy: { createdAt: 'desc' },
              take: start ? undefined : 500,
              include: {
                material: {
                  include: {
                    locations: {
                      include: { location: true },
                    },
                  },
                },
              },
            })
          : [],
        prisma.location.findMany({
          where: { factoryUnitId },
          select: { id: true, name: true },
        }),
      ]);

      const locationMap = new Map(locationsList.map((l) => [l.id, l.name]));

      const formattedStock = stockMovements.map((m) => {
        const item = m.stockItem;
        const code = item?.sku || item?.pieceCode || item?.code || item?.productName || '-';
        const modelName = item?.productName || '';
        const desc = item?.description || item?.name || (item?.productName ? `${item.productName}${item.color ? ' - ' + item.color : ''}` : '') || item?.sku || 'Componente Multi-Setor';

        const srcLoc = m.sourceLocationId ? locationMap.get(m.sourceLocationId) : null;
        const dstLoc = m.destinationLocationId ? locationMap.get(m.destinationLocationId) : null;
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
          tipoMaterial: item?.type || item?.sector || m.sector,
          gradeTamanho: item?.sizeGrade || '-',
          ladoPe: item?.footSide || '-',
          quantidade: m.quantity,
          unidade: item?.unit || 'UND',
          prateleira: locFormatted,
          origem: m.origem || 'Geração no Setor',
          motivo: m.reason || m.origem || '-',
          operador: m.operatorName || 'Operador DASS',
          matricula: m.operatorId || null,
          responsavel: m.operatorName || 'Operador DASS',
          material: {
            codigo: code,
            descricao: desc,
            tipo: item?.type || item?.sector || m.sector,
            unidade: item?.unit || 'UND',
          },
          nomeMaterial: desc,
        };
      });

      const formattedLegacy = legacyMovements.map((m) => {
        const primaryLoc = m.material?.locations?.[0]?.location?.name || 'Almoxarifado';
        return {
          id: `leg_${m.id}`,
          data: m.createdAt,
          data_hora: m.createdAt,
          sector: 'CORTE',
          setor: 'CORTE',
          tipo: m.type.toUpperCase(),
          codigo: m.material?.code || '-',
          descricao: m.material?.name || '-',
          tipoMaterial: m.material?.type || 'CORTE',
          gradeTamanho: '-',
          ladoPe: '-',
          quantidade: m.quantity,
          unidade: m.material?.unit || 'UN',
          prateleira: primaryLoc,
          origem: m.origem || 'Corte / Produção',
          motivo: m.reason || m.origem || '-',
          operador: m.operatorName || 'Operador DASS',
          matricula: m.operatorId || null,
          responsavel: m.operatorName || 'Operador DASS',
          material: {
            codigo: m.material?.code || '-',
            descricao: m.material?.name || '-',
            tipo: m.material?.type || 'CORTE',
            unidade: m.material?.unit || 'UN',
          },
          nomeMaterial: m.material?.name || '-',
        };
      });

      const allItems = [...formattedStock, ...formattedLegacy].sort(
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
}
