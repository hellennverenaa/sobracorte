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
