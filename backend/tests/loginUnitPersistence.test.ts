import test from 'node:test';
import assert from 'node:assert/strict';

test('Login: Persistência e restauração da unidade fabril selecionada', () => {
  const lastUnitStorageKey = 'sobracorte_selected_factory_unit';
  const legacyStorageKey = 'sobracorte:last-unit';

  const mockStorage: Record<string, string> = {};

  function loadLastUnit() {
    return mockStorage[lastUnitStorageKey] || mockStorage[legacyStorageKey] || '';
  }

  function rememberLastUnit(unitCode: string) {
    if (!unitCode) return;
    mockStorage[lastUnitStorageKey] = unitCode;
    mockStorage[legacyStorageKey] = unitCode;
  }

  const availableUnits = [
    { code: 'SEST', name: 'Setor de Estruturação e Testes' },
    { code: 'IVOTI', name: 'Unidade Ivoti - RS' },
    { code: 'ITABUNA', name: 'Unidade Itabuna - BA' },
    { code: 'SAJ', name: 'Unidade Santo Antônio de Jesus - BA' },
  ];

  // Cenário 1: Primeiro acesso sem histórico no localStorage -> Padrão SEST
  let lastUnit = loadLastUnit();
  let selectedUnit = availableUnits.some(u => u.code === lastUnit)
    ? lastUnit
    : (availableUnits.find(u => u.code === 'SEST')?.code || availableUnits[0]?.code || '');

  assert.equal(selectedUnit, 'SEST', 'Primeiro acesso deve selecionar SEST como padrão');

  // Cenário 2: Operador troca para IVOTI e faz login
  rememberLastUnit('IVOTI');
  assert.equal(mockStorage[lastUnitStorageKey], 'IVOTI');
  assert.equal(mockStorage[legacyStorageKey], 'IVOTI');

  // Cenário 3: Operador faz logout e abre a tela de login novamente
  lastUnit = loadLastUnit();
  selectedUnit = availableUnits.some(u => u.code === lastUnit)
    ? lastUnit
    : (availableUnits.find(u => u.code === 'SEST')?.code || availableUnits[0]?.code || '');

  assert.equal(selectedUnit, 'IVOTI', 'Tela de login deve restaurar automaticamente IVOTI');

  // Cenário 4: Unidade salva anteriormente foi desativada/removida do backend
  mockStorage[lastUnitStorageKey] = 'UNIDADE_REMOVIDA';
  lastUnit = loadLastUnit();
  selectedUnit = availableUnits.some(u => u.code === lastUnit)
    ? lastUnit
    : (availableUnits.find(u => u.code === 'SEST')?.code || availableUnits[0]?.code || '');

  assert.equal(selectedUnit, 'SEST', 'Se unidade não mais existir, faz fallback gracioso para SEST');

  // Cenário 5: Compatibilidade com chave legada
  delete mockStorage[lastUnitStorageKey];
  mockStorage[legacyStorageKey] = 'ITABUNA';
  lastUnit = loadLastUnit();
  selectedUnit = availableUnits.some(u => u.code === lastUnit)
    ? lastUnit
    : (availableUnits.find(u => u.code === 'SEST')?.code || availableUnits[0]?.code || '');

  assert.equal(selectedUnit, 'ITABUNA', 'Deve suportar chave legada de storage');
});
