import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCSV, parseCsvRecord, parseDecimal } from '../src/import/csvParser';

test('parseia CSV RFC 4180 com aspas, delimitador e quebra de linha', () => {
  const input = 'codigo;descricao;categoria;unidade;quantidade;localizacao\n' +
    '1001;"TECIDO; PRETO";TECIDO;m²;150.0;A-01\n' +
    '1002;"FORRO ""AZUL""\nREF";FORRO;m;45,5;B-02';
  const result = parseCSV(input);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows.map((row) => [row.code, row.name, row.quantity, row.location]), [
    ['1001', 'TECIDO; PRETO', '150.0', 'A-01'],
    ['1002', 'FORRO "AZUL"\nREF', '45,5', 'B-02'],
  ]);
});

test('exige todos os campos do modelo, incluindo localização', () => {
  const result = parseCSV('codigo;descricao;categoria;unidade;quantidade\n1;X;TECIDO;m;1');
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].message, /localizacao/);
});

test('retorna erros de linha e não descarta duplicidade silenciosamente', () => {
  const result = parseCSV('codigo,descricao,categoria,unidade,quantidade,localizacao\n1,X,C,m,1,A\n1,Y,C,m,2,B\n2,,C,m,2,B');
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].message, /duplicado/);
  assert.match(result.errors[1].message, /descricao/);
});

test('não multiplica decimais com ponto', () => {
  assert.equal(parseDecimal('150.0'), '150.000');
  assert.equal(parseDecimal('45,5'), '45.500');
  assert.equal(parseDecimal('1.234,567'), '1234.567');
  assert.equal(parseDecimal('999999999999999.999'), '999999999999999.999');
  assert.equal(parseDecimal('1000000000000000.000'), null);
  assert.equal(parseDecimal('-1'), null);
  assert.equal(parseDecimal('1.2345'), null);
});

test('detecta aspas não fechadas', () => {
  assert.deepEqual(parseCsvRecord('"sem fechamento;A', ';'), { error: 'aspas não fechadas' });
});
