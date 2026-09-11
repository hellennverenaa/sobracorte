import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260911120000_rename_stj_to_saj',
  'migration.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

test('migration STJ para SAJ preserva a identidade do tenant', () => {
  assert.match(migration, /WHERE "code" = 'STJ'/);
  assert.match(migration, /WHERE "code" = 'SAJ'/);
  assert.match(migration, /SET "code" = 'SAJ',\s+"name" = 'Santo Antônio de Jesus'/);
  assert.match(migration, /WHERE "id" = stj_id/);
  assert.doesNotMatch(migration, /SET\s+"id"\s*=/i);
});

test('migration remove somente usuários locais de STJ', () => {
  assert.match(
    migration,
    /DELETE FROM "sobra_corte"\."User"\s+WHERE "factoryUnitId" = stj_id/s,
  );
  assert.doesNotMatch(migration, /DELETE FROM "sobra_corte"\."(?:Material|MaterialLocation|Movement|RoleChangeAudit|FactoryUnit|UnitConfig|CategoryConfig|OriginConfig|Location)"/);
  assert.doesNotMatch(migration, /autenticacao/i);
});

test('migration não remove dados operacionais, configurações ou auditorias', () => {
  for (const table of [
    'FactoryUnit',
    'Material',
    'MaterialLocation',
    'Movement',
    'MaterialDeletionAudit',
    'RoleChangeAudit',
    'UnitConfig',
    'CategoryConfig',
    'OriginConfig',
    'Location',
    'LocationCategory',
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`(?:DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s+"sobra_corte"\\."${table}"`, 'i'),
      `migration não deve remover ${table}`,
    );
  }
});

test('migration falha em conflito e é segura para uma segunda execução', () => {
  assert.match(migration, /IF stj_id IS NULL/);
  assert.match(migration, /IF saj_id IS NULL/);
  assert.match(migration, /RETURN;/);
  assert.match(migration, /IF saj_id IS NOT NULL/);
  assert.match(migration, /RAISE EXCEPTION 'Conflito: unidade SAJ já existe/);
});
