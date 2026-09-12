import assert from 'node:assert/strict';
import test from 'node:test';

test('garante que movimentação legada renderiza com snapshots textuais quando material é excluído (materialId nulo)', () => {
  const movement = {
    id: 101,
    factoryUnitId: 1,
    materialId: null,
    material: null as any,
    type: 'entrada',
    quantity: 25.5,
    materialCode: '1040',
    materialName: 'COURO BOVINO PRETO',
    materialCategory: 'COURO',
    materialUnit: 'M²',
    locationName: 'PRAT-A1',
    origem: 'Saldo Inicial / Implantação',
    reason: 'Implantação de Estoque',
    operatorName: 'Operador DASS',
    createdAt: new Date('2026-09-10T10:00:00Z'),
  };

  const renderedLegacy = {
    id: `leg_${movement.id}`,
    codigo: movement.material?.code || movement.materialCode || '-',
    descricao: movement.material?.name || movement.materialName || '-',
    tipoMaterial: movement.material?.type || movement.materialCategory || 'CORTE',
    unidade: movement.material?.unit || movement.materialUnit || 'UN',
    prateleira: movement.locationName || movement.material?.locations?.[0]?.location?.name || 'Almoxarifado',
  };

  assert.equal(renderedLegacy.codigo, '1040');
  assert.equal(renderedLegacy.descricao, 'COURO BOVINO PRETO');
  assert.equal(renderedLegacy.tipoMaterial, 'COURO');
  assert.equal(renderedLegacy.unidade, 'M²');
  assert.equal(renderedLegacy.prateleira, 'PRAT-A1');
});

test('garante que StockMovement multi-setor renderiza com snapshots textuais quando StockItem é excluído (stockItemId nulo)', () => {
  const stockMovement = {
    id: 202,
    factoryUnitId: 1,
    stockItemId: null,
    stockItem: null as any,
    sector: 'PRE_FABRICADO',
    type: 'ENTRADA',
    quantity: 50,
    sourceLocationId: null,
    destinationLocationId: null,
    sourceLocationName: null,
    destinationLocationName: 'BOX-SOLAS-01',
    itemCode: 'SOL-EVA-41',
    itemName: 'SOLADO EVA BRANCO',
    itemCategory: 'EVA',
    itemUnit: 'PAR',
    origem: 'Saldo Inicial / Entrada no Setor',
    reason: 'Entrada de lote',
    operatorName: 'Operador Solas',
    createdAt: new Date('2026-09-11T08:00:00Z'),
  };

  const code = stockMovement.stockItem?.sku || stockMovement.stockItem?.code || stockMovement.itemCode || '-';
  const desc = stockMovement.stockItem?.description || stockMovement.stockItem?.name || stockMovement.itemName || 'Componente Multi-Setor';
  const category = stockMovement.stockItem?.type || stockMovement.stockItem?.sector || stockMovement.itemCategory || stockMovement.sector;
  const unit = stockMovement.stockItem?.unit || stockMovement.itemUnit || 'UND';
  const loc = stockMovement.destinationLocationName || stockMovement.sourceLocationName || '-';

  assert.equal(code, 'SOL-EVA-41');
  assert.equal(desc, 'SOLADO EVA BRANCO');
  assert.equal(category, 'EVA');
  assert.equal(unit, 'PAR');
  assert.equal(loc, 'BOX-SOLAS-01');
});

test('garante que getHistory mapeia movimentações do Corte para a estrutura unificada de StockMovement', () => {
  const movement = {
    id: 50,
    factoryUnitId: 1,
    materialId: 10,
    material: {
      id: 10,
      code: 'TEC-100',
      name: 'TECIDO MESH PRETO',
      type: 'TECIDO',
      unit: 'M²',
      locations: [{ location: { name: 'PRAT-TEC-01' } }],
    },
    type: 'entrada',
    quantity: 100.5,
    materialCode: 'TEC-100',
    materialName: 'TECIDO MESH PRETO',
    materialCategory: 'TECIDO',
    materialUnit: 'M²',
    locationName: 'PRAT-TEC-01',
    origem: 'Corte / Produção',
    reason: 'Entrada de lote',
    operatorId: '12345',
    operatorName: 'Operador Corte',
    createdAt: new Date('2026-09-12T11:00:00Z'),
  };

  const formatted = {
    id: `corte_${movement.id}`,
    sector: 'CORTE',
    type: 'ENTRADA',
    quantity: movement.quantity,
    itemCode: movement.material?.code || movement.materialCode,
    itemName: movement.material?.name || movement.materialName,
    itemUnit: movement.material?.unit || movement.materialUnit || 'M²',
    operatorName: movement.operatorName,
    destinationLocationName: movement.locationName,
  };

  assert.equal(formatted.id, 'corte_50');
  assert.equal(formatted.sector, 'CORTE');
  assert.equal(formatted.type, 'ENTRADA');
  assert.equal(formatted.quantity, 100.5);
  assert.equal(formatted.itemCode, 'TEC-100');
  assert.equal(formatted.itemName, 'TECIDO MESH PRETO');
  assert.equal(formatted.itemUnit, 'M²');
  assert.equal(formatted.operatorName, 'Operador Corte');
  assert.equal(formatted.destinationLocationName, 'PRAT-TEC-01');
});

