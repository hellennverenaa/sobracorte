import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUnit, areUnitsCompatible, isDiscreteSector } from '../src/utils/unitHelper';
import { validateImportBatch } from '../src/import/materialImport';
import { ParsedCsvRow } from '../src/import/csvParser';

test('unitHelper: normalizeUnit padroniza variações e aliases de unidades de medida', () => {
  // Metro quadrado
  assert.equal(normalizeUnit('M2'), 'M²');
  assert.equal(normalizeUnit('m2'), 'M²');
  assert.equal(normalizeUnit('M²'), 'M²');
  assert.equal(normalizeUnit('m²'), 'M²');
  assert.equal(normalizeUnit('METRO QUADRADO'), 'M²');
  assert.equal(normalizeUnit('MT2'), 'M²');

  // Quilograma
  assert.equal(normalizeUnit('kg'), 'KG');
  assert.equal(normalizeUnit('kilo'), 'KG');
  assert.equal(normalizeUnit('QUILOGRAMA'), 'KG');
  assert.equal(normalizeUnit('quilos'), 'KG');

  // Grama
  assert.equal(normalizeUnit('g'), 'G');
  assert.equal(normalizeUnit('grama'), 'G');
  assert.equal(normalizeUnit('GR'), 'G');

  // Par
  assert.equal(normalizeUnit('par'), 'PAR');
  assert.equal(normalizeUnit('PARES'), 'PAR');
  assert.equal(normalizeUnit('pr'), 'PAR');

  // Unidade por setor
  assert.equal(normalizeUnit('un', 'CORTE'), 'UN');
  assert.equal(normalizeUnit('und', 'MONTAGEM'), 'UND');
  assert.equal(normalizeUnit('un', 'MONTAGEM'), 'UND');
  assert.equal(normalizeUnit('', 'CORTE'), 'UN');
  assert.equal(normalizeUnit('', 'APOIO'), 'UND');
  assert.equal(normalizeUnit(null, 'CORTE'), 'UN');
  assert.equal(normalizeUnit(undefined, 'DISTRIBUICAO'), 'UND');

  // Rolo, Caixa, Litro, Centímetro
  assert.equal(normalizeUnit('rl'), 'ROLO');
  assert.equal(normalizeUnit('rolo'), 'ROLO');
  assert.equal(normalizeUnit('cx'), 'CX');
  assert.equal(normalizeUnit('caixas'), 'CX');
  assert.equal(normalizeUnit('lt'), 'L');
  assert.equal(normalizeUnit('litro'), 'L');
  assert.equal(normalizeUnit('cm'), 'CM');
  assert.equal(normalizeUnit('centímetros'), 'CM');
});

test('unitHelper: areUnitsCompatible valida equivalência semântica de unidades', () => {
  assert.equal(areUnitsCompatible('M2', 'M²'), true);
  assert.equal(areUnitsCompatible('m2', 'M2'), true);
  assert.equal(areUnitsCompatible('UN', 'UND'), true);
  assert.equal(areUnitsCompatible('KG', 'kg'), true);
  assert.equal(areUnitsCompatible('PAR', 'par'), true);

  // Incompatíveis
  assert.equal(areUnitsCompatible('KG', 'M²'), false);
  assert.equal(areUnitsCompatible('PAR', 'M'), false);
  assert.equal(areUnitsCompatible('L', 'CX'), false);
  assert.equal(areUnitsCompatible('M²', 'UN'), false);
  assert.equal(areUnitsCompatible(null, 'M²'), false);
});

test('unitHelper: isDiscreteSector identifica corretamente setores discretos vs contínuos', () => {
  assert.equal(isDiscreteSector('APOIO'), true);
  assert.equal(isDiscreteSector('PRE_FABRICADO'), true);
  assert.equal(isDiscreteSector('DISTRIBUICAO'), true);
  assert.equal(isDiscreteSector('EXPEDICAO'), true);
  assert.equal(isDiscreteSector('MONTAGEM'), true);

  assert.equal(isDiscreteSector('CORTE'), false);
  assert.equal(isDiscreteSector('CONSUMO'), false);
  assert.equal(isDiscreteSector(null), false);
});

test('Validação de Domínio: Bloqueio de troca de unidade em material com saldo ativo', () => {
  // Simulação do algoritmo de validação presente em MaterialController.update
  const validateUnitChange = (
    existingMaterial: { unit: string; quantity: number; locations: { quantity: number }[] },
    requestedUnit: string
  ) => {
    const currentNorm = normalizeUnit(existingMaterial.unit, 'CORTE');
    const reqNorm = normalizeUnit(requestedUnit, 'CORTE');

    if (reqNorm !== currentNorm) {
      const totalQty = Number(existingMaterial.quantity || 0);
      const hasLocationBalance = existingMaterial.locations.some((l) => Number(l.quantity || 0) > 0.0001);

      if (totalQty > 0.0001 || hasLocationBalance) {
        throw new Error(
          `Não é possível alterar a unidade de medida do material pois ele possui saldo físico ativo (${existingMaterial.quantity} ${existingMaterial.unit}). Zere o estoque antes de alterar a unidade.`
        );
      }
    }
    return reqNorm;
  };

  // Cenário 1: Material com saldo 100 M² tentando mudar para KG -> BLOQUEADO
  const materialComSaldo = {
    unit: 'M²',
    quantity: 100,
    locations: [{ quantity: 100 }],
  };
  assert.throws(
    () => validateUnitChange(materialComSaldo, 'KG'),
    /Não é possível alterar a unidade de medida do material pois ele possui saldo físico ativo/
  );

  // Cenário 2: Material com saldo 0 M² mas prateleira com saldo residual 0.5 -> BLOQUEADO
  const materialComSaldoPrateleira = {
    unit: 'M²',
    quantity: 0,
    locations: [{ quantity: 0.5 }],
  };
  assert.throws(
    () => validateUnitChange(materialComSaldoPrateleira, 'KG'),
    /Não é possível alterar a unidade de medida do material pois ele possui saldo físico ativo/
  );

  // Cenário 3: Material totalmente zerado -> PERMITIDO
  const materialZerado = {
    unit: 'M²',
    quantity: 0,
    locations: [{ quantity: 0 }],
  };
  const novoUnit = validateUnitChange(materialZerado, 'KG');
  assert.equal(novoUnit, 'KG');

  // Cenário 4: Material com saldo 100 M² recebendo alias equivalente 'M2' -> PERMITIDO (mesma grandeza)
  const aliasEquivalente = validateUnitChange(materialComSaldo, 'M2');
  assert.equal(aliasEquivalente, 'M²');
});

test('Validação de Domínio: Bloqueio de entrada com unidade conflitante no lote de estoque (StockItemService / Import)', () => {
  // Simulação do algoritmo de validação em StockItemService.createBatch e executeImportTransaction
  const validateBatchEntry = (
    existingMaterial: { code: string; unit: string; quantity: number },
    incomingUnit: string
  ) => {
    const currentNorm = normalizeUnit(existingMaterial.unit, 'CORTE');
    const incomingNorm = normalizeUnit(incomingUnit, 'CORTE');
    const totalQty = Number(existingMaterial.quantity || 0);

    if (totalQty > 0.0001 && currentNorm !== incomingNorm) {
      throw new Error(
        `Conflito de unidade: O material '${existingMaterial.code}' já possui saldo ativo de ${existingMaterial.quantity} ${existingMaterial.unit} e não aceita entrada na unidade '${incomingUnit}'. Normalize a unidade antes de realizar a entrada.`
      );
    }
    return incomingNorm;
  };

  const existing = {
    code: 'COU-001',
    unit: 'M²',
    quantity: 50.5,
  };

  // Rejeita entrada em KG para material existente em M²
  assert.throws(
    () => validateBatchEntry(existing, 'KG'),
    /Conflito de unidade: O material 'COU-001' já possui saldo ativo/
  );

  // Aceita entrada com alias compatível M2
  const acceptedUnit = validateBatchEntry(existing, 'M2');
  assert.equal(acceptedUnit, 'M²');
});

test('Importação CSV: validateImportBatch normaliza unidades canônicas por setor', () => {
  const { parseCsvRFC4180 } = require('../src/import/csvParser');
  const csv = 'setor;codigo;descricao;unidade;quantidade;prateleira\nCORTE;TEC-01;Tecido Algodão;m2;10.5;PRAT-A1\nCONSUMO;INS-01;Tinta Branca;un;5;PRAT-C1';
  const parsed = parseCsvRFC4180(csv);

  const locations = [
    { id: 1, name: 'PRAT-A1', sector: 'CORTE' as any },
    { id: 2, name: 'PRAT-C1', sector: 'CONSUMO' as any },
  ];

  const result = validateImportBatch(parsed.headers, parsed.rows, 'CORTE', locations);

  assert.equal(result.length, 2);
  assert.equal(result[0].unit, 'M²', 'CORTE deve normalizar m2 para M²');
  assert.equal(result[1].unit, 'UN', 'CONSUMO deve normalizar un para UN');
});
