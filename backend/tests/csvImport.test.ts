import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRFC4180, detectDelimiter } from '../src/import/csvParser';
import {
  validateImportBatch,
  normalizeSector,
  normalizeFootSide,
  parseQuantity,
  ImportValidationError,
  AvailableLocation,
} from '../src/import/materialImport';

const mockLocations: AvailableLocation[] = [
  { id: 1, name: 'A-01', sector: 'CORTE' },
  { id: 2, name: 'A-02', sector: 'CORTE' },
  { id: 3, name: 'GERAL', sector: null },
  { id: 4, name: 'AP-01', sector: 'APOIO' },
  { id: 5, name: 'SOL-01', sector: 'PRE_FABRICADO' },
  { id: 6, name: 'DIS-01', sector: 'DISTRIBUICAO' },
  { id: 7, name: 'MO-01', sector: 'MONTAGEM' },
];

test('CSV de Apoio preserva modelo e descrição da peça separadamente, independentemente da ordem das colunas', () => {
  const parsed = parseCsvRFC4180('codigo;modelo;descricao;material_cor;grade;quantidade;prateleira\n121212;RACER SPEEDZONE;LINGUETA;SINTETICO;40;100;AP-01');
  const [item] = validateImportBatch(parsed.headers, parsed.rows, 'APOIO', mockLocations);
  assert.equal(item.name, 'LINGUETA');
  assert.equal(item.productName, 'RACER SPEEDZONE');
  assert.equal(item.color, 'SINTETICO');
  assert.equal(item.sizeGrade, '40');
});

test('detectDelimiter detecta corretamente delimitadores ponto e vírgula, vírgula e tab', () => {
  assert.equal(detectDelimiter('codigo;descricao;quantidade\n1;tec;10'), ';');
  assert.equal(detectDelimiter('codigo,descricao,quantidade\n1,tec,10'), ',');
  assert.equal(detectDelimiter('codigo\tdescricao\tquantidade\n1\ttec\t10'), '\t');
  assert.equal(detectDelimiter('codigo;"descricao, detalhada";quantidade\n1;"tec, azul";10'), ';');
});

test('parseCsvRFC4180 remove BOM UTF-8 (\\uFEFF) sem corromper o primeiro cabeçalho', () => {
  const csvWithBom = '\uFEFFcodigo;descricao;quantidade\n1001;TECIDO PRETO;50';
  const result = parseCsvRFC4180(csvWithBom);
  assert.equal(result.headers[0], 'codigo');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].cells[0], '1001');
  assert.equal(result.rows[0].cells[1], 'TECIDO PRETO');
});

test('parseCsvRFC4180 processa aspas escapadas ("") e delimitadores dentro de células', () => {
  const csv = 'codigo;descricao;observacao\n1001;"TECIDO ""PRETO"" ESPECIAL";"Obs com ; ponto e virgula"';
  const result = parseCsvRFC4180(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].cells[0], '1001');
  assert.equal(result.rows[0].cells[1], 'TECIDO "PRETO" ESPECIAL');
  assert.equal(result.rows[0].cells[2], 'Obs com ; ponto e virgula');
});

test('parseCsvRFC4180 processa células com quebra de linha interna e rastreia linha física', () => {
  const csv = 'codigo;descricao;quantidade\n1001;"LINHA 1\nLINHA 2";50\n1002;TECIDO AZUL;30';
  const result = parseCsvRFC4180(csv);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].rowNumber, 2);
  assert.equal(result.rows[0].cells[1], 'LINHA 1\nLINHA 2');
  assert.equal(result.rows[1].rowNumber, 4);
  assert.equal(result.rows[1].cells[0], '1002');
});

test('parseQuantity converte formatos numéricos brasileiros e americanos corretamente', () => {
  assert.deepEqual(parseQuantity('123.45'), { valid: true, value: 123.45 });
  assert.deepEqual(parseQuantity('123,45'), { valid: true, value: 123.45 });
  assert.deepEqual(parseQuantity('1.234,56'), { valid: true, value: 1234.56 });
  assert.deepEqual(parseQuantity('1,234.56'), { valid: true, value: 1234.56 });
  assert.deepEqual(parseQuantity('0'), { valid: true, value: 0 });
  assert.deepEqual(parseQuantity(''), { valid: true, value: 0 });
  assert.deepEqual(parseQuantity(undefined), { valid: true, value: 0 });

  assert.equal(parseQuantity('-10').valid, false);
  assert.equal(parseQuantity('abc').valid, false);
  assert.equal(parseQuantity('12.34.56').valid, false);
});

test('validateImportBatch valida com sucesso um lote de CORTE com prateleiras existentes', () => {
  const csv = 'codigo;descricao;categoria;unidade;quantidade;prateleira\n1001;TECIDO PRETO;TECIDO;M2;150.5;A-01\n1002;FORRO AZUL;FORRO;M;80;';
  const parsed = parseCsvRFC4180(csv);
  const validated = validateImportBatch(parsed.headers, parsed.rows, 'CORTE', mockLocations);

  assert.equal(validated.length, 2);
  assert.equal(validated[0].code, '1001');
  assert.equal(validated[0].quantity, 150.5);
  assert.equal(validated[0].locationId, 1);
  assert.equal(validated[0].locationName, 'A-01');

  // Segunda linha sem prateleira deve assumir GERAL existente (id: 3)
  assert.equal(validated[1].code, '1002');
  assert.equal(validated[1].locationId, 3);
  assert.equal(validated[1].locationName, 'GERAL');
});

test('validateImportBatch rejeita prateleira que NÃO existe no cadastro de localizações', () => {
  const csv = 'codigo;descricao;categoria;unidade;quantidade;prateleira\n1001;TECIDO PRETO;TECIDO;M2;100;A-03';
  const parsed = parseCsvRFC4180(csv);

  assert.throws(() => {
    validateImportBatch(parsed.headers, parsed.rows, 'CORTE', mockLocations);
  }, (err: any) => {
    assert(err instanceof ImportValidationError);
    assert.equal(err.errors.length, 1);
    assert.equal(err.errors[0].column, 'prateleira');
    assert.equal(err.errors[0].value, 'A-03');
    assert(err.errors[0].message.includes("não está cadastrada no sistema"));
    return true;
  });
});

test('validateImportBatch rejeita prateleira pertencente a outro setor (Isolamento Setorial)', () => {
  // Tentando alocar item de MONTAGEM na prateleira A-01 (que é do CORTE)
  const csv = 'sku;modelo;grade;lado;quantidade;prateleira\nSKU-PEG40;PEGASUS 40;41;PAR;10;A-01';
  const parsed = parseCsvRFC4180(csv);

  assert.throws(() => {
    validateImportBatch(parsed.headers, parsed.rows, 'MONTAGEM', mockLocations);
  }, (err: any) => {
    assert(err instanceof ImportValidationError);
    assert.equal(err.errors.length, 1);
    assert.equal(err.errors[0].column, 'prateleira');
    assert(err.errors[0].message.includes("pertence ao setor CORTE"));
    return true;
  });
});

test('validateImportBatch valida prateleiras em todos os setores ativos', () => {
  // Teste Apoio
  const csvApoio = 'sku;modelo;peca;quantidade;prateleira\nMOL-001;PEGASUS 40;GASPEA;20;AP-01';
  const pApoio = parseCsvRFC4180(csvApoio);
  const vApoio = validateImportBatch(pApoio.headers, pApoio.rows, 'APOIO', mockLocations);
  assert.equal(vApoio[0].locationId, 4);

  // Teste Pré-Fabricado
  const csvPreFab = 'sku;modelo;grade;lado;quantidade;prateleira\nSOLA-01;PEGASUS 40;41;PAR;15;SOL-01';
  const pPreFab = parseCsvRFC4180(csvPreFab);
  const vPreFab = validateImportBatch(pPreFab.headers, pPreFab.rows, 'PRE_FABRICADO', mockLocations);
  assert.equal(vPreFab.length, 2);
  assert.equal(vPreFab[0].locationId, 5);

  // Teste Distribuição
  const csvDist = 'sku;modelo;grade;lado;quantidade;prateleira\nCAB-01;PEGASUS 40;41;E;30;DIS-01';
  const pDist = parseCsvRFC4180(csvDist);
  const vDist = validateImportBatch(pDist.headers, pDist.rows, 'DISTRIBUICAO', mockLocations);
  assert.equal(vDist[0].locationId, 6);

  // Teste Montagem
  const csvMont = 'sku;modelo;grade;lado;quantidade;prateleira\nMO-01;PEGASUS 40;41;PAR;10;MO-01';
  const pMont = parseCsvRFC4180(csvMont);
  const vMont = validateImportBatch(pMont.headers, pMont.rows, 'MONTAGEM', mockLocations);
  assert.equal(vMont.length, 2);
  assert.equal(vMont[0].locationId, 7);

  assert.throws(() => normalizeSector('CONSUMO'), /Setor inválido ou descontinuado/);
  assert.throws(() => normalizeSector('INSUMOS'), /Setor inválido ou descontinuado/);
  assert.throws(() => normalizeSector('QUIMICOS'), /Setor inválido ou descontinuado/);
});

test('validateImportBatch rejeita lote com código ou descrição vazios e retorna lista linha a linha', () => {
  const csv = 'codigo;descricao;quantidade\n;TECIDO SEM CODIGO;10\n1002;;20';
  const parsed = parseCsvRFC4180(csv);

  assert.throws(() => {
    validateImportBatch(parsed.headers, parsed.rows, 'CORTE', mockLocations);
  }, (err: any) => {
    assert(err instanceof ImportValidationError);
    assert.equal(err.errors.length, 2);
    assert.equal(err.errors[0].row, 2);
    assert.equal(err.errors[0].column, 'codigo');
    assert.equal(err.errors[1].row, 3);
    assert.equal(err.errors[1].column, 'descricao');
    return true;
  });
});

test('validateImportBatch rejeita quantidade negativa e quantidade fracionada em setores discretos', () => {
  const csvApoio = 'sku;modelo;peca;quantidade;prateleira\nMOL-001;PEGASUS 40;GASPEA;12.5;AP-01';
  const parsedApoio = parseCsvRFC4180(csvApoio);

  assert.throws(() => {
    validateImportBatch(parsedApoio.headers, parsedApoio.rows, 'APOIO', mockLocations);
  }, (err: any) => {
    assert(err instanceof ImportValidationError);
    assert.equal(err.errors[0].column, 'quantidade');
    assert(err.errors[0].message.includes('unidades inteiras'));
    return true;
  });

  const csvNegativo = 'codigo;descricao;quantidade;prateleira\n1001;TECIDO;-15;A-01';
  const parsedNegativo = parseCsvRFC4180(csvNegativo);
  assert.throws(() => {
    validateImportBatch(parsedNegativo.headers, parsedNegativo.rows, 'CORTE', mockLocations);
  }, (err: any) => {
    assert(err instanceof ImportValidationError);
    assert.equal(err.errors[0].column, 'quantidade');
    return true;
  });
});

test('validateImportBatch desmembra automaticamente itens com lado PAR em 1E e 1D no setor Montagem', () => {
  const csv = 'sku;modelo;grade;lado;quantidade;prateleira\nSKU-PEG40;PEGASUS 40;41;PAR;20;MO-01';
  const parsed = parseCsvRFC4180(csv);
  const validated = validateImportBatch(parsed.headers, parsed.rows, 'MONTAGEM', mockLocations);

  assert.equal(validated.length, 2);
  assert.equal(validated[0].footSide, 'E');
  assert.equal(validated[0].quantity, 20);
  assert.equal(validated[0].locationName, 'MO-01');

  assert.equal(validated[1].footSide, 'D');
  assert.equal(validated[1].quantity, 20);
  assert.equal(validated[1].locationName, 'MO-01');
});

test('validateImportBatch exige grade para o setor Montagem', () => {
  const csv = 'sku;modelo;grade;lado;quantidade;prateleira\nSKU-PEG40;PEGASUS 40;;E;10;MO-01';
  const parsed = parseCsvRFC4180(csv);

  assert.throws(() => {
    validateImportBatch(parsed.headers, parsed.rows, 'MONTAGEM', mockLocations);
  }, (err: any) => {
    assert(err instanceof ImportValidationError);
    assert.equal(err.errors[0].column, 'grade');
    return true;
  });
});
