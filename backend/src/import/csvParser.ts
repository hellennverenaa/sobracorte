/**
 * Motor de Parsing CSV conforme a especificação RFC 4180.
 * Suporta:
 * - Remoção de BOM UTF-8 (\uFEFF)
 * - Auto-detecção inteligente de delimitadores (;, ,, \t)
 * - Quebras de linha internas em células entre aspas (\r\n e \n)
 * - Aspas duplas escapadas ("")
 * - Rastreamento do número da linha física no arquivo original
 */

export interface ParsedCsvRow {
  rowNumber: number; // Linha física 1-based no arquivo original
  cells: string[];
}

export interface CsvParseResult {
  delimiter: string;
  headers: string[];
  headerRowNumber: number;
  rows: ParsedCsvRow[];
}

export interface CsvParseOptions {
  delimiter?: string;
}

/**
 * Detecta o delimitador mais provável analisando a primeira linha fora de aspas.
 */
export function detectDelimiter(text: string): string {
  let inQuotes = false;
  let countSemicolon = 0;
  let countComma = 0;
  let countTab = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ';') countSemicolon++;
      else if (char === ',') countComma++;
      else if (char === '\t') countTab++;
      else if (char === '\n' || char === '\r') {
        // Encerra a análise ao fim da primeira linha
        break;
      }
    }
  }

  if (countSemicolon > 0 && countSemicolon >= countComma && countSemicolon >= countTab) {
    return ';';
  }
  if (countTab > 0 && countTab >= countComma && countTab >= countSemicolon) {
    return '\t';
  }
  return ',';
}

/**
 * Faz o parse de um Buffer ou string CSV conforme RFC 4180.
 */
export function parseCsvRFC4180(input: Buffer | string, options?: CsvParseOptions): CsvParseResult {
  let text = typeof input === 'string' ? input : input.toString('utf-8');

  // 1. Remover BOM UTF-8 caso presente
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // 2. Determinar delimitador
  const delimiter = options?.delimiter || detectDelimiter(text);

  const rawRows: ParsedCsvRow[] = [];
  let currentCells: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let currentRowStartLine = 1;
  let currentLineNumber = 1;

  const len = text.length;
  let i = 0;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // Verificar se é uma aspa escapada ("")
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Fechamento das aspas
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        if (char === '\n') {
          currentLineNumber++;
        } else if (char === '\r') {
          if (i + 1 < len && text[i + 1] === '\n') {
            currentLineNumber++;
            i++;
          } else {
            currentLineNumber++;
          }
        }
        currentField += char;
        i++;
      }
    } else {
      // Fora de aspas
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        currentCells.push(currentField.trim());
        currentField = '';
        i++;
      } else if (char === '\r' || char === '\n') {
        // Quebra de linha fora de aspas -> fim do registro
        if (char === '\r' && i + 1 < len && text[i + 1] === '\n') {
          i++; // consumir o \n após o \r
        }

        currentCells.push(currentField.trim());
        currentField = '';

        // Ignora linhas completamente vazias
        const hasContent = currentCells.some(cell => cell.length > 0);
        if (hasContent) {
          rawRows.push({
            rowNumber: currentRowStartLine,
            cells: currentCells,
          });
        }

        currentLineNumber++;
        currentRowStartLine = currentLineNumber;
        currentCells = [];
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Processar último campo/linha se arquivo não terminar com quebra de linha
  if (currentField.length > 0 || currentCells.length > 0) {
    currentCells.push(currentField.trim());
    const hasContent = currentCells.some(cell => cell.length > 0);
    if (hasContent) {
      rawRows.push({
        rowNumber: currentRowStartLine,
        cells: currentCells,
      });
    }
  }

  if (rawRows.length === 0) {
    return {
      delimiter,
      headers: [],
      headerRowNumber: 1,
      rows: [],
    };
  }

  const headerRow = rawRows[0];
  const headers = headerRow.cells.map(h => h.trim());
  const dataRows = rawRows.slice(1);

  return {
    delimiter,
    headers,
    headerRowNumber: headerRow.rowNumber,
    rows: dataRows,
  };
}
