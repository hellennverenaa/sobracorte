import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CorteItemSchema,
  ApoioItemSchema,
  PreFabricadoItemSchema,
  DistribuicaoItemSchema,
  MontagemItemSchema,
  RequisitionItemInputSchema,
} from '../src/types/stock.dto';

test('Corte permite quantidades com casas decimais', () => {
  const parsed = CorteItemSchema.parse({
    sector: 'CORTE',
    code: 'COU-001',
    name: 'Couro Bovino Preto',
    quantity: 12.75,
    unit: 'M2',
    location: 'Prateleira A1',
  });
  assert.equal(parsed.quantity, 12.75);
});

test('Corte aceita frações em unidades contínuas e recusa em unidades discretas', () => {
  for (const unit of ['KG', 'M2', 'M', 'L']) assert.equal(CorteItemSchema.parse({ sector: 'CORTE', code: 'C7', name: 'Material', quantity: 1.5, unit, location: 'C1' }).quantity, 1.5);
  for (const unit of ['UN', 'UND', 'PC', 'PAR', 'CX', 'RL']) assert.throws(() => CorteItemSchema.parse({ sector: 'CORTE', code: 'C7', name: 'Material', quantity: 1.5, unit, location: 'C1' }), /inteiro/);
});

test('Apoio aceita apenas números inteiros e rejeita decimais', () => {
  const valid = ApoioItemSchema.parse({
    sector: 'APOIO',
    pieceCode: 'GAS-001',
    description: 'Gáspea Externa',
    materialColor: 'Napa Branca',
    sizeGrade: '38',
    quantity: 10,
    location: 'Prateleira B1',
  });
  assert.equal(valid.quantity, 10);

  assert.throws(
    () =>
      ApoioItemSchema.parse({
        sector: 'APOIO',
        pieceCode: 'GAS-001',
        description: 'Gáspea Externa',
        materialColor: 'Napa Branca',
        sizeGrade: '38',
        quantity: 10.5,
        location: 'Prateleira B1',
      }),
    /Quantidade no setor de Apoio deve ser um número inteiro/
  );
});

test('Pré-Fabricado aceita apenas números inteiros e rejeita decimais', () => {
  const valid = PreFabricadoItemSchema.parse({
    sector: 'PRE_FABRICADO',
    productName: 'Pegasus 40',
    type: 'EVA',
    color: 'BRANCO / GOMA',
    sizeGrade: '38',
    quantity: 6,
    location: 'Prateleira C1',
  });
  assert.equal(valid.quantity, 6);

  assert.throws(
    () =>
      PreFabricadoItemSchema.parse({
        sector: 'PRE_FABRICADO',
        productName: 'Pegasus 40',
        type: 'EVA',
        color: 'BRANCO / GOMA',
        sizeGrade: '38',
        quantity: 6.2,
        location: 'Prateleira C1',
      }),
    /Quantidade no setor de Pré-Fabricado deve ser um número inteiro/
  );
});

test('Distribuição aceita apenas números inteiros e rejeita decimais', () => {
  const valid = DistribuicaoItemSchema.parse({
    sector: 'DISTRIBUICAO',
    sku: 'NKE-PEG-38',
    type: 'CABEDAL',
    color: 'PRETO',
    sizeGrade: '38',
    quantity: 4,
    location: 'Prateleira D1',
  });
  assert.equal(valid.quantity, 4);

  assert.throws(
    () =>
      DistribuicaoItemSchema.parse({
        sector: 'DISTRIBUICAO',
        sku: 'NKE-PEG-38',
        type: 'CABEDAL',
        color: 'PRETO',
        sizeGrade: '38',
        quantity: 4.8,
        location: 'Prateleira D1',
      }),
    /Quantidade no setor de Distribuição deve ser um número inteiro/
  );
});

test('Montagem aceita apenas números inteiros e rejeita decimais', () => {
  const valid = MontagemItemSchema.parse({
    sector: 'MONTAGEM',
    sku: 'NKE-PEG-38',
    productName: 'Pegasus',
    color: 'AZUL',
    sizeGrade: '38',
    footSide: 'E',
    quantity: 2,
    location: 'Prateleira E1',
  });
  assert.equal(valid.quantity, 2);

  assert.throws(
    () =>
      MontagemItemSchema.parse({
        sector: 'MONTAGEM',
        sku: 'NKE-PEG-38',
        productName: 'Pegasus',
        color: 'AZUL',
        sizeGrade: '38',
        footSide: 'E',
        quantity: 2.1,
        location: 'Prateleira E1',
      }),
    /Quantidade no setor de Montagem deve ser um número inteiro/
  );
});

test('Unidade de medida padroniza como UND por padrão nos setores discretos', () => {
  const apoio = ApoioItemSchema.parse({
    sector: 'APOIO',
    pieceCode: 'MOL-01',
    description: 'Molde Teste',
    materialColor: 'PRETO',
    sizeGrade: '37',
    quantity: 5,
    location: 'PRAT-A',
  });
  assert.equal(apoio.unit, 'UND');

  const preFab = PreFabricadoItemSchema.parse({
    sector: 'PRE_FABRICADO',
    productName: 'Sola Teste',
    type: 'EVA',
    color: 'BRANCO',
    sizeGrade: '38',
    quantity: 10,
    location: 'PRAT-B',
  });
  assert.equal(preFab.unit, 'UND');

  const dist = DistribuicaoItemSchema.parse({
    sector: 'DISTRIBUICAO',
    sku: 'CAB-01',
    type: 'CABEDAL',
    color: 'AZUL',
    sizeGrade: '39',
    quantity: 8,
    location: 'PRAT-C',
  });
  assert.equal(dist.unit, 'UND');

  const mont = MontagemItemSchema.parse({
    sector: 'MONTAGEM',
    sku: 'MONT-01',
    sizeGrade: '40',
    footSide: 'E',
    quantity: 3,
    location: 'PRAT-D',
  });
  assert.equal(mont.unit, 'UND');
});

test('Combinação de cor aceita formatos padronizados (com barra e hífen)', () => {
  const preFab = PreFabricadoItemSchema.parse({
    sector: 'PRE_FABRICADO',
    productName: 'Pegasus 40',
    type: 'EVA',
    color: 'BRANCO/GOMA',
    sizeGrade: '38',
    quantity: 10,
    location: 'PRAT-B',
  });
  assert.equal(preFab.color, 'BRANCO/GOMA');

  const dist = DistribuicaoItemSchema.parse({
    sector: 'DISTRIBUICAO',
    sku: 'CAB-01',
    type: 'CABEDAL',
    color: 'PRETO-VERMELHO',
    sizeGrade: '39',
    quantity: 8,
    location: 'PRAT-C',
  });
  assert.equal(dist.color, 'PRETO-VERMELHO');
});

test('RequisitionItemInputSchema preenche CALÇADO COMPLETO por padrão quando description não informada', () => {
  const req = RequisitionItemInputSchema.parse({
    requestSector: 'MONTAGEM',
    sku: 'NKE-PEG-38',
    modelName: 'PEGASUS 40',
    sizeGrade: '38',
    footSide: 'PAR',
    quantityRequested: 2,
    reason: 'SOLA DESCOLADA NA MONTAGEM',
  });
  assert.equal(req.description, 'CALÇADO COMPLETO');
  assert.equal(req.sku, 'NKE-PEG-38');
  assert.equal(req.quantityRequested, 2);
});

test('FulfillRequisitionSchema valida quantidade positiva e rejeita zero/negativos', () => {
  const { FulfillRequisitionSchema } = require('../src/types/stock.dto');
  const valid = FulfillRequisitionSchema.parse({
    quantity: 5.5,
    observation: 'Atendimento parcial',
  });
  assert.equal(valid.quantity, 5.5);
  assert.equal(valid.observation, 'Atendimento parcial');

  assert.throws(() => {
    FulfillRequisitionSchema.parse({ quantity: 0 });
  }, /Quantidade atendida deve ser maior que zero/);

  assert.throws(() => {
    FulfillRequisitionSchema.parse({ quantity: -3 });
  }, /Quantidade atendida deve ser maior que zero/);

  assert.throws(() => {
    FulfillRequisitionSchema.parse({ quantity: 'invalido' });
  });
});

test('ExecuteMatchSchema aceita apenas quantidades inteiras e rejeita frações', () => {
  const { ExecuteMatchSchema } = require('../src/types/stock.dto');
  const valid = ExecuteMatchSchema.parse({
    leftStockItemId: 1,
    rightStockItemId: 2,
    quantity: 3,
  });
  assert.equal(valid.quantity, 3);

  assert.throws(() => {
    ExecuteMatchSchema.parse({
      leftStockItemId: 1,
      rightStockItemId: 2,
      quantity: 1.5,
    });
  }, /Quantidade a casar deve ser um número inteiro/);

  assert.throws(() => {
    ExecuteMatchSchema.parse({
      leftStockItemId: 1,
      rightStockItemId: 2,
      quantity: 0,
    });
  }, /Quantidade a casar deve ser maior que zero/);
});

test('decimalHelper realiza conversão e arredondamento determinístico com Prisma.Decimal', () => {
  const { decimalInput, decimalNumber } = require('../src/utils/decimalHelper');
  const { Prisma } = require('../src/generated/prisma');

  // Conversão de números e strings com vírgula brasileira
  const d1 = decimalInput('12,3456');
  assert.equal(d1.toString(), '12.346');

  const d2 = decimalInput(10.1);
  assert.equal(d2.toString(), '10.1');

  // Resíduos infinitesimais viram zero
  const dZero = decimalInput('0.00005');
  assert.equal(dZero.toString(), '0');

  // Tratamento de null/undefined
  assert.equal(decimalInput(null).toString(), '0');
  assert.equal(decimalInput(undefined).toString(), '0');

  // Rejeição de valores não numéricos e inválidos
  assert.throws(() => decimalInput('abc'), /Valor decimal inválido/);
  assert.throws(() => decimalInput(NaN), /Valor decimal inválido/);
  assert.throws(() => decimalInput(Infinity), /Valor decimal inválido/);

  // decimalNumber
  assert.equal(decimalNumber(new Prisma.Decimal('45.678')), 45.678);
  assert.equal(decimalNumber('78,9'), 78.9);
  assert.equal(decimalNumber(null), 0);
  assert.equal(decimalNumber('invalid'), 0);
});

