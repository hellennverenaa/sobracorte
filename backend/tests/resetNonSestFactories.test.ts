import assert from 'node:assert/strict';
import test from 'node:test';

const { CONFIRMATION, parseArgs } = require('../scripts/reset-non-sest-factories.cjs');

test('reset não aplica sem confirmação destrutiva explícita', () => {
  assert.deepEqual(parseArgs([], {}), { apply: false, disableCodes: [] });
  assert.throws(() => parseArgs(['--apply'], {}), /--confirm/);
  assert.throws(() => parseArgs([`--confirm=${CONFIRMATION}`], {}), /só podem ser usadas com --apply/);
});

test('reset em produção exige autorização adicional', () => {
  assert.throws(
    () => parseArgs(['--apply', `--confirm=${CONFIRMATION}`], { NODE_ENV: 'production' }),
    /--allow-production/,
  );
  assert.deepEqual(parseArgs(
    ['--apply', `--confirm=${CONFIRMATION}`, '--allow-production'],
    { NODE_ENV: 'production' },
  ), { apply: true, disableCodes: [] });
});

test('reset aceita unidades não-SEST explícitas para desativação', () => {
  assert.deepEqual(parseArgs(['--disable=vdc, IVT'], {}), {
    apply: false,
    disableCodes: ['VDC', 'IVT'],
  });
  assert.throws(() => parseArgs(['--disable=SEST'], {}), /protegida/);
  assert.throws(() => parseArgs(['--disable=VDC,VDC'], {}), /duplicados/);
});

test('reset recusa argumentos desconhecidos', () => {
  assert.throws(() => parseArgs(['--apply', '--force'], {}), /Uso:/);
});
