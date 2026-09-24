import { StockAccessContext, assertStockSectorAccess, assertGeneralStockAccess } from '../auth/stockAccess';
import { movementSnapshot } from '../services/movementSnapshot';
import { SectorType, ComponentType, FootSide } from '../generated/prisma';
import { ParsedCsvRow } from './csvParser';
import { normalizeUnit, isDiscreteUnit, validateQuantity, validateQuantityPrecision, UnitValidationError } from '../utils/unitHelper';
import { assertStockLocationSector, lockStockIdentityWrites, normalizeStockColor, rejectDuplicateStockItem, stockIdentity } from '../services/stockIdentity';
import { requireActiveStockSector, SectorValidationError } from '../utils/sectorHelper';

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
  locationDefaulted?: boolean;
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
  return requireActiveStockSector(rawSector || defaultSector) as SectorType;
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
  return requireActiveStockSector(locSector) === requireActiveStockSector(itemSector);
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

  try { validateQuantityPrecision(normalized); }
  catch { return { valid: false, value: 0 }; }
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
  const locationsByName = new Map(availableLocations.map(location => [location.name.toUpperCase(), location]));
  const defaultLocation = (sector: SectorType) => availableLocations.find(location => location.name.toUpperCase() === 'GERAL' && matchLocationSector(location.sector, sector))
    || availableLocations.find(location => matchLocationSector(location.sector, sector));
  const modelIdx = headerCols.findIndex(c => ['modelo', 'productname', 'nome_modelo', 'nomemodelo'].includes(c));

  const sectorIdx = headerCols.findIndex(c => c === 'setor' || c === 'sector' || c === 'área' || c === 'area');
  const codeIdx = headerCols.findIndex(c => c === 'codigo' || c === 'código' || c === 'code' || c === 'sku' || c === 'id_produto' || c === 'produto' || c === 'cod_peca' || c === 'codigo_material');
  const descriptionIdx = headerCols.findIndex(c => c === 'descricao' || c === 'descrição' || c === 'name' || c === 'nome' || c === 'material' || c === 'peca' || c === 'peça' || c === 'description');
  const descIdx = descriptionIdx === -1 ? modelIdx : descriptionIdx;
  const catIdx = headerCols.findIndex(c => c === 'categoria' || c === 'type' || c === 'tipo' || c === 'componenttype');
  const unitIdx = headerCols.findIndex(c => c === 'unidade' || c === 'unit' || c === 'um' || c === 'sigla');
  const qtdIdx = headerCols.findIndex(c => c === 'quantidade' || c === 'quantity' || c === 'estoque' || c === 'saldo' || c === 'qtd');
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
    const defaultCorteLoc = defaultLocation('CORTE');

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
        unit: normalizeUnit(unit),
        type,
        quantity: 0,
        locationId: defaultCorteLoc.id,
        locationName: defaultCorteLoc.name,
        locationDefaulted: true,
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

    let itemSector: SectorType;
    try {
      itemSector = normalizeSector(rawSector, defaultSector);
    } catch (error) {
      if (error instanceof SectorValidationError) {
        errors.push({ row: row.rowNumber, column: 'setor', value: rawSector || defaultSector, message: error.message });
        continue;
      }
      throw error;
    }

    // 2. Validação e normalização de quantidade
    const parsedQtd = parseQuantity(rawQtd);
    if (!parsedQtd.valid) {
      errors.push({
        row: row.rowNumber,
        column: 'quantidade',
        value: rawQtd || '',
        message: 'A quantidade deve ser um número válido maior ou igual a zero, com até três casas decimais.',
      });
    }

    // 3. Validação de casas decimais para setores discretos
    const isDiscreteSector = ['APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'].includes(itemSector);
    const isDiscreteMaterial = itemSector === 'CORTE' && isDiscreteUnit(normalizeUnit(rawUnit, itemSector));
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
      const matchedLoc = locationsByName.get(normLocName);

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
      const defaultLoc = defaultLocation(itemSector);

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
    try { validateQuantity(parsedQtd.value, unit, itemSector, true); }
    catch (error) { errors.push({ row: row.rowNumber, column: 'quantidade', value: String(parsedQtd.value), message: (error as Error).message }); continue; }

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
        locationDefaulted: !rawLoc?.trim(),
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
        locationDefaulted: !rawLoc?.trim(),
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
        locationDefaulted: !rawLoc?.trim(),
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

const IMPORT_QUERY_CHUNK = 400;

function importStockData(item: ValidatedImportItem, factoryUnitId: number) {
  const base = {
    factoryUnitId,
    sector: item.sector,
    quantity: item.quantity,
    unit: normalizeUnit(item.unit),
    type: item.type,
    observation: item.observation || (item.sector === 'CORTE' ? 'Importado via planilha de materiais CSV' : 'Importado via planilha de componentes CSV'),
  };
  if (item.sector === 'CORTE') return {
    ...base, componentType: 'MATERIA_PRIMA' as ComponentType,
    code: item.code, name: item.name,
  };
  const apoio = item.sector === 'APOIO';
  return {
    ...base,
    componentType: (apoio ? 'PECA_CORTADA' : item.sector === 'PRE_FABRICADO' ? 'SOLADO' : item.sector === 'MONTAGEM' ? 'PE_PRONTO' : 'CABEDAL') as ComponentType,
    // SKU e código da peça identificam componentes. `code` é único por unidade
    // e deve ficar reservado aos materiais de CORTE (inclusive para E + D).
    code: null,
    name: item.name,
    pieceCode: apoio ? item.code : null,
    description: apoio ? item.name : item.name,
    productName: apoio ? item.productName || null : item.productName || item.name,
    sku: apoio ? null : item.code,
    color: normalizeStockColor(item.color) || null,
    materialColor: apoio ? item.color || 'PADRAO' : null,
    sizeGrade: item.sizeGrade || null,
    footSide: item.footSide as FootSide || null,
  };
}

function importIdentityKey(data: Record<string, any>) {
  return JSON.stringify([normalizeSector(data.sector), stockIdentity(data)]);
}

export async function planImport(prisma: any, items: ValidatedImportItem[], factoryUnitId: number) {
  const existingByCode = new Map<string, any>();
  const existingByIdentity = new Map<string, any>();
  const codes = [...new Set(items.map(item => item.code))];
  for (let start = 0; start < codes.length; start += IMPORT_QUERY_CHUNK) {
    const batch = codes.slice(start, start + IMPORT_QUERY_CHUNK);
    const found = await prisma.stockItem.findMany({
      where: { factoryUnitId, OR: [
        { code: { in: batch } }, { sku: { in: batch } }, { pieceCode: { in: batch } },
      ] },
    });
    for (const existing of found) {
      if (existing.code) existingByCode.set(existing.code.toUpperCase(), existing);
      existingByIdentity.set(importIdentityKey(existing), existing);
    }
  }

  const seenIdentities = new Map<string, number>();
  const seenCorteCodes = new Map<string, number>();
  const toInsert: ValidatedImportItem[] = [];
  const errors: ImportRowError[] = [];
  let ignored = 0;
  for (const item of items) {
    const data = importStockData(item, factoryUnitId);
    const identity = importIdentityKey(data);
    const earlier = seenIdentities.get(identity) || (item.sector === 'CORTE' ? seenCorteCodes.get(item.code) : undefined);
    if (earlier) {
      errors.push({ row: item.rowNumber, column: 'codigo', value: item.code, message: `Item repetido no arquivo (primeira ocorrência na linha ${earlier}).` });
      continue;
    }
    seenIdentities.set(identity, item.rowNumber);
    if (item.sector === 'CORTE') seenCorteCodes.set(item.code, item.rowNumber);

    const existing = item.sector === 'CORTE' ? existingByCode.get(item.code) : existingByIdentity.get(identity);
    if (!existing) {
      toInsert.push(item);
      continue;
    }
    if (importIdentityKey(existing) === identity && normalizeUnit(existing.unit, item.sector) === data.unit) {
      ignored++;
      continue;
    }
    errors.push({
      row: item.rowNumber, column: 'codigo', value: item.code,
      message: item.sector === 'CORTE'
        ? `O código já existe no setor ${existing.sector} com descrição, categoria ou unidade diferente. Cadastro atual: ${existing.name || ''} / ${existing.type || ''} / ${existing.unit || ''}.`
        : 'O item já existe com a mesma identidade, mas outra unidade de medida.',
    });
  }
  return { toInsert, ignored, errors };
}

async function executeBulkImport(tx: any, items: ValidatedImportItem[], context: ImportExecutionContext): Promise<ImportExecutionResult> {
  const { factoryUnitId, operatorId, operatorName } = context;
  const locations = await tx.location.findMany({ where: { factoryUnitId, id: { in: [...new Set(items.map(item => item.locationId))] } } });
  const locationsById = new Map<number, any>(locations.map((location: any) => [location.id, location]));
  const categories = await tx.categoryConfig.findMany({
    where: { factoryUnitId, name: { in: [...new Set(items.filter(item => item.sector === 'CORTE').map(item => item.type))] }, OR: [{ sector: 'CORTE' }, { sector: null }] },
  });
  const categoryByName = new Map<string, any>(categories.map((category: any) => [category.name, category]));
  for (const item of items) {
    assertStockSectorAccess(context, item.sector);
    validateQuantity(item.quantity, item.unit, item.sector, true);
    const location = locationsById.get(item.locationId);
    if (!location) throw new ImportValidationError('Localização não encontrada nesta unidade.', [{ row: item.rowNumber, column: 'prateleira', value: item.locationName, message: 'A localização foi removida. Atualize a página e valide novamente.' }]);
    assertStockLocationSector(location, item.sector);
    assertGeneralStockAccess(context, location);
    const category = item.sector === 'CORTE' ? categoryByName.get(item.type) : null;
    if (category?.unitLocked && normalizeUnit(item.unit) !== category.defaultUnitCode) throw new UnitValidationError('Unidade bloqueada pela categoria.');
  }

  const plan = await planImport(tx, items, factoryUnitId);
  if (plan.errors.length) throw new ImportValidationError('Conflitos encontrados no estoque. Nenhum item foi importado.', plan.errors);
  let movementsCreated = 0;
  for (let start = 0; start < plan.toInsert.length; start += 200) {
    const batch = plan.toInsert.slice(start, start + 200);
    const inputByIdentity = new Map(batch.map(item => [importIdentityKey(importStockData(item, factoryUnitId)), item]));
    const created = await tx.stockItem.createManyAndReturn({ data: batch.map(item => importStockData(item, factoryUnitId)) });
    if (created.length !== batch.length) throw new Error('A gravação do lote retornou uma quantidade inesperada de itens.');
    const links = [];
    const movements = [];
    for (const record of created) {
      const item = inputByIdentity.get(importIdentityKey(record));
      if (!item) throw new Error('Não foi possível relacionar um item criado à linha do CSV.');
      links.push({ stockItemId: record.id, locationId: item.locationId, factoryUnitId, quantity: item.quantity });
      if (item.quantity > 0) movements.push({
        factoryUnitId, stockItemId: record.id, sector: record.sector, type: 'ENTRADA', quantity: item.quantity,
        ...movementSnapshot(record),
        destinationStockItemId: record.id, destinationSector: record.sector,
        destinationLocationId: item.locationId, destinationLocationName: item.locationName,
        origem: 'Saldo Inicial / Implantação', reason: item.observation || 'Importação inicial via planilha CSV',
        operatorId: operatorId || null, operatorName: operatorName || 'Sistema / Importação',
      });
    }
    await tx.stockItemLocation.createMany({ data: links });
    if (movements.length) await tx.stockMovement.createMany({ data: movements });
    movementsCreated += movements.length;
  }
  return { inserted: plan.toInsert.length, processed: items.length, ignored: plan.ignored, locationsCreated: 0, movementsCreated };
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
    if (items.length >= 100) return executeBulkImport(tx, items, context);
    for (const item of items) {
      validateQuantity(item.quantity, item.unit, item.sector, true);
      item.unit = normalizeUnit(item.unit);
      if (item.sector === 'CORTE') {
        const category = await tx.categoryConfig.findFirst({ where: { factoryUnitId, name: item.type, OR: [{ sector: 'CORTE' }, { sector: null }] } });
        if (category?.unitLocked && item.unit !== category.defaultUnitCode) throw new UnitValidationError('Unidade bloqueada pela categoria.');
      }
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
        case 'CORTE':
          name = item.name;
          sku = item.code;
          break;
        default:
          throw new SectorValidationError(item.sector);
      }

      const data = {
          factoryUnitId,
          sector: item.sector,
          componentType,
          quantity: item.quantity,
          unit: item.unit,
          type: item.type,
          code: null,
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
  }, items.length >= 100 ? { maxWait: 10_000, timeout: 120_000 } : undefined);
}
