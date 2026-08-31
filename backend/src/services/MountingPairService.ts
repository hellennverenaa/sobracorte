import { prisma } from '../prisma';
import { ExecuteMatchDTO, OperatorContext } from '../types/stock.dto';
import { SectorType } from '../generated/prisma';

export interface MatchingPairRawResult {
  sku: string;
  sizeGrade: string;
  color?: string | null;
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
    sector: SectorType = 'MONTAGEM'
  ): Promise<MatchingPairRawResult[]> {
    const rawPairs = await prisma.$queryRaw<MatchingPairRawResult[]>`
      SELECT 
        COALESCE(e."sku", e."productName", '-') AS "sku",
        e."sizeGrade",
        e."color",
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
        ON e."factoryUnitId" = d."factoryUnitId"
        AND e.sector = d.sector
        AND COALESCE(e."sku", e."productName", '') = COALESCE(d."sku", d."productName", '')
        AND e."sizeGrade" = d."sizeGrade"
        AND COALESCE(e."color", '') = COALESCE(d."color", '')
      WHERE e."factoryUnitId" = ${factoryUnitId}
        AND e.sector = ${sector}::sobra_corte."SectorType"
        AND d.sector = ${sector}::sobra_corte."SectorType"
        AND e."footSide" = 'E'
        AND d."footSide" = 'D'
        AND e.quantity > 0
        AND d.quantity > 0
      ORDER BY "formablePairs" DESC, "sku" ASC;
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
   * Executa a baixa atômica de casamento de par validado pelo operador em qualquer setor suportado
   */
  async executeMatch(dto: ExecuteMatchDTO, context: OperatorContext) {
    const { factoryUnitId, operatorId, operatorName } = context;
    const { leftStockItemId, rightStockItemId, quantity, reason } = dto;

    return await prisma.$transaction(async (tx) => {
      // 1. Buscar os dois itens com validação de tenant
      const [leftItem, rightItem] = await Promise.all([
        tx.stockItem.findFirst({
          where: { id: leftStockItemId, factoryUnitId },
          include: { locations: true },
        }),
        tx.stockItem.findFirst({
          where: { id: rightStockItemId, factoryUnitId },
          include: { locations: true },
        }),
      ]);

      if (!leftItem || !rightItem) {
        throw new Error('Um ou ambos os itens de estoque não foram encontrados.');
      }

      if (leftItem.sector !== rightItem.sector) {
        throw new Error('Os itens selecionados devem pertencer ao mesmo setor fabril.');
      }

      if (leftItem.footSide !== 'E' || rightItem.footSide !== 'D') {
        throw new Error('Os itens selecionados devem ser compostos por 1 Pé Esquerdo (E) e 1 Pé Direito (D).');
      }

      const leftSku = leftItem.sku || leftItem.productName || '';
      const rightSku = rightItem.sku || rightItem.productName || '';

      if (leftSku !== rightSku || leftItem.sizeGrade !== rightItem.sizeGrade) {
        throw new Error('Os itens devem possuir o mesmo COD. PRODUTO / SKU e mesma Grade de numeração.');
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

      const sectorLabel =
        leftItem.sector === 'PRE_FABRICADO'
          ? 'Pré-Fabricado (Solas)'
          : leftItem.sector === 'EXPEDICAO'
          ? 'Cabedais'
          : 'Montagem';

      // 4. Auditoria atômica: Registrar saída do Pé Esquerdo
      await tx.stockMovement.create({
        data: {
          factoryUnitId,
          stockItemId: leftItem.id,
          sector: leftItem.sector,
          type: 'CASAMENTO_PAR',
          quantity,
          sourceLocationId: leftItem.locations[0]?.locationId || null,
          origem: `Casamento de Pares no setor ${sectorLabel}`,
          reason: `Casamento de Par - Pé E casado com Pé D (ID ${rightItem.id}). Obs: ${reason}`,
          operatorId: operatorId || null,
          operatorName: operatorName || `Operador ${sectorLabel}`,
        },
      });

      // 5. Auditoria atômica: Registrar saída do Pé Direito
      await tx.stockMovement.create({
        data: {
          factoryUnitId,
          stockItemId: rightItem.id,
          sector: rightItem.sector,
          type: 'CASAMENTO_PAR',
          quantity,
          sourceLocationId: rightItem.locations[0]?.locationId || null,
          origem: `Casamento de Pares no setor ${sectorLabel}`,
          reason: `Casamento de Par - Pé D casado com Pé E (ID ${leftItem.id}). Obs: ${reason}`,
          operatorId: operatorId || null,
          operatorName: operatorName || `Operador ${sectorLabel}`,
        },
      });

      return {
        success: true,
        matchedPairs: quantity,
        sector: leftItem.sector,
        sku: leftSku,
        sizeGrade: leftItem.sizeGrade,
        remainingLeftQuantity: newLeftQty,
        remainingRightQuantity: newRightQty,
      };
    });
  }
}
