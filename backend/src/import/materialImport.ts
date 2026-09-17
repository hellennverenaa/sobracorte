import { StockAccessContext, assertStockSectorAccess, assertGeneralStockAccess } from '../auth/stockAccess';
import { movementSnapshot } from '../services/movementSnapshot';
import { SectorType, ComponentType, FootSide } from '../generated/prisma';
import { ParsedCsvRow } from './csvParser';
import { normalizeUnit, isDiscreteUnit } from '../utils/unitHelper';
import { assertStockLocationSector, lockStockIdentityWrites, normalizeStockColor, rejectDuplicateStockItem } from '../services/stockIdentity';
import { normalizeSector as normalizeSectorAlias } from '../utils/sectorHelper';

export interface AvailableLocation {
  id: number;
  name: string;
  sector: SectorType | null;
}

export interface ImportRowError {
  row: number;
  column: string;
  value: string;
  message: string;
}

export class ImportValidationError extends Error {
  public readonly errors: ImportRowError[];

  constructor(message: string, errors: ImportRowError[]) {
    super(message);
    this.name = 'ImportValidationError';
    this.errors = errors;
  }
}

export interface ValidatedImportItem {
  rowNumber: number;
  sector: SectorType;
  code: string;
  name: string;
  unit: string;
  type: string;
  quantity: number;
  locationId: number;
  locationName: string;
  color?: string;
  sizeGrade?: string;
  footSide?: 'E' | 'D' | null;
  observation?: string;
  productName?: string;
}

export interface ImportExecutionContext extends StockAccessContext {
  factoryUnitId: number;
  operatorId?: string | null;
  operatorName?: string | null;
}

export interface ImportExecutionResult {
  inserted: number;
  processed: number;
  ignored: number;
  locationsCreated: number;
  movementsCreated: number;
}

const UNIDADES_VALIDAS = new Set(['M2', 'M', 'UN', 'KG', 'PAR', 'CX', 'RL', 'G', 'UND', 'M²', 'CM', 'L', 'ROLO']);

export function normalizeSector(rawSector?: string, defaultSector: string = 'CORTE'): SectorType {
  const sec = normalizeSectorAlias(rawSector || defaultSector);
  if (sec === 'DISTRIBUICAO') return 'DISTRIBUICAO';
  if (sec === 'PRE_FABRICADO' || sec === 'PRE-FABRICADO' || sec === 'PREFABRICADO' || sec === 'SOLAS' || sec === 'SOLA') return 'PRE_FABRICADO';
  if (sec === 'MONTAGEM' || sec === 'PES_ORFAOS' || sec === 'PES_PRONTOS') return 'MONTAGEM';
  if (sec === 'APOIO' || sec === 'MOLDES' || sec === 'MOLDE' || sec === 'PECAS_CORTADAS') return 'APOIO';
  if (sec === 'CONSUMO' || sec === 'INSUMOS' || sec === 'QUIMICOS') return 'CONSUMO';
  return 'CORTE';
}

export function normalizeFootSide(rawSide?: string): 'E' | 'D' | 'PAR' | null {
  if (!rawSide) return null;
  const side = rawSide.toUpperCase().trim();
  if (side === 'E' || side === 'ESQ' || side === 'ESQUERDO') return 'E';
  if (side === 'D' || side === 'DIR' || side === 'DIREITO') return 'D';
  if (side === 'PAR' || side === 'PARES' || side === 'AMBOS') return 'PAR';
  return null;
}

export function matchLocationSector(locSector: SectorType | null, itemSector: SectorType): boolean {
  if (locSector === null) return true; // Localização geral compartilhada
  return normalizeSectorAlias(locSector) === normalizeSectorAlias(itemSector);
}

/**
 * Converte string de quantidade para número float.
 * Trata vírgula e ponto decimal, e formatos com separador de milhar.
 */
export function parseQuantity(raw?: string): { valid: boolean; value: number } {
  if (!raw || raw.trim() === '') {
    return { valid: true, value: 0 };
  }

  const clean = raw.trim();
  let normalized = clean;

  if (clean.includes(',') && clean.includes('.')) {
    if (clean.indexOf('.') < clean.indexOf(',')) {
      // Formato brasileiro: 1.234,56 -> 1234.56
      normalized = clean.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato americano: 1,234.56 -> 1234.56
      normalized = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    // Apenas vírgula: 12,5 -> 12.5
    normalized = clean.replace(',', '.');
  }

  const num = Number(normalized);
  if (isNaN(num) || !isFinite(num) || num < 0) {
    return { valid: false, value: 0 };
  }

  return { valid: true, value: num };
}

/**
 * Valida o lote completo de linhas do CSV em memória (Pre-flight).
 * Valida obrigatoriamente a existência prévia das prateleiras para o setor correspondente.
 * Se encontrar erros em qualquer linha, lança ImportValidationError com todos os erros agregados.
 */
export function validateImportBatch(
  headers: string[],
  rows: ParsedCsvRow[],
  defaultSector: string = 'CORTE',
  availableLocations: AvailableLocation[] = []
): ValidatedImportItem[] {
  if (rows.length === 0) {
    throw new ImportValidationError('O arquivo CSV está vazio ou contém apenas o cabeçalho.', [
      { row: 1, column: 'arquivo', value: '', message: 'Nenhum registro encontrado para importação.' },
    ]);
  }

  const headerCols = headers.map(c => c.toLowerCase().trim());
  const modelIdx = headerCols.findIndex(c => ['modelo', 'productname', 'nome_modelo', 'nomemodelo'].includes(c));

  const sectorIdx = headerCols.findIndex(c => c === 'setor' || c === 'sector' || c === 'área' || c === 'area');
  const codeIdx = headerCols.findIndex(c => c === 'codigo' || c === 'código' || c === 'code' || c === 'sku' || c === 'id_produto' || c === 'produto' || c === 'cod_peca' || c === 'codigo_material');
  const descriptionIdx = headerCols.findIndex(c => c === 'descricao' || c === 'descrição' || c === 'name' || c === 'nome' || c === 'material' || c === 'peca' || c === 'peça' || c === 'description');
  const descIdx = descriptionIdx === -1 ? modelIdx : descriptionIdx;
  const catIdx = headerCols.findIndex(c => c === 'categoria' || c === 'type' || c === 'tipo' || c === 'componenttype');
  const unitIdx = headerCols.findIndex(c => c === 'unidade' || c === 'unit' || c === 'um' || c === 'sigla');
  const qtdIdx = headerCols.findIndex(c => c === 'quantidade' || c === 'quantity' || c === 'estoque' || c === 'saldo' || c === 'qtd' || c === 'saldo_consumo');
  const locIdx = headerCols.findIndex(c => c === 'prateleira' || c === 'localizacao' || c === 'localização' || c === 'location' || c === 'box' || c === 'estante' || c === 'endereco');
  const colorIdx = headerCols.findIndex(c => c === 'cor' || c === 'color' || c === 'materialcor' || c === 'material_cor');
  const sizeIdx = headerCols.findIndex(c => c === 'grade' || c === 'tamanho' || c === 'sizegrade' || c === 'num' || c === 'numeracao' || c === 'numeração');
  const sideIdx = headerCols.findIndex(c => c === 'lado' || c === 'footside' || c === 'lado_pe' || c === 'pe');
  const obsIdx = headerCols.findIndex(c => c === 'observacao' || c === 'observação' || c === 'obs' || c === 'observation' || c === 'nota');

  // Suporte a CSV legado de materiais de corte dublados (35+ colunas)
  if (codeIdx === -1 && descIdx === -1 && headerCols.length >= 35) {
    const nDescCols = headerCols.length >= 40 ? 4 : 3;
    const validatedItems: ValidatedImportItem[] = [];
    const errors: ImportRowError[] = [];

    // Localização padrão de corte
    const defaultCorteLoc = availableLocations.find(l => l.name.toUpperCase() === 'GERAL' && matchLocationSector(l.sector, 'CORTE'))
      || availableLocations.find(l => matchLocationSector(l.sector, 'CORTE'));

    if (!defaultCorteLoc) {
      throw new ImportValidationError('Não há nenhuma localização cadastrada para o setor CORTE. Cadastre uma localização antes de importar.', [
        { row: 1, column: 'prateleira', value: '', message: 'Nenhuma localização cadastrada no sistema para o setor CORTE.' }
      ]);
    }

    for (const row of rows) {
      const codigo = row.cells[5]?.trim().toUpperCase() ?? '';
      if (!codigo || !/^\d+$/.test(codigo)) {
        continue;
      }

      const frags = row.cells.slice(6, 6 + nDescCols).map(s => s.trim());
      const descricao = frags.join(',').replace(/,$/, '').trim().toUpperCase();

      if (!descricao) {
        errors.push({
          row: row.rowNumber,
          column: 'descricao',
          value: '',
          message: 'Descrição do material não pode ser vazia.',
        });
        continue;
      }

      let unit = 'M2';
      for (let j = row.cells.length - 1; j > 5; j--) {
        const val = row.cells[j]?.trim().toUpperCase() ?? '';
        if (UNIDADES_VALIDAS.has(val)) {
          unit = val;
          break;
        }
      }

      const descUpper = descricao.toUpperCase();
      let type = 'SINTETICO';
      if (descUpper.startsWith('TECIDO')) type = 'TECIDO';
      else if (descUpper.startsWith('FORRO')) type = 'FORRO';
      else if (descUpper.startsWith('COURO')) type = 'COURO';
      else if (descUpper.startsWith('FILME')) type = 'FILME';
      else if (descUpper.startsWith('EVA')) type = 'EVA';
      else if (descUpper.startsWith('ESPUMA')) type = 'ESPUMA';

      validatedItems.push({
        rowNumber: row.rowNumber,
        sector: 'CORTE',
        code: codigo,
        name: descricao,
        unit,
        type,
        quantity: 0,
        locationId: defaultCorteLoc.id,
        locationName: defaultCorteLoc.name,
        observation: 'Importação legado de materiais de corte',
      });
    }

    if (errors.length > 0) {
      throw new ImportValidationError('Erros de validação encontrados no arquivo CSV.', errors);
    }

    if (validatedItems.length === 0) {
      throw new ImportValidationError('Nenhum item válido encontrado no arquivo CSV legado.', [
        { row: 1, column: 'codigo', value: '', message: 'Nenhum código numérico válido identificado.' }
      ]);
    }

    return validatedItems;
  }

  if (codeIdx === -1 || descIdx === -1) {
    throw new ImportValidationError(
      "Formato de cabeçalho não reconhecido. As colunas obrigatórias 'codigo' e 'descricao' não foram encontradas.",
      [
        ...(codeIdx === -1 ? [{ row: 1, column: 'codigo', value: '', message: "Coluna de código ('codigo', 'sku') obrigatória no cabeçalho." }] : []),
        ...(descIdx === -1 ? [{ row: 1, column: 'descricao', value: '', message: "Coluna de descrição ('descricao', 'nome', 'modelo') obrigatória no cabeçalho." }] : []),
      ]
    );
  }

  const validatedItems: ValidatedImportItem[] = [];
  const errors: ImportRowError[] = [];

  for (const row of rows) {
    const rawCode = row.cells[codeIdx] ?? '';
    const rawDesc = row.cells[descIdx] ?? '';
    const rawSector = sectorIdx !== -1 ? row.cells[sectorIdx] : undefined;
    const rawUnit = unitIdx !== -1 ? row.cells[unitIdx] : undefined;
    const rawType = catIdx !== -1 ? row.cells[catIdx] : undefined;
    const rawQtd = qtdIdx !== -1 ? row.cells[qtdIdx] : undefined;
    const rawLoc = locIdx !== -1 ? row.cells[locIdx] : undefined;
    const rawColor = colorIdx !== -1 ? row.cells[colorIdx] : undefined;
    const rawSize = sizeIdx !== -1 ? row.cells[sizeIdx] : undefined;
    const rawSide = sideIdx !== -1 ? row.cells[sideIdx] : undefined;
    const rawObs = obsIdx !== -1 ? row.cells[obsIdx] : undefined;

    const codigo = rawCode.trim().toUpperCase();
    const descricao = rawDesc.trim().toUpperCase();

    // 1. Linha vazia ou sem código/descrição
    if (!codigo) {
      errors.push({
        row: row.rowNumber,
        column: 'codigo',
        value: rawCode,
        message: 'O código/SKU do item é obrigatório e não pode ser vazio.',
      });
    }

    if (!descricao) {
      errors.push({
        row: row.rowNumber,
        column: 'descricao',
        value: rawDesc,
        message: 'A descrição/nome do item é obrigatória e não pode ser vazia.',
      });
    }

    const itemSector = normalizeSector(rawSector, defaultSector);

    // 2. Validação e normalização de quantidade
    const parsedQtd = parseQuantity(rawQtd);
    if (!parsedQtd.valid) {
      errors.push({
        row: row.rowNumber,
        column: 'quantidade',
        value: rawQtd || '',
        message: 'A quantidade deve ser um número válido maior ou igual a zero.',
      });
    }

    // 3. Validação de casas decimais para setores discretos
    const isDiscreteSector = ['APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'].includes(itemSector);
    const isDiscreteMaterial = ['CORTE', 'CONSUMO'].includes(itemSector) && isDiscreteUnit(normalizeUnit(rawUnit, itemSector));
    if ((isDiscreteSector || isDiscreteMaterial) && parsedQtd.valid && !Number.isInteger(parsedQtd.value)) {
      errors.push({
        row: row.rowNumber,
        column: 'quantidade',
        value: rawQtd || '',
        message: `O setor ${itemSector} opera apenas com unidades inteiras (peças/pares). Valores fracionados não são permitidos.`,
      });
    }

    // 4. Validação do lado do pé para Montagem quando fornecido
    const parsedSide = normalizeFootSide(rawSide);
    if (rawSide && rawSide.trim() !== '' && !parsedSide) {
      errors.push({
        row: row.rowNumber,
        column: 'lado',
        value: rawSide,
        message: "Lado do pé inválido. Utilize 'E' (Esquerdo), 'D' (Direito) ou 'PAR'.",
      });
    }

    // 5. Exigência de grade para Montagem
    if (itemSector === 'MONTAGEM' && (!rawSize || rawSize.trim() === '')) {
      errors.push({
        row: row.rowNumber,
        column: 'grade',
        value: rawSize || '',
        message: 'A numeração/grade é obrigatória para itens do setor Montagem.',
      });
    }

    // 6. VALIDAÇÃO RIGOROSA DE PRATELEIRA / LOCALIZAÇÃO PRÉ-CADASTRADA (MULTI-SETOR)
    let locationId = 0;
    let locationName = '';

    if (rawLoc && rawLoc.trim() !== '') {
      const normLocName = rawLoc.trim().toUpperCase();
      const matchedLoc = availableLocations.find(l => l.name.toUpperCase() === normLocName);

      if (!matchedLoc) {
        errors.push({
          row: row.rowNumber,
          column: 'prateleira',
          value: rawLoc,
          message: `A prateleira '${rawLoc}' não está cadastrada no sistema. Cadastre-a previamente em Configurações > Localizações para o setor ${itemSector} ou corrija a planilha.`,
        });
      } else if (!matchLocationSector(matchedLoc.sector, itemSector)) {
        errors.push({
          row: row.rowNumber,
          column: 'prateleira',
          value: rawLoc,
          message: `A prateleira '${rawLoc}' pertence ao setor ${matchedLoc.sector}, não sendo permitida para itens do setor ${itemSector}.`,
        });
      } else {
        locationId = matchedLoc.id;
        locationName = matchedLoc.name;
      }
    } else {
      // Prateleira não informada na linha: tenta encontrar localização padrão do setor
      const defaultLoc = availableLocations.find(l => l.name.toUpperCase() === 'GERAL' && matchLocationSector(l.sector, itemSector))
        || availableLocations.find(l => matchLocationSector(l.sector, itemSector));

      if (defaultLoc) {
        locationId = defaultLoc.id;
        locationName = defaultLoc.name;
      } else {
        errors.push({
          row: row.rowNumber,
          column: 'prateleira',
          value: '',
          message: `A prateleira não foi informada e não há nenhuma localização cadastrada para o setor ${itemSector}. Cadastre uma localização previamente em Configurações > Localizações.`,
        });
      }
    }

    let unit = normalizeUnit(rawUnit, itemSector);

    const type = rawType ? rawType.trim().toUpperCase() : (itemSector === 'CORTE' ? 'GERAL' : itemSector);
    const color = rawColor && rawColor.trim() !== '' ? rawColor.trim().toUpperCase() : undefined;
    const sizeGrade = rawSize && rawSize.trim() !== '' ? rawSize.trim().toUpperCase() : undefined;
    const observation = rawObs && rawObs.trim() !== '' ? rawObs.trim() : undefined;

    // Desmembramento de PAR em E + D para calçados
    if (parsedSide === 'PAR' && (itemSector === 'MONTAGEM' || itemSector === 'DISTRIBUICAO' || itemSector === 'PRE_FABRICADO')) {
      validatedItems.push({
        rowNumber: row.rowNumber,
        sector: itemSector,
        code: codigo,
        name: descricao,
        unit,
        type,
        quantity: parsedQtd.value,
        locationId,
        locationName,
        color,
        sizeGrade,
        footSide: 'E',
        productName: modelIdx === -1 ? undefined : row.cells[modelIdx]?.trim().toUpperCase(),
        observation: observation ? `${observation} (Pé Esquerdo)` : 'Importado via planilha (Pé Esquerdo)',
      });
      validatedItems.push({
        rowNumber: row.rowNumber,
        sector: itemSector,
        code: codigo,
        name: descricao,
        unit,
        type,
        quantity: parsedQtd.value,
        locationId,
        locationName,
        color,
        sizeGrade,
        footSide: 'D',
        productName: modelIdx === -1 ? undefined : row.cells[modelIdx]?.trim().toUpperCase(),
        observation: observation ? `${observation} (Pé Direito)` : 'Importado via planilha (Pé Direito)',
      });
    } else {
      validatedItems.push({
        rowNumber: row.rowNumber,
        sector: itemSector,
        code: codigo,
        name: descricao,
        unit,
        type,
        quantity: parsedQtd.value,
        locationId,
        locationName,
        color,
        sizeGrade,
        footSide: parsedSide === 'E' || parsedSide === 'D' ? parsedSide : null,
        productName: modelIdx === -1 ? undefined : row.cells[modelIdx]?.trim().toUpperCase(),
        observation,
      });
    }
  }

  if (errors.length > 0) {
    throw new ImportValidationError('Foram encontrados erros de validação na planilha. Nenhum registro foi importado.', errors);
  }

  return validatedItems;
}

/**
 * Executa a transação atômica ACID de importação no banco de dados.
 * Amarra com as prateleiras existentes validadas e gera as movimentações iniciais de implantação.
 * NUNCA cria novas prateleiras on-the-fly.
 */
export async function executeImportTransaction(
  prisma: any,
  items: ValidatedImportItem[],
  context: ImportExecutionContext
): Promise<ImportExecutionResult> {
  const { factoryUnitId, operatorId, operatorName } = context;

  return await prisma.$transaction(async (tx: any) => {
    await lockStockIdentityWrites(tx, factoryUnitId);
    for (const item of items) {
      const location = await tx.location.findFirst({ where: { id: item.locationId, factoryUnitId } });
      if (!location) throw new Error('A localização não foi encontrada nesta unidade fabril.');
      assertStockSectorAccess(context, item.sector);
      assertStockLocationSector(location, item.sector);
      assertGeneralStockAccess(context, location);
    }
    let insertedCount = 0;
    let movementsCreatedCount = 0;

    // 1. Processar itens de CORTE no modelo canônico.
    const corteItems = items.filter(i => i.sector === 'CORTE');
    for (const item of corteItems) {
      await rejectDuplicateStockItem(tx, factoryUnitId, item);
      const materialRecord = await tx.stockItem.create({
        data: {
          factoryUnitId,
          sector: 'CORTE',
          componentType: 'MATERIA_PRIMA',
          code: item.code,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          type: item.type,
          observation: item.observation || 'Importado via planilha de materiais CSV',
        },
      });
      insertedCount++;

      await tx.stockItemLocation.upsert({
        where: {
          stockItemId_locationId_factoryUnitId: {
            stockItemId: materialRecord.id,
            locationId: item.locationId,
            factoryUnitId,
          },
        },
        update: {
          quantity: { increment: item.quantity },
        },
        create: {
          stockItemId: materialRecord.id,
          locationId: item.locationId,
          factoryUnitId,
          quantity: item.quantity,
        },
      });

      // Se quantidade > 0, registrar movimentação inicial de implantação com snapshots
      if (item.quantity > 0) {
        await tx.stockMovement.create({
          data: {
            factoryUnitId,
            stockItemId: materialRecord.id,
            sector: 'CORTE',
            type: 'ENTRADA',
            quantity: item.quantity,
            ...movementSnapshot(materialRecord),
              destinationStockItemId: materialRecord.id, destinationSector: materialRecord.sector,
            destinationLocationId: item.locationId,
            destinationLocationName: item.locationName,
            origem: 'Saldo Inicial / Implantação',
            reason: item.observation || 'Importação inicial via planilha CSV',
            operatorId: operatorId || null,
            operatorName: operatorName || 'Sistema / Importação',
          },
        });
        movementsCreatedCount++;
      }
    }

    // 2. Processar itens dos demais setores (tabela StockItem + StockItemLocation + StockMovement)
    const stockItems = items.filter(i => i.sector !== 'CORTE');
    for (const item of stockItems) {
      let pieceCode: string | null = null;
      let description: string | null = null;
      let productName: string | null = null;
      let sku: string | null = null;
      let name: string | null = null;
      let componentType: ComponentType | null = null;

      switch (item.sector) {
        case 'APOIO':
          componentType = 'PECA_CORTADA';
          pieceCode = item.code;
          description = item.name;
          productName = item.productName || null;
          break;
        case 'PRE_FABRICADO':
          componentType = 'SOLADO';
          productName = item.productName || item.name;
          sku = item.code;
          break;
        case 'DISTRIBUICAO':
        case 'EXPEDICAO':
          componentType = 'CABEDAL';
          sku = item.code;
          productName = item.productName || item.name;
          break;
        case 'MONTAGEM':
          componentType = 'PE_PRONTO';
          sku = item.code;
          productName = item.productName || item.name;
          break;
        default: // CONSUMO
          name = item.name;
          sku = item.code;
          break;
      }

      const data = {
          factoryUnitId,
          sector: item.sector,
          componentType,
          quantity: item.quantity,
          unit: item.unit,
          type: item.type,
          code: item.code,
          name: name || item.name,
          pieceCode,
          description: description || item.name,
          productName: item.sector === 'APOIO' ? productName : productName || item.name,
          sku: sku || item.code,
          color: normalizeStockColor(item.color) || null,
          materialColor: item.sector === 'APOIO' ? item.color || 'PADRAO' : null,
          sizeGrade: item.sizeGrade || null,
          footSide: item.footSide as FootSide || null,
          observation: item.observation || 'Importado via planilha de componentes CSV',
      };
      await rejectDuplicateStockItem(tx, factoryUnitId, data);
      const stockItem = await tx.stockItem.create({ data });
      insertedCount++;

      // Amarração com a prateleira física existente
      await tx.stockItemLocation.create({
        data: {
          stockItemId: stockItem.id,
          locationId: item.locationId,
          factoryUnitId,
          quantity: item.quantity,
        },
      });

      // Se quantidade > 0, registrar movimentação inicial de implantação
      if (item.quantity > 0) {
        await tx.stockMovement.create({
          data: {
            factoryUnitId,
            stockItemId: stockItem.id,
            sector: item.sector,
            type: 'ENTRADA',
            quantity: item.quantity,
            destinationLocationId: item.locationId,
            destinationLocationName: item.locationName,
            ...movementSnapshot(stockItem),
              destinationStockItemId: stockItem.id, destinationSector: stockItem.sector,
            origem: 'Saldo Inicial / Implantação',
            reason: item.observation || 'Importação inicial via planilha CSV',
            operatorId: operatorId || null,
            operatorName: operatorName || 'Sistema / Importação',
          },
        });
        movementsCreatedCount++;
      }
    }

    return {
      inserted: insertedCount,
      processed: items.length,
      ignored: 0,
      locationsCreated: 0,
      movementsCreated: movementsCreatedCount,
    };
  });
}
