import assert from 'node:assert/strict';
import test from 'node:test';
import { FactoryCatalogValidationError, validateFactoryCatalog } from '../src/provisioning/factoryCatalog';
import { createFactoryWithCatalog } from '../src/provisioning/factoryProvisioning';

test('catálogo fixo contém as categorias e origens aprovadas', () => {
  const catalog = validateFactoryCatalog();
  assert.equal(catalog.categories.length, 11);
  assert.equal(catalog.origins.length, 8);
  assert.deepEqual(catalog.categories.find(category => category.name === 'COURO'), {
    name: 'COURO', sector: 'CORTE', defaultUnitCode: 'M', unitLocked: true,
  });
  assert.deepEqual(catalog.categories.find(category => category.name === 'LINHA'), {
    name: 'LINHA', sector: 'CORTE', defaultUnitCode: 'KG', unitLocked: true,
  });
  assert.equal(catalog.origins.find(origin => origin.name === 'CONSUMO')?.sector, null);
  assert.equal(catalog.origins.find(origin => origin.name === 'DUBLAGEM')?.sector, 'CORTE');
});

test('validador rejeita nomes lógicos duplicados e unidade bloqueada ausente', () => {
  assert.throws(
    () => validateFactoryCatalog({
      categories: [
        { name: 'TESTE', sector: 'CORTE', defaultUnitCode: 'M', unitLocked: true },
        { name: ' teste ', sector: 'CORTE', defaultUnitCode: 'M', unitLocked: true },
      ],
      origins: [],
    } as any),
    FactoryCatalogValidationError,
  );

  assert.throws(
    () => validateFactoryCatalog({
      categories: [{ name: 'TESTE', sector: 'CORTE', defaultUnitCode: '', unitLocked: true }],
      origins: [],
    } as any),
    FactoryCatalogValidationError,
  );
});

test('catálogo preserva KG e G como unidades distintas, sem conversão implícita', async () => {
  const { areUnitsCompatible, normalizeUnit } = await import('../src/utils/unitHelper');
  assert.equal(normalizeUnit('quilo'), 'KG');
  assert.equal(normalizeUnit('grama'), 'G');
  assert.equal(areUnitsCompatible('KG', 'G'), false);
});

test('provisionador cria catálogo e auditorias na mesma unidade', async () => {
  const categories: any[] = [];
  const origins: any[] = [];
  const audits: any[] = [];
  const tx = {
    factoryUnit: { create: async () => ({ id: 42, code: 'TST', name: 'Teste', active: true, enableRequisitions: true }) },
    categoryConfig: { create: async ({ data }: any) => { categories.push(data); return data; } },
    originConfig: { create: async ({ data }: any) => { origins.push(data); return data; } },
    stockMovement: { create: async ({ data }: any) => { audits.push(data); return data; } },
  };

  const result = await createFactoryWithCatalog(tx as any, { code: 'TST', name: 'Teste', active: true });
  assert.equal(result.categoriesCreated, 11);
  assert.equal(result.originsCreated, 8);
  assert.equal(categories.length, 11);
  assert.equal(origins.length, 8);
  assert.equal(audits.length, 19);
  assert(audits.every(audit => audit.factoryUnitId === 42 && audit.sector === 'CONFIGURACOES' && audit.quantity === 0));
  assert(audits.every(audit => audit.origem === 'CATALOGO_FIXO' && audit.type === 'CRIACAO_CONFIGURACAO'));
});
