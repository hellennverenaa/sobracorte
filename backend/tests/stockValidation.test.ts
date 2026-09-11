import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CorteItemSchema,
  ApoioItemSchema,
  PreFabricadoItemSchema,
  DistribuicaoItemSchema,
  MontagemItemSchema,
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


