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
        unidade: s.unit || 'un',
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
      }

      // --- FILTROS PRISMA PARA STOCKMOVEMENT ---
      const stockWhere: Record<string, any> = {
        factoryUnitId,
      };

      if (start && end) {
        stockWhere.createdAt = { gte: start, lte: end };
      }

      if (rawSector !== 'TODOS' && rawSector !== 'ALL') {
        stockWhere.sector = rawSector;
      }

      if (rawType !== 'TODOS') {
        stockWhere.type = rawType;
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

      // --- FILTROS PRISMA PARA MOVEMENT (LEGADO CORTE) ---
      const shouldQueryLegacy = rawSector === 'TODOS' || rawSector === 'ALL' || rawSector === 'CORTE';
      const legacyWhere: Record<string, any> = {
        factoryUnitId,
      };

      if (start && end) {
        legacyWhere.createdAt = { gte: start, lte: end };
      }

      if (rawType !== 'TODOS') {
        legacyWhere.type = rawType.toLowerCase();
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
        prisma.stockMovement.findMany({
          where: stockWhere,
          orderBy: { createdAt: 'desc' },
          take: start ? undefined : 500,
          include: {
            stockItem: true,
          },
        }),
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
        const code = item?.code || item?.pieceCode || item?.sku || item?.productName || '-';
        const desc = item?.description || item?.name || item?.productName || item?.sku || 'Componente Multi-Setor';

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
          descricao: desc,
          tipoMaterial: item?.type || item?.sector || m.sector,
          gradeTamanho: item?.sizeGrade || '-',
          ladoPe: item?.footSide || '-',
          quantidade: m.quantity,
          unidade: item?.unit || 'un',
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
            unidade: item?.unit || 'un',
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
          tipoMaterial: m.material?.type || 'Corte',
          gradeTamanho: '-',
          ladoPe: '-',
          quantidade: m.quantity,
          unidade: m.material?.unit || 'm²',
          prateleira: primaryLoc,
          origem: m.origem || 'Corte / Produção',
          motivo: m.reason || m.origem || '-',
          operador: m.operatorName || 'Operador DASS',
          matricula: m.operatorId || null,
          responsavel: m.operatorName || 'Operador DASS',
          material: {
            codigo: m.material?.code || '-',
            descricao: m.material?.name || '-',
            tipo: m.material?.type || 'Corte',
            unidade: m.material?.unit || 'm²',
          },
          nomeMaterial: m.material?.name || '-',
        };
      });

      const allItems = [...formattedStock, ...formattedLegacy].sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
      );

      const totals = {
        totalRegistros: allItems.length,
        volumeEntradas: allItems.filter((m) => m.tipo === 'ENTRADA').reduce((a, c) => a + Number(c.quantidade), 0),
        volumeSaidas: allItems.filter((m) => m.tipo === 'SAIDA').reduce((a, c) => a + Number(c.quantidade), 0),
        totalRefugos: allItems.filter((m) => m.tipo === 'REFUGO').reduce((a, c) => a + Number(c.quantidade), 0),
        totalCasamentosPares: allItems.filter((m) => m.tipo === 'CASAMENTO_PAR').reduce((a, c) => a + Number(c.quantidade), 0),
        totalTransferencias: allItems.filter((m) => m.tipo === 'TRANSFERENCIA').reduce((a, c) => a + Number(c.quantidade), 0),
      };

      return res.json({
        totals,
        items: allItems,
        totalRegistros: totals.totalRegistros,
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
}
