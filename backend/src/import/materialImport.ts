import { StockAccessContext, assertStockSectorAccess, assertGeneralStockAccess } from '../auth/stockAccess';
import { assertStockLocationSubsector, assertStockSubsectorAccess, assertSubsectorCategoryAllowed } from '../auth/subsectorAccess';
import { movementSnapshot } from '../services/movementSnapshot';
import { Prisma, SectorType, FootSide } from '../generated/prisma';
import { ParsedCsvRow } from './csvParser';
import { normalizeUnit, validateQuantity, validateQuantityPrecision, UnitValidationError } from '../utils/unitHelper';
import { assertStockLocationCategory, assertStockLocationSector, lockStockIdentityWrites, normalizeStockColor, rejectDuplicateStockItem, stockIdentity } from '../services/stockIdentity';
import { validateCategoryEntry } from '../services/categoryRules';
import { requireActiveStockSector, SectorValidationError } from '../utils/sectorHelper';

export interface AvailableLocation {
  id: number;
  name: string;
  sector: SectorType | null;
  subsectorId?: number | null;
  categoryMode?: 'ALL' | 'SELECTED';
  categoryId?: number | null;
  categoryLinks?: Array<{ categoryId: number }>;
}

export interface AvailableImportSubsector {
  id: number;
  name: string;
  sector: SectorType;
  active: boolean;
  categoryMode: 'ALL' | 'SELECTED';
  categoryLinks?: Array<{ categoryConfigId: number }>;
}

export interface AvailableImportCategory {
  id?: number;
  name: string;
  sector: SectorType | null;
  sectors?: SectorType[];
  entryMode: 'QUANTITY' | 'SIDE_PAIR';
  unitLocked?: boolean;
  defaultUnitCode?: string | null;
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

export interface ImportItemLocationAllocation {
  locationId: number;
  locationName: string;
  quantity: number;
  rowNumber: number;
}

export interface ValidatedImportItem {
  rowNumber: number;
  sector: SectorType;
  subsectorId?: number | null;
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
  categoryId?: number | null;
  entryMode?: 'QUANTITY' | 'SIDE_PAIR';
  observation?: string;
  productName?: string;
  locations?: ImportItemLocationAllocation[];
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

function normalizeCategoryName(value: unknown) {
  return String(value ?? '').trim().toLocaleUpperCase('pt-BR').replace(/[\s-]+/g, '_');
}

function categoryAppliesToSector(category: AvailableImportCategory, sector: SectorType) {
  const scopes = category.sectors?.length ? category.sectors : category.sector ? [category.sector] : [];
  return scopes.length === 0 || scopes.some(scope => requireActiveStockSector(scope) === requireActiveStockSector(sector));
}

function categoryForImport(categories: AvailableImportCategory[], sector: SectorType, type: string) {
  const name = normalizeCategoryName(type);
  if (!name) return undefined;
  return categories.find(category => categoryAppliesToSector(category, sector) && normalizeCategoryName(category.name) === name);
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
  availableLocations: AvailableLocation[] = [],
  availableCategories: AvailableImportCategory[] = [],
  availableSubsectors: AvailableImportSubsector[] = [],
): ValidatedImportItem[] {
  if (rows.length === 0) {
    throw new ImportValidationError('O arquivo CSV está vazio ou contém apenas o cabeçalho.', [
      { row: 1, column: 'arquivo', value: '', message: 'Nenhum registro encontrado para importação.' },
    ]);
  }

  const headerCols = headers.map(c => c.toLowerCase().trim());
  const locationFor = (name: string, sector: SectorType, subsectorId: number | null) => availableLocations.find(location =>
    location.name.toUpperCase() === name && matchLocationSector(location.sector, sector)
    && Number(location.subsectorId || 0) === Number(subsectorId || 0));
  const defaultLocation = (sector: SectorType, subsectorId: number | null = null) => availableLocations.find(location =>
    location.name.toUpperCase() === 'GERAL' && matchLocationSector(location.sector, sector)
    && Number(location.subsectorId || 0) === Number(subsectorId || 0))
    || availableLocations.find(location => matchLocationSector(location.sector, sector)
      && Number(location.subsectorId || 0) === Number(subsectorId || 0));
  const modelIdx = headerCols.findIndex(c => ['modelo', 'productname', 'nome_modelo', 'nomemodelo'].includes(c));

  const sectorIdx = headerCols.findIndex(c => c === 'setor' || c === 'sector' || c === 'área' || c === 'area');
  const codeIdx = headerCols.findIndex(c => c === 'codigo' || c === 'código' || c === 'code' || c === 'sku' || c === 'id_produto' || c === 'produto' || c === 'cod_peca' || c === 'codigo_material');
  const descriptionIdx = headerCols.findIndex(c => c === 'descricao' || c === 'descrição' || c === 'name' || c === 'nome' || c === 'material' || c === 'peca' || c === 'peça' || c === 'description');
  const descIdx = descriptionIdx === -1 ? modelIdx : descriptionIdx;
  const catIdx = headerCols.findIndex(c => c === 'categoria' || c === 'type' || c === 'tipo' || c === 'componenttype');
  const unitIdx = headerCols.findIndex(c => c === 'unidade' || c === 'unit' || c === 'um' || c === 'sigla');
  const qtdIdx = headerCols.findIndex(c => c === 'quantidade' || c === 'quantity' || c === 'estoque' || c === 'saldo' || c === 'qtd');
  const locIdx = headerCols.findIndex(c => c === 'prateleira' || c === 'localizacao' || c === 'localização' || c === 'location' || c === 'box' || c === 'estante' || c === 'endereco');
  const colorIdx = headerCols.findIndex(c => c === 'cor' || c === 'color' || c === 'materialcor' || c === 'material_cor' || c === 'combinacao' || c === 'combinação' || c === 'combinacão');
  const sizeIdx = headerCols.findIndex(c => c === 'grade' || c === 'tamanho' || c === 'sizegrade' || c === 'num' || c === 'numeracao' || c === 'numeração');
  const sideIdx = headerCols.findIndex(c => c === 'lado' || c === 'footside' || c === 'lado_pe' || c === 'pe');
  const subsectorIdx = headerCols.findIndex(c => ['subsetor', 'subsector', 'sub-setor', 'sub_setor', 'sub setor', 'sub sector'].includes(c));
  const obsIdx = headerCols.findIndex(c => c === 'observacao' || c === 'observação' || c === 'obs' || c === 'observation' || c === 'nota');

  // Suporte a CSV legado de materiais de corte dublados (35+ colunas)
  if (codeIdx === -1 && descIdx === -1 && headerCols.length >= 35) {
    const nDescCols = headerCols.length >= 40 ? 4 : 3;
    const validatedItems: ValidatedImportItem[] = [];
    const errors: ImportRowError[] = [];

    for (const row of rows) {
      const rawSubsector = subsectorIdx === -1 ? '' : String(row.cells[subsectorIdx] || '').trim();
      let subsectorId: number | null = null;
      if (rawSubsector) {
        const requestedName = normalizeCategoryName(rawSubsector);
        const subsector = availableSubsectors.find(candidate => candidate.active
          && requireActiveStockSector(candidate.sector) === 'CORTE'
          && normalizeCategoryName(candidate.name) === requestedName);
        if (!subsector) {
          errors.push({ row: row.rowNumber, column: 'subsetor', value: rawSubsector, message: `O subsetor '${rawSubsector}' não está ativo para o setor CORTE.` });
          continue;
        }
        subsectorId = subsector.id;
      }
      const defaultCorteLoc = defaultLocation('CORTE', subsectorId);
      if (!defaultCorteLoc) {
        errors.push({ row: row.rowNumber, column: 'prateleira', value: '', message: subsectorId
          ? 'Não há localização cadastrada para o subsetor informado.'
          : 'Não há nenhuma localização cadastrada para o setor CORTE.' });
        continue;
      }

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

      const matchedCategory = categoryForImport(availableCategories, 'CORTE', type);
      if (!matchedCategory?.id) {
        errors.push({ row: row.rowNumber, column: 'categoria', value: type, message: 'Cadastre uma categoria correspondente ao material antes de importar.' });
        continue;
      }
      try { validateCategoryEntry(matchedCategory, { unit, quantity: 0 }, true); }
      catch (error) { errors.push({ row: row.rowNumber, column: 'categoria', value: type, message: (error as Error).message }); continue; }
      const selectedSubsector = subsectorId === null ? undefined : availableSubsectors.find(candidate => candidate.id === subsectorId);
      if (selectedSubsector?.categoryMode === 'SELECTED') {
        const allowedCategoryIds = new Set((selectedSubsector.categoryLinks || []).map(link => Number(link.categoryConfigId)));
        if (!matchedCategory?.id || !allowedCategoryIds.has(Number(matchedCategory.id))) {
          errors.push({ row: row.rowNumber, column: 'categoria', value: type, message: matchedCategory
            ? `A categoria '${type}' não está permitida no subsetor '${selectedSubsector.name}'.`
            : `A categoria '${type}' precisa estar cadastrada e permitida no subsetor '${selectedSubsector.name}'.` });
          continue;
        }
        const locationAllowsCategory = defaultCorteLoc.categoryMode === 'ALL'
          || defaultCorteLoc.categoryId === matchedCategory.id
          || defaultCorteLoc.categoryLinks?.some(link => link.categoryId === matchedCategory.id) === true;
        if (!locationAllowsCategory) {
          errors.push({ row: row.rowNumber, column: 'prateleira', value: defaultCorteLoc.name, message: `A localização '${defaultCorteLoc.name}' não está vinculada à categoria '${matchedCategory.name}'.` });
          continue;
        }
      }

      validatedItems.push({
        rowNumber: row.rowNumber,
        sector: 'CORTE',
        subsectorId,
        categoryId: matchedCategory?.id,
        entryMode: matchedCategory?.entryMode,
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
    const rawDescCell = row.cells[descIdx] ?? '';
    const rawDesc = !rawDescCell.trim() && modelIdx !== -1 && modelIdx !== descIdx
      ? row.cells[modelIdx] ?? ''
      : rawDescCell;
    const rawSector = sectorIdx !== -1 ? row.cells[sectorIdx] : undefined;
    const rawUnit = unitIdx !== -1 ? row.cells[unitIdx] : undefined;
    const rawType = catIdx !== -1 ? row.cells[catIdx] : undefined;
    const rawQtd = qtdIdx !== -1 ? row.cells[qtdIdx] : undefined;
    const rawLoc = locIdx !== -1 ? row.cells[locIdx] : undefined;
    const rawColor = colorIdx !== -1 ? row.cells[colorIdx] : undefined;
    const rawSize = sizeIdx !== -1 ? row.cells[sizeIdx] : undefined;
    const rawSide = sideIdx !== -1 ? row.cells[sideIdx] : undefined;
    const rawSubsector = subsectorIdx !== -1 ? row.cells[subsectorIdx] : undefined;
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

    let subsectorId: number | null = null;
    const requestedSubsector = String(rawSubsector || '').trim();
    if (requestedSubsector) {
      const normalizedName = normalizeCategoryName(requestedSubsector);
      const subsector = availableSubsectors.find(candidate => candidate.active
        && requireActiveStockSector(candidate.sector) === itemSector
        && normalizeCategoryName(candidate.name) === normalizedName);
      if (!subsector) {
        errors.push({ row: row.rowNumber, column: 'subsetor', value: requestedSubsector, message: `O subsetor '${requestedSubsector}' não está ativo para o setor ${itemSector}.` });
      } else {
        subsectorId = subsector.id;
      }
    }

    if (itemSector === 'CORTE' && rawColor?.trim()) {
      errors.push({
        row: row.rowNumber,
        column: 'combinacao',
        value: rawColor,
        message: 'O setor Corte não usa combinação como dimensão separada. Inclua essa informação na descrição do material ou remova a coluna preenchida.',
      });
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
      const matchedLoc = availableLocations.find(location => location.name.toUpperCase() === normLocName);

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
        const scopedLocation = locationFor(normLocName, itemSector, subsectorId);
        if (!scopedLocation) {
          errors.push({ row: row.rowNumber, column: 'prateleira', value: rawLoc, message: `A prateleira '${rawLoc}' não pertence ao subsetor informado. Itens sem subsetor só podem usar localizações sem subsetor.` });
        } else {
          locationId = scopedLocation.id;
          locationName = scopedLocation.name;
        }
      }
    } else {
      // Prateleira não informada na linha: tenta encontrar localização padrão do setor
      const defaultLoc = defaultLocation(itemSector, subsectorId);

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
    let type = rawType ? rawType.trim().toUpperCase() : '';
    if (itemSector === 'PRE_FABRICADO') {
      const allowedTypes = availableCategories
        .filter(category => categoryAppliesToSector(category, itemSector))
        .map(category => category.name.trim().toLocaleUpperCase('pt-BR'));
      if (!type) {
        errors.push({
          row: row.rowNumber,
          column: 'tipo',
          value: '',
          message: 'Informe o tipo/categoria do Pré-Fabricado (por exemplo, EVA ou BORRACHA).',
        });
      } else if (allowedTypes.length === 0) {
        errors.push({
          row: row.rowNumber,
          column: 'tipo',
          value: type,
          message: 'Não há categorias configuradas para o setor Pré-Fabricado. Cadastre uma categoria em Configurações antes de importar.',
        });
      } else if (!allowedTypes.includes(type)) {
        errors.push({
          row: row.rowNumber,
          column: 'tipo',
          value: type,
          message: `Categoria inválida para Pré-Fabricado. Utilize uma das categorias configuradas: ${[...new Set(allowedTypes)].join(', ')}.`,
        });
      }
    }
    const matchedCategory = categoryForImport(availableCategories, itemSector, type);
    const categoryId = matchedCategory?.id || undefined;
    const entryMode = matchedCategory?.entryMode;
    if (!rawUnit?.trim() && matchedCategory?.defaultUnitCode) unit = matchedCategory.defaultUnitCode;
    const selectedSubsector = subsectorId === null ? undefined : availableSubsectors.find(candidate => candidate.id === subsectorId);
    if (selectedSubsector?.categoryMode === 'SELECTED') {
      const allowedCategoryIds = new Set((selectedSubsector.categoryLinks || []).map(link => Number(link.categoryConfigId)));
      if (!categoryId || !allowedCategoryIds.has(Number(categoryId))) {
        errors.push({ row: row.rowNumber, column: 'categoria', value: type, message: categoryId
          ? `A categoria '${type}' não está permitida no subsetor '${selectedSubsector.name}'.`
          : `Selecione uma categoria permitida no subsetor '${selectedSubsector.name}'.` });
      }
    }
    if (!matchedCategory?.id) {
      errors.push({ row: row.rowNumber, column: 'categoria', value: type, message: 'Informe uma categoria configurada para este setor.' });
    } else {
      try { validateCategoryEntry(matchedCategory, { unit, quantity: parsedQtd.value, footSide: parsedSide }, true); }
      catch (error) { errors.push({ row: row.rowNumber, column: error instanceof UnitValidationError && /Quantidade/.test(error.message) ? 'quantidade' : 'categoria', value: type, message: (error as Error).message }); }
    }
    if (categoryId && locationId) {
      const selectedLocation = availableLocations.find(location => location.id === locationId);
      const locationHasCategory = selectedLocation?.categoryMode === 'ALL'
        || selectedLocation?.categoryId === categoryId
        || selectedLocation?.categoryLinks?.some(link => link.categoryId === categoryId) === true;
      if (!locationHasCategory) {
        errors.push({ row: row.rowNumber, column: 'prateleira', value: locationName, message: `A localização '${locationName}' não está vinculada à categoria '${matchedCategory?.name}'. Vincule-a em Configurações ou escolha outra localização.` });
      }
    }
    const color = rawColor && rawColor.trim() !== '' ? rawColor.trim().toUpperCase() : undefined;
    const sizeGrade = rawSize && rawSize.trim() !== '' ? rawSize.trim().toUpperCase() : undefined;
    const observation = rawObs && rawObs.trim() !== '' ? rawObs.trim() : undefined;

    // Desmembramento de PAR em E + D para calçados
    if (parsedSide === 'PAR' && entryMode === 'SIDE_PAIR') {
      validatedItems.push({
        rowNumber: row.rowNumber,
        sector: itemSector,
        subsectorId,
        code: codigo,
        name: descricao,
        unit,
        type,
        categoryId,
        entryMode,
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
        subsectorId,
        code: codigo,
        name: descricao,
        unit,
        type,
        categoryId,
        entryMode,
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
        subsectorId,
        code: codigo,
        name: descricao,
        unit,
        type,
        categoryId,
        entryMode,
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

  // Agrupamento e consolidação de itens para setores com componentes (evita rejeição por PAR + avulsos ou multi-estante)
  const consolidated: ValidatedImportItem[] = [];
  const consolidatedByIdentity = new Map<string, ValidatedImportItem>();

  for (const item of validatedItems) {
    if (item.sector === 'CORTE') {
      consolidated.push({
        ...item,
        locations: [{ locationId: item.locationId, locationName: item.locationName, quantity: item.quantity, rowNumber: item.rowNumber }],
      });
      continue;
    }

    const key = JSON.stringify([item.sector, item.subsectorId || null, stockIdentity(importStockData(item, 0))]);
    const existing = consolidatedByIdentity.get(key);
    if (!existing) {
      const consolidatedItem: ValidatedImportItem = {
        ...item,
        locations: [{ locationId: item.locationId, locationName: item.locationName, quantity: item.quantity, rowNumber: item.rowNumber }],
      };
      consolidatedByIdentity.set(key, consolidatedItem);
      consolidated.push(consolidatedItem);
    } else {
      existing.quantity = new Prisma.Decimal(existing.quantity).plus(item.quantity).toNumber();
      const locMatch = existing.locations?.find(l => l.locationId === item.locationId);
      if (locMatch) {
        locMatch.quantity = new Prisma.Decimal(locMatch.quantity).plus(item.quantity).toNumber();
      } else {
        existing.locations?.push({
          locationId: item.locationId,
          locationName: item.locationName,
          quantity: item.quantity,
          rowNumber: item.rowNumber,
        });
      }
    }
  }

  return consolidated;
}

const IMPORT_QUERY_CHUNK = 400;

export function importStockData(item: ValidatedImportItem, factoryUnitId: number) {
  const base = {
    factoryUnitId,
    sector: item.sector,
    subsectorId: item.subsectorId || null,
    quantity: item.quantity,
    unit: normalizeUnit(item.unit),
    type: item.type,
    categoryId: item.categoryId || null,
    observation: item.observation || (item.sector === 'CORTE' ? 'Importado via planilha de materiais CSV' : 'Importado via planilha de componentes CSV'),
  };
  if (item.sector === 'CORTE') return {
    ...base, footSide: item.footSide || null,
    code: item.code, name: item.name,
  };
  const apoio = item.sector === 'APOIO';
  return {
    ...base,
    // SKU e código da peça identificam componentes. `code` é único por unidade
    // e deve ficar reservado aos materiais de CORTE (inclusive para E + D).
    code: null,
    name: item.name,
    pieceCode: apoio ? item.code : null,
    description: item.name,
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

async function validateConfiguredCategories(tx: any, items: ValidatedImportItem[], factoryUnitId: number, context?: ImportExecutionContext) {
  for (const item of items) {
    requireActiveStockSector(item.sector);
    if (context) assertStockSectorAccess(context, item.sector);
  }
  const subsetorIds = [...new Set(items.map(item => item.subsectorId).filter((id): id is number => Number.isSafeInteger(id)))];
  const subsectors = subsetorIds.length ? await tx.subsectorConfig.findMany({
    where: { factoryUnitId, id: { in: subsetorIds } },
    include: { categoryLinks: { select: { categoryConfigId: true } } },
  }) : [];
  const subsectorsById = new Map<number, AvailableImportSubsector>(subsectors.map((subsector: any) => [subsector.id, subsector]));
  for (const item of items) {
    if (!item.subsectorId) continue;
    const subsector = subsectorsById.get(item.subsectorId);
    if (!subsector || !subsector.active || requireActiveStockSector(subsector.sector) !== requireActiveStockSector(item.sector)) {
      throw new ImportValidationError('O subsetor do arquivo foi alterado ou arquivado. Nenhum item foi importado.', [
        { row: item.rowNumber, column: 'subsetor', value: String(item.subsectorId), message: 'Atualize os subsetores e valide novamente o arquivo.' },
      ]);
    }
    if (context) assertStockSubsectorAccess(context, subsector, item.sector);
    assertSubsectorCategoryAllowed(subsector, item.categoryId, true);
  }
  const categories = await tx.categoryConfig.findMany({
    where: { factoryUnitId, id: { in: [...new Set(items.map(item => item.categoryId).filter(Boolean))] } },
    select: { id: true, name: true, sector: true, sectors: true, entryMode: true, defaultUnitCode: true },
  });
  const byId = new Map<number, AvailableImportCategory>(categories.map((category: AvailableImportCategory) => [category.id!, category]));
  for (const item of items) {
    const category = item.categoryId ? byId.get(item.categoryId) : undefined;
    if (!category || !categoryAppliesToSector(category, item.sector)
      || normalizeCategoryName(category.name) !== normalizeCategoryName(item.type)
      || item.entryMode !== undefined && item.entryMode !== category.entryMode) {
      throw new ImportValidationError('A categoria foi alterada após a validação do arquivo.', [
        { row: item.rowNumber, column: 'categoria', value: item.type, message: 'Revise a categoria e valide novamente o arquivo.' },
      ]);
    }
    validateCategoryEntry(category, item, true);
  }

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
      include: { locations: { include: { location: true } } },
    });
    for (const existing of found) {
      if (existing.code) existingByCode.set(JSON.stringify([existing.code.toUpperCase(), existing.footSide || null]), existing);
      existingByIdentity.set(importIdentityKey(existing), existing);
    }
  }

  const seenIdentities = new Map<string, number>();
  const seenCorteCodes = new Map<string, number>();
  const toInsert: ValidatedImportItem[] = [];
  const errors: ImportRowError[] = [];
  let ignored = 0;
  const ignoredItems: Array<{ row: number; code: string; quantity: number; existingQuantity: number; unit: string; locations: string[]; existingLocations: string[] }> = [];
  for (const item of items) {
    const data = importStockData(item, factoryUnitId);
    const identity = importIdentityKey(data);
    const earlier = seenIdentities.get(identity) || (item.sector === 'CORTE' ? seenCorteCodes.get(JSON.stringify([item.code, item.footSide || null])) : undefined);
    if (earlier) {
      errors.push({ row: item.rowNumber, column: 'codigo', value: item.code, message: `Item repetido no arquivo (primeira ocorrência na linha ${earlier}).` });
      continue;
    }
    seenIdentities.set(identity, item.rowNumber);
    if (item.sector === 'CORTE') seenCorteCodes.set(JSON.stringify([item.code, item.footSide || null]), item.rowNumber);

    const existing = item.sector === 'CORTE' ? existingByCode.get(JSON.stringify([item.code, item.footSide || null])) : existingByIdentity.get(identity);
    if (!existing) {
      toInsert.push(item);
      continue;
    }
    const sameIdentity = importIdentityKey(existing) === identity;
    const sameSubsector = (existing.subsectorId ?? null) === (data.subsectorId ?? null);
    if (sameIdentity && sameSubsector && normalizeUnit(existing.unit, item.sector) === data.unit) {
      ignored++;
      ignoredItems.push({ row: item.rowNumber, code: item.code, quantity: item.quantity,
        existingQuantity: Number(existing.quantity), unit: data.unit,
        locations: (item.locations || [{ locationName: item.locationName, quantity: item.quantity }]).map(l => `${l.locationName}: ${l.quantity}`),
        existingLocations: (existing.locations || []).map((l: any) => `${l.location?.name || l.locationId}: ${l.quantity}`),
      });
      continue;
    }
    errors.push({
      row: item.rowNumber, column: 'codigo', value: item.code,
      message: item.sector === 'CORTE'
        ? !sameSubsector
          ? 'O material já existe em outro escopo (subsetor ou legado) desta unidade. Nenhum vínculo histórico foi alterado.'
          : `O código já existe no setor ${existing.sector} com descrição, categoria ou unidade diferente. Cadastro atual: ${existing.name || ''} / ${existing.type || ''} / ${existing.unit || ''}.`
        : !sameSubsector
          ? 'O material já existe em outro escopo (subsetor ou legado) desta unidade. Nenhum vínculo histórico foi alterado.'
          : 'O item já existe com a mesma identidade, mas outra unidade de medida.',
    });
  }
  return { toInsert, ignored, ignoredItems, errors };
}

async function executeBulkImport(tx: any, items: ValidatedImportItem[], context: ImportExecutionContext): Promise<ImportExecutionResult> {
  const { factoryUnitId, operatorId, operatorName } = context;
  const locationIds = [...new Set(items.flatMap(item => (item.locations?.map(l => l.locationId) || [item.locationId])))];
  const locations = await tx.location.findMany({
    where: { factoryUnitId, id: { in: locationIds } },
    include: { categoryLinks: { select: { categoryId: true } } },
  });
  const locationsById = new Map<number, any>(locations.map((location: any) => [location.id, location]));
  const categoryIds = [...new Set(items.map(item => item.categoryId).filter((id): id is number => Number.isSafeInteger(id)))];
  const categories = categoryIds.length ? await tx.categoryConfig.findMany({ where: { factoryUnitId, id: { in: categoryIds } } }) : [];
  const categoryById = new Map<number, any>(categories.map((category: any) => [category.id, category]));
  for (const item of items) {
    assertStockSectorAccess(context, item.sector);
    validateQuantity(item.quantity, item.unit, item.sector, true);
    const allocs = item.locations && item.locations.length > 0
      ? item.locations
      : [{ locationId: item.locationId, locationName: item.locationName, quantity: item.quantity, rowNumber: item.rowNumber }];
    for (const alloc of allocs) {
      const location = locationsById.get(alloc.locationId);
      if (!location) throw new ImportValidationError('Localização não encontrada nesta unidade.', [{ row: alloc.rowNumber, column: 'prateleira', value: alloc.locationName, message: 'A localização foi removida. Atualize a página e valide novamente.' }]);
      assertStockLocationSector(location, item.sector);
      assertStockLocationSubsector(location, item.subsectorId);
      try { assertStockLocationCategory(location, item.categoryId); }
      catch (error) { throw new ImportValidationError('A localização não permite a categoria importada.', [{ row: alloc.rowNumber, column: 'prateleira', value: alloc.locationName, message: (error as Error).message }]); }
      assertGeneralStockAccess(context, location);
    }
    const category = item.categoryId ? categoryById.get(item.categoryId) : null;
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
      const allocs = item.locations && item.locations.length > 0
        ? item.locations
        : [{ locationId: item.locationId, locationName: item.locationName, quantity: item.quantity, rowNumber: item.rowNumber }];
      for (const alloc of allocs) {
        links.push({ stockItemId: record.id, locationId: alloc.locationId, factoryUnitId, quantity: alloc.quantity });
        if (alloc.quantity > 0) movements.push({
          factoryUnitId, stockItemId: record.id, subsectorId: record.subsectorId, sector: record.sector, type: 'ENTRADA', quantity: alloc.quantity,
          ...movementSnapshot(record),
          destinationStockItemId: record.id, destinationSector: record.sector,
          destinationLocationId: alloc.locationId, destinationLocationName: alloc.locationName,
          origem: 'Saldo Inicial / Implantação', reason: item.observation || 'Importação inicial via planilha CSV',
          operatorId: operatorId || null, operatorName: operatorName || 'Sistema / Importação',
        });
      }
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
    await validateConfiguredCategories(tx, items, factoryUnitId, context);
    if (items.length >= 100) return executeBulkImport(tx, items, context);
    for (const item of items) {
      validateQuantity(item.quantity, item.unit, item.sector, true);
      item.unit = normalizeUnit(item.unit);
      const allocs = item.locations && item.locations.length > 0
        ? item.locations
        : [{ locationId: item.locationId, locationName: item.locationName, quantity: item.quantity, rowNumber: item.rowNumber }];
      for (const alloc of allocs) {
        const location = await tx.location.findFirst({
          where: { id: alloc.locationId, factoryUnitId },
          include: { categoryLinks: { select: { categoryId: true } } },
        });
        if (!location) throw new Error('A localização não foi encontrada nesta unidade fabril.');
        assertStockSectorAccess(context, item.sector);
        assertStockLocationSector(location, item.sector);
        assertStockLocationSubsector(location, item.subsectorId);
        try { assertStockLocationCategory(location, item.categoryId); }
        catch (error) { throw new ImportValidationError('A localização não permite a categoria importada.', [{ row: alloc.rowNumber, column: 'prateleira', value: alloc.locationName, message: (error as Error).message }]); }
        assertGeneralStockAccess(context, location);
      }
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
          subsectorId: item.subsectorId || null,
          categoryId: item.categoryId || null,
          code: item.code,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          type: item.type,
          footSide: item.footSide || null,
          observation: item.observation || 'Importado via planilha de materiais CSV',
        },
      });
      insertedCount++;

      const allocs = item.locations && item.locations.length > 0
        ? item.locations
        : [{ locationId: item.locationId, locationName: item.locationName, quantity: item.quantity, rowNumber: item.rowNumber }];
      for (const alloc of allocs) {
        await tx.stockItemLocation.upsert({
          where: {
            stockItemId_locationId_factoryUnitId: {
              stockItemId: materialRecord.id,
              locationId: alloc.locationId,
              factoryUnitId,
            },
          },
          update: {
            quantity: { increment: alloc.quantity },
          },
          create: {
            stockItemId: materialRecord.id,
            locationId: alloc.locationId,
            factoryUnitId,
            quantity: alloc.quantity,
          },
        });

        // Se quantidade > 0, registrar movimentação inicial de implantação com snapshots
        if (alloc.quantity > 0) {
          await tx.stockMovement.create({
            data: {
              factoryUnitId,
              stockItemId: materialRecord.id,
              subsectorId: materialRecord.subsectorId,
              sector: 'CORTE',
              type: 'ENTRADA',
              quantity: alloc.quantity,
              ...movementSnapshot(materialRecord),
              destinationStockItemId: materialRecord.id, destinationSector: materialRecord.sector,
              destinationLocationId: alloc.locationId,
              destinationLocationName: alloc.locationName,
              origem: 'Saldo Inicial / Implantação',
              reason: item.observation || 'Importação inicial via planilha CSV',
              operatorId: operatorId || null,
              operatorName: operatorName || 'Sistema / Importação',
            },
          });
          movementsCreatedCount++;
        }
      }
    }

    // 2. Processar itens dos demais setores (tabela StockItem + StockItemLocation + StockMovement)
    const stockItems = items.filter(i => i.sector !== 'CORTE');
    for (const item of stockItems) {
      const data = importStockData(item, factoryUnitId);
      await rejectDuplicateStockItem(tx, factoryUnitId, data);
      const stockItem = await tx.stockItem.create({ data });
      insertedCount++;

      // Amarração com a prateleira física existente
      const allocs = item.locations && item.locations.length > 0
        ? item.locations
        : [{ locationId: item.locationId, locationName: item.locationName, quantity: item.quantity, rowNumber: item.rowNumber }];
      for (const alloc of allocs) {
        await tx.stockItemLocation.create({
          data: {
            stockItemId: stockItem.id,
            locationId: alloc.locationId,
            factoryUnitId,
            quantity: alloc.quantity,
          },
        });

        // Se quantidade > 0, registrar movimentação inicial de implantação
        if (alloc.quantity > 0) {
          await tx.stockMovement.create({
            data: {
              factoryUnitId,
              stockItemId: stockItem.id,
              subsectorId: stockItem.subsectorId,
              sector: item.sector,
              type: 'ENTRADA',
              quantity: alloc.quantity,
              destinationLocationId: alloc.locationId,
              destinationLocationName: alloc.locationName,
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
