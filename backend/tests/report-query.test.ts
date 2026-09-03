import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell, csvLine, dateRange, decimalString, movementFilters, paging } from '../src/controllers/ReportController';

test('paginação limita tamanho e nunca aceita página inválida', () => {
  assert.deepEqual(paging({ page: '2', pageSize: '9999' } as any), { page: 2, pageSize: 500, skip: 500 });
  assert.deepEqual(paging({ page: '-1', pageSize: 'x' } as any), { page: 1, pageSize: 100, skip: 0 });
});

test('intervalo de relatório aceita filtros independentes e valida ordem', () => {
  const onlyStart = dateRange({ dataInicio: '2026-01-03' } as any);
  assert.equal(onlyStart.error, undefined);
  assert.ok(onlyStart.value?.gte instanceof Date);
  assert.equal(onlyStart.value?.lte, undefined);
  assert.match(dateRange({ dataInicio: '2026-02-03', dataFim: '2026-01-03' } as any).error!, /posterior/);
  assert.match(dateRange({ dataInicio: '03/01/2026' } as any).error!, /AAAA-MM-DD/);
  assert.match(dateRange({ dataInicio: '2026-02-31' } as any).error!, /AAAA-MM-DD/);
});

test('filtros de movimentação são aplicados no servidor', () => {
  assert.deepEqual(movementFilters({ type: 'saida', category: 'COURO' } as any, 7), {
    value: {
      factoryUnitId: 7,
      type: 'saida',
      materialCategory: { equals: 'COURO', mode: 'insensitive' },
    },
  });
  assert.match(movementFilters({ type: 'ajuste' } as any, 7).error!, /inválido/);
});

test('serializa Decimal e números com escala estável', () => {
  assert.equal(decimalString(45.5), '45.500');
  assert.equal(decimalString(null), '0.000');
  assert.equal(decimalString({ toFixed: () => '12.345' }), '12.345');
});

test('exportação CSV escapa fórmulas e aspas', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvLine(['a', 'b']), '"a";"b"\r\n');
});
