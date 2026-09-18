import { assertStockSectorAccess } from '../auth/stockAccess';
import { pairCompatibilitySql } from './pairCompatibilitySql';
import { movementSnapshot } from './movementSnapshot';
import { prisma } from '../prisma';
import { Prisma } from '../generated/prisma';
import { lockStockIdentityWrites, normalizeStockSector } from './stockIdentity';
import { debitStockItem } from './stockDebit';
import { assertCompatiblePair } from './requisitionStock';
import { ExecuteMatchDTO, OperatorContext } from '../types/stock.dto';
import { SectorType } from '../generated/prisma';

export interface MatchingPairRawResult {
  sku: string;
  productName?: string | null;
  sizeGrade: string;
  color?: string | null;
  type?: string | null;
  sector?: SectorType;
  leftFootStockItemId: number;
  leftQuantity: number;
  leftLocations: string | null;
  rightFootStockItemId: number;
  rightQuantity: number;
  rightLocations: string | null;
  formablePairs: number;
}

export class MountingPairService {
  /**
   * Localiza instantaneamente os pares casáveis nos setores: MONTAGEM, PRE_FABRICADO (Solas) e EXPEDICAO (Cabedais)
   */
  async findMatchingPairs(
    factoryUnitId: number,
    sector: SectorType = 'MONTAGEM',
    searchQuery: string = ''
  ): Promise<MatchingPairRawResult[]> {
    const normalizedSector = normalizeStockSector(sector) as SectorType;

    const rawPairs = await prisma.$queryRaw<MatchingPairRawResult[]>`
      SELECT 
        COALESCE(e."sku", e."pieceCode", e."productName", '-') AS "sku",
        COALESCE(e."productName", e."description", '-') AS "productName",
        e."sizeGrade",
        e."color",
        e."type",
        e.sector,
        e.id AS "leftFootStockItemId",
        e.quantity AS "leftQuantity",
        (
          SELECT string_agg(l.name, ' | ') 
          FROM sobra_corte."StockItemLocation" sil 
          JOIN sobra_corte."Location" l ON l.id = sil."locationId" 
          WHERE sil."stockItemId" = e.id AND sil.quantity > 0
        ) AS "leftLocations",
        d.id AS "rightFootStockItemId",
        d.quantity AS "rightQuantity",
        (
          SELECT string_agg(l.name, ' | ') 
          FROM sobra_corte."StockItemLocation" sil 
          JOIN sobra_corte."Location" l ON l.id = sil."locationId" 
          WHERE sil."stockItemId" = d.id AND sil.quantity > 0
        ) AS "rightLocations",
        LEAST(e.quantity, d.quantity) AS "formablePairs"
      FROM sobra_corte."StockItem" e
      INNER JOIN sobra_corte."StockItem" d
        ON ${pairCompatibilitySql}
      WHERE e."factoryUnitId" = ${factoryUnitId}
        AND (e.sector = ${normalizedSector}::sobra_corte."SectorType" OR ((${normalizedSector} = 'DISTRIBUICAO') AND e.sector = 'EXPEDICAO'::sobra_corte."SectorType"))
        AND (d.sector = ${normalizedSector}::sobra_corte."SectorType" OR ((${normalizedSector} = 'DISTRIBUICAO') AND d.sector = 'EXPEDICAO'::sobra_corte."SectorType"))
        AND e."footSide" = 'E'
        AND d."footSide" = 'D'
        AND e.quantity > 0
        AND d.quantity > 0
      ORDER BY "formablePairs" DESC, "sku" ASC;
    `;

    const mapped = rawPairs.map((p) => ({
      ...p,
      leftQuantity: Number(p.leftQuantity),
      rightQuantity: Number(p.rightQuantity),
      formablePairs: Number(p.formablePairs),
      leftLocations: p.leftLocations || 'Não definido',
      rightLocations: p.rightLocations || 'Não definido',
      productName: p.productName || p.sku,
    }));

    if (!searchQuery || !searchQuery.trim()) {
      return mapped;
    }

    const term = searchQuery.trim().toUpperCase();
    return mapped.filter((p) =>
      p.sku.toUpperCase().includes(term) ||
      (p.productName && p.productName.toUpperCase().includes(term)) ||
      p.sizeGrade.toUpperCase().includes(term) ||
      (p.color && p.color.toUpperCase().includes(term))
    );
  }

  /**
   * Executa a baixa atômica de casamento de par validado pelo operador em qualquer setor suportado
   */
  async executeMatch(dto: ExecuteMatchDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;
    return prisma.$transaction(async tx => {
      await lockStockIdentityWrites(tx, factoryUnitId);
      const items = await Promise.all([dto.leftStockItemId, dto.rightStockItemId].map(id => tx.stockItem.findFirst({
        where: { id, factoryUnitId }, include: { locations: { include: { location: true } } },
      })));
      const [left, right] = items;
      if (!left || !right) throw new Error('Um ou ambos os itens de estoque não foram encontrados.');
      assertStockSectorAccess(context, left.sector);
      assertStockSectorAccess(context, right.sector);
      if (!['PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'].includes(left.sector)) throw new Error('O setor não permite casamento de pares.');
      if (normalizeStockSector(left.sector) !== normalizeStockSector(dto.sector)) throw new Error('Os itens não pertencem ao setor informado para o casamento.');
      assertCompatiblePair(left, right);
      const balances = new Map<number, Prisma.Decimal>();
      for (const item of [left, right].sort((a, b) => a.id - b.id)) {
        const { debits, remainingQuantity } = await debitStockItem(tx, item, dto.quantity);
        balances.set(item.id, remainingQuantity);
        for (const debit of debits) {
          await tx.stockMovement.create({
            data: {
              factoryUnitId, stockItemId: item.id, sector: item.sector, type: 'CASAMENTO_PAR',
              quantity: debit.quantity, sourceLocationId: debit.locationId, sourceLocationName: debit.locationName,
              ...movementSnapshot(item),
              sourceStockItemId: item.id, sourceSector: item.sector,
              origem: `Casamento de Pares no setor ${item.sector}`,
              reason: `Casamento de Par - Pé ${item.footSide} casado com ID ${item.id === left.id ? right.id : left.id}. Obs: ${dto.reason}`,
              operatorId: operatorId || null, operatorName: operatorName || 'Operador',
            },
          });
        }
      }
      return { success: true, matchedPairs: dto.quantity, sector: left.sector, sku: left.sku || left.productName,
        sizeGrade: left.sizeGrade, remainingLeftQuantity: Number(balances.get(left.id)), remainingRightQuantity: Number(balances.get(right.id)) };
    });
  }

}
