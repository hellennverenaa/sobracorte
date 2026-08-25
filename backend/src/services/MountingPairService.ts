import { prisma } from '../prisma';
import { ExecuteMatchDTO, OperatorContext } from '../types/stock.dto';

export interface MatchingPairRawResult {
  sku: string;
  sizeGrade: string;
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
   * Localiza instantaneamente os pares casáveis de pés órfãos na Montagem
   */
  async findMatchingPairs(factoryUnitId: number): Promise<MatchingPairRawResult[]> {
    const rawPairs = await prisma.$queryRaw<MatchingPairRawResult[]>`
      SELECT 
        e."sku",
        e."sizeGrade",
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
        ON e."factoryUnitId" = d."factoryUnitId"
        AND e."sku" = d."sku"
        AND e."sizeGrade" = d."sizeGrade"
      WHERE e."factoryUnitId" = ${factoryUnitId}
        AND e.sector = 'MONTAGEM'
        AND d.sector = 'MONTAGEM'
        AND e."footSide" = 'E'
        AND d."footSide" = 'D'
        AND e.quantity > 0
        AND d.quantity > 0
      ORDER BY "formablePairs" DESC, e."sku" ASC;
    `;

    return rawPairs.map((p) => ({
      ...p,
      leftQuantity: Number(p.leftQuantity),
      rightQuantity: Number(p.rightQuantity),
      formablePairs: Number(p.formablePairs),
      leftLocations: p.leftLocations || 'Não definido',
      rightLocations: p.rightLocations || 'Não definido',
    }));
  }

  /**
   * Executa a baixa atômica de casamento de par validado pelo operador
   */
  async executeMatch(dto: ExecuteMatchDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;
    const { leftStockItemId, rightStockItemId, quantity, reason } = dto;

    return await prisma.$transaction(async (tx) => {
      // 1. Buscar os dois itens com validação de tenant
      const [leftItem, rightItem] = await Promise.all([
        tx.stockItem.findFirst({
          where: { id: leftStockItemId, factoryUnitId, sector: 'MONTAGEM' },
          include: { locations: true },
        }),
        tx.stockItem.findFirst({
          where: { id: rightStockItemId, factoryUnitId, sector: 'MONTAGEM' },
          include: { locations: true },
        }),
      ]);

      if (!leftItem || !rightItem) {
        throw new Error('Um ou ambos os itens de estoque não foram encontrados.');
      }

      if (leftItem.footSide !== 'E' || rightItem.footSide !== 'D') {
        throw new Error('Os itens selecionados devem ser compostos por 1 Pé Esquerdo (E) e 1 Pé Direito (D).');
      }

      if (leftItem.sku !== rightItem.sku || leftItem.sizeGrade !== rightItem.sizeGrade) {
        throw new Error('Os pés devem possuir o mesmo SKU e mesma Grade de numeração.');
      }

      if (leftItem.quantity < quantity || rightItem.quantity < quantity) {
        throw new Error(`Saldo insuficiente para efetuar o casamento de ${quantity} par(es).`);
      }

      // 2. Debitar saldo do Pé Esquerdo
      const newLeftQty = leftItem.quantity - quantity;
      await tx.stockItem.update({
        where: { id: leftItem.id },
        data: { quantity: newLeftQty },
      });

      // Atualizar localização do Pé Esquerdo
      if (leftItem.locations.length > 0) {
        const leftLoc = leftItem.locations[0];
        const newLeftLocQty = Math.max(0, (leftLoc.quantity || 0) - quantity);
        await tx.stockItemLocation.update({
          where: {
            stockItemId_locationId: {
              stockItemId: leftItem.id,
              locationId: leftLoc.locationId,
            },
          },
          data: { quantity: newLeftLocQty },
        });
      }

      // 3. Debitar saldo do Pé Direito
      const newRightQty = rightItem.quantity - quantity;
      await tx.stockItem.update({
        where: { id: rightItem.id },
        data: { quantity: newRightQty },
      });

      // Atualizar localização do Pé Direito
      if (rightItem.locations.length > 0) {
        const rightLoc = rightItem.locations[0];
        const newRightLocQty = Math.max(0, (rightLoc.quantity || 0) - quantity);
        await tx.stockItemLocation.update({
          where: {
            stockItemId_locationId: {
              stockItemId: rightItem.id,
              locationId: rightLoc.locationId,
            },
          },
          data: { quantity: newRightLocQty },
        });
      }

      // 4. Auditoria atômica: Registrar saída do Pé Esquerdo
      await tx.stockMovement.create({
        data: {
          factoryUnitId,
          stockItemId: leftItem.id,
          sector: 'MONTAGEM',
          type: 'CASAMENTO_PAR',
          quantity,
          sourceLocationId: leftItem.locations[0]?.locationId || null,
          origem: 'Casamento de Pares na Montagem',
          reason: `Casamento de Par - Pé E casado com Pé D (ID ${rightItem.id}). Obs: ${reason}`,
          operatorId: operatorId || null,
          operatorName: operatorName || 'Operador Montagem',
        },
      });

      // 5. Auditoria atômica: Registrar saída do Pé Direito
      await tx.stockMovement.create({
        data: {
          factoryUnitId,
          stockItemId: rightItem.id,
          sector: 'MONTAGEM',
          type: 'CASAMENTO_PAR',
          quantity,
          sourceLocationId: rightItem.locations[0]?.locationId || null,
          origem: 'Casamento de Pares na Montagem',
          reason: `Casamento de Par - Pé D casado com Pé E (ID ${leftItem.id}). Obs: ${reason}`,
          operatorId: operatorId || null,
          operatorName: operatorName || 'Operador Montagem',
        },
      });

      return {
        success: true,
        matchedPairs: quantity,
        sku: leftItem.sku,
        sizeGrade: leftItem.sizeGrade,
        remainingLeftQuantity: newLeftQty,
        remainingRightQuantity: newRightQty,
      };
    });
  }
}
