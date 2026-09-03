import { Request, Response } from 'express';
import { Prisma } from '../generated/prisma';
import { prisma } from '../prisma';

const decimal = (value: unknown) => value == null ? '0.000' : String(value);

type LowStockRow = { unitId: number; count: bigint };
type TopMaterialRow = { id: number; code: string; name: string; quantity: Prisma.Decimal; unitId: number; unit: string };

export class DashboardController {
  async getSummary(req: Request, res: Response) {
    try {
      const factoryUnitId = req.tenant!.id;
      const [stockByUnit, categoryGroups, movementCounts, originGroups, lowStockRows, topMaterials, categories, units] = await Promise.all([
        prisma.material.groupBy({ by: ['unitId'], where: { factoryUnitId }, _count: { id: true }, _sum: { quantity: true } }),
        prisma.material.groupBy({ by: ['unitId', 'categoryId'], where: { factoryUnitId }, _count: { id: true }, _sum: { quantity: true } }),
        prisma.movement.groupBy({ by: ['type'], where: { factoryUnitId }, _count: { id: true } }),
        prisma.movement.groupBy({ by: ['materialUnit', 'originId', 'originName'], where: { factoryUnitId, type: 'entrada' }, _count: { id: true }, _sum: { quantity: true } }),
        prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
          SELECT "unitId", count(*)::bigint AS count FROM "sobra_corte"."Material"
          WHERE "factoryUnitId" = ${factoryUnitId} AND quantity <= "minStock" GROUP BY "unitId"
        `),
        prisma.$queryRaw<TopMaterialRow[]>(Prisma.sql`
          SELECT ranked.id, ranked.code, ranked.name, ranked.quantity, ranked."unitId", ranked.unit
          FROM (
            SELECT m.id, m.code, m.name, m.quantity, m."unitId", u.symbol AS unit,
                   row_number() OVER (PARTITION BY m."unitId" ORDER BY m.quantity DESC, m.id ASC) AS position
            FROM "sobra_corte"."Material" m
            JOIN "sobra_corte"."UnitConfig" u ON u.id = m."unitId" AND u."factoryUnitId" = m."factoryUnitId"
            WHERE m."factoryUnitId" = ${factoryUnitId}
          ) ranked WHERE ranked.position <= 5 ORDER BY ranked."unitId", ranked.position
        `),
        prisma.categoryConfig.findMany({ where: { factoryUnitId }, select: { id: true, name: true } }),
        prisma.unitConfig.findMany({ where: { factoryUnitId }, select: { id: true, symbol: true } }),
      ]);

      const categoryNames = new Map(categories.map((item) => [item.id, item.name]));
      const unitNames = new Map(units.map((item) => [item.id, item.symbol]));
      const lowStock = new Map(lowStockRows.map((item) => [item.unitId, Number(item.count)]));
      const entries = movementCounts.find((item) => item.type === 'entrada')?._count.id ?? 0;
      const exits = movementCounts.find((item) => item.type === 'saida')?._count.id ?? 0;
      const totalMovements = movementCounts.reduce((total, item) => total + item._count.id, 0);

      return res.json({
        stats: {
          totalMaterials: stockByUnit.reduce((total, item) => total + item._count.id, 0),
          lowStock: lowStockRows.reduce((total, item) => total + Number(item.count), 0),
          totalMovements,
          totalEntries: entries,
          totalExits: exits,
          exitToEntryPercent: entries === 0 ? null : Math.round((exits / entries) * 1000) / 10,
        },
        units: stockByUnit.map((item) => ({ unitId: item.unitId, unit: unitNames.get(item.unitId) ?? null, materials: item._count.id, lowStock: lowStock.get(item.unitId) ?? 0, quantity: decimal(item._sum.quantity) })),
        categories: categoryGroups.map((item) => ({ unitId: item.unitId, unit: unitNames.get(item.unitId) ?? null, categoryId: item.categoryId, name: categoryNames.get(item.categoryId) ?? 'Não informada', materials: item._count.id, quantity: decimal(item._sum.quantity) })),
        origins: originGroups.map((item) => ({ unit: item.materialUnit, originId: item.originId, name: item.originName ?? 'Não informada', events: item._count.id, quantity: decimal(item._sum.quantity) })),
        topMaterials: topMaterials.map((item) => ({ ...item, quantity: decimal(item.quantity) })),
      });
    } catch (error) {
      console.error('Erro analítico ao processar dashboard:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar indicadores.' });
    }
  }
}
