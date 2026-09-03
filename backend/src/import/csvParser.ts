export type CsvParseError = {
  line: number;
  message: string;
};

export type ParsedMaterialRow = {
  line: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  quantity: string;
  location: string;
};

export type CsvParseResult = {
  rows: ParsedMaterialRow[];
  errors: CsvParseError[];
  delimiter: ',' | ';' | '\t';
};

const HEADER_ALIASES: Record<keyof Omit<ParsedMaterialRow, 'line'>, string[]> = {
  code: ['codigo', 'código', 'code', 'id_produto', 'produto'],
  name: ['descricao', 'descrição', 'name', 'nome', 'material'],
  category: ['categoria', 'category', 'type', 'tipo'],
  unit: ['unidade', 'unit', 'um'],
  quantity: ['quantidade', 'quantity', 'estoque', 'saldo'],
  location: ['localizacao', 'localização', 'location', 'prateleira'],
};

const FIELD_LABELS: Record<keyof Omit<ParsedMaterialRow, 'line'>, string> = {
  code: 'codigo', name: 'descricao', category: 'categoria', unit: 'unidade', quantity: 'quantidade', location: 'localizacao',
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Parse one CSV record according to RFC 4180 (including escaped quotes). */
export function parseCsvRecord(input: string, delimiter: string): { values?: string[]; error?: string } {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }

  if (quoted) return { error: 'aspas não fechadas' };
  values.push(value.trim());
  return { values };
}

function splitRecords(text: string): { value: string; line: number }[] {
  const records: { value: string; line: number }[] = [];
  let record = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        record += '""';
        i += 1;
      } else {
        quoted = !quoted;
        record += char;
      }
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      if (record.trim()) records.push({ value: record, line: recordLine });
      record = '';
      line += 1;
      recordLine = line;
    } else {
      record += char;
      if (char === '\n') line += 1;
    }
  }
  if (record.trim()) records.push({ value: record, line: recordLine });
  return records;
}

function detectDelimiter(header: string): ',' | ';' | '\t' {
  const candidates: Array<',' | ';' | '\t'> = [';', ',', '\t'];
  return candidates.sort((a, b) => {
    const count = (delimiter: string) => header.split(delimiter).length - 1;
    return count(b) - count(a);
  })[0];
}

function locateHeader(headers: string[], field: keyof Omit<ParsedMaterialRow, 'line'>): number {
  const aliases = HEADER_ALIASES[field];
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

/**
 * Parse the supported import model. The six data columns are intentionally
 * mandatory so imports cannot silently create materials in an arbitrary domain.
 */
export function parseCSV(buffer: Buffer | string): CsvParseResult {
  let text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
  text = text.replace(/^\uFEFF/, '');
  const records = splitRecords(text);
  if (records.length === 0) {
    return { rows: [], errors: [{ line: 1, message: 'arquivo vazio' }], delimiter: ';' };
  }

  const delimiter = detectDelimiter(records[0].value);
  const headerResult = parseCsvRecord(records[0].value, delimiter);
  if (!headerResult.values) {
    return { rows: [], errors: [{ line: records[0].line, message: headerResult.error! }], delimiter };
  }
  const headers = headerResult.values;
  const indexes = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as Array<keyof Omit<ParsedMaterialRow, 'line'>>)
      .map((field) => [field, locateHeader(headers, field)]),
  ) as Record<keyof Omit<ParsedMaterialRow, 'line'>, number>;
  const missing = (Object.keys(indexes) as Array<keyof Omit<ParsedMaterialRow, 'line'>>)
    .filter((field) => indexes[field] < 0);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: records[0].line, message: `colunas obrigatórias ausentes: ${missing.map((field) => FIELD_LABELS[field]).join(', ')}` }],
      delimiter,
    };
  }

  const rows: ParsedMaterialRow[] = [];
  const errors: CsvParseError[] = [];
  const seen = new Set<string>();
  for (const record of records.slice(1)) {
    const parsed = parseCsvRecord(record.value, delimiter);
    if (!parsed.values) {
      errors.push({ line: record.line, message: parsed.error! });
      continue;
    }
    if (parsed.values.length !== headers.length) {
      errors.push({ line: record.line, message: `quantidade de colunas inválida: esperado ${headers.length}, recebido ${parsed.values.length}` });
      continue;
    }
    const value = (field: keyof Omit<ParsedMaterialRow, 'line'>) => parsed.values![indexes[field]]?.trim() ?? '';
    const row = {
      line: record.line,
      code: value('code'),
      name: value('name'),
      category: value('category'),
      unit: value('unit'),
      quantity: value('quantity'),
      location: value('location'),
    };
    const missingFields = (['code', 'name', 'category', 'unit', 'quantity', 'location'] as const)
      .filter((field) => !row[field]);
    if (missingFields.length) {
      errors.push({ line: record.line, message: `campos obrigatórios vazios: ${missingFields.map((field) => FIELD_LABELS[field]).join(', ')}` });
      continue;
    }
    if (seen.has(row.code)) {
      errors.push({ line: record.line, message: `código duplicado no arquivo: ${row.code}` });
      continue;
    }
    seen.add(row.code);
    rows.push(row);
  }
  return { rows, errors, delimiter };
}

/** Locale-aware decimal parser. Dots are never removed from decimal values. */
export function parseDecimal(value: string): string | null {
  let normalized = value.trim().replace(/\s/g, '');
  if (!normalized) return null;
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimalAt = Math.max(comma, dot);
    const thousands = decimalAt === comma ? /\./g : /,/g;
    normalized = normalized.slice(0, decimalAt).replace(thousands, '') + '.' + normalized.slice(decimalAt + 1);
  } else if (comma >= 0) {
    normalized = normalized.replace(',', '.');
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return null;
  const [integer, fraction = ''] = normalized.split('.');
  if (integer.length > 15 || fraction.length > 3) return null;
  return `${integer}.${fraction.padEnd(3, '0')}`;
}
