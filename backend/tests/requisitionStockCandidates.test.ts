import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { RequisitionService } from '../src/services/RequisitionService';
import { findRequisitionIdsWithinStockScope, findRequisitionStockCandidates, findUnverifiedRequisitionStockMatches } from '../src/services/requisitionStock';
import { StockItemService } from '../src/services/StockItemService';
import { CheckStockAvailabilitySchema, RequisitionItemInputSchema } from '../src/types/stock.dto';

const stockItem = (overrides: Record<string, unknown> = {}) => ({
  id: 101,
  factoryUnitId: 7,
  sector: 'APOIO',
  componentType: 'PECA_CORTADA',
  pieceCode: 'CUT-101',
  sku: null,
  code: null,
  productName: 'RACER SPEEDZONE',
  description: 'GASPEA EXTERNA',
  name: 'GASPEA EXTERNA',
  type: 'PECA_CORTADA',
  color: null,
  materialColor: 'BLACK',
  sizeGrade: '40',
  footSide: 'E',
  unit: 'UN',
  quantity: 8,
  locations: [{ quantity: 8, location: { name: 'PRATELEIRA A' } }],
  ...overrides,
});

function matchesWhere(record: Record<string, any>, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return condition.every((part: Record<string, any>) => matchesWhere(record, part));
    if (key === 'OR') return condition.some((part: Record<string, any>) => matchesWhere(record, part));
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('in' in condition && !condition.in.includes(record[key])) return false;
      if ('gt' in condition && !(Number(record[key]) > Number(condition.gt))) return false;
      if ('gte' in condition && !(Number(record[key]) >= Number(condition.gte))) return false;
      if ('not' in condition && record[key] === condition.not) return false;
      if ('equals' in condition) {
        const actual = String(record[key] ?? '');
        const expected = String(condition.equals ?? '');
        if (condition.mode === 'insensitive' ? actual.toUpperCase() !== expected.toUpperCase() : actual !== expected) return false;
      }
      return true;
    }
    return record[key] === condition;
  });
}

function transactionFor(rows: Array<Record<string, any>>) {
  return {
    stockItem: {
      findMany: async ({ where }: { where: Record<string, any> }) => rows.filter(row => matchesWhere(row, where)),
    },
    requisitionStockCompatibility: { findMany: async () => { throw new Error('Regras especiais não devem ser consultadas.'); } },
  } as any;
}

const mountingRequest = (overrides: Record<string, unknown> = {}) => ({
  requestSector: 'MONTAGEM' as const,
  sku: 'SHOE-99',
  modelName: 'RACER SPEEDZONE',
  description: 'CALÇADO COMPLETO',
  color: 'BLACK',
  sizeGrade: '40',
  footSide: 'E',
  requestUnit: 'UN',
  ...overrides,
});

const apoioPieceRequest = (overrides: Record<string, unknown> = {}) => ({
  requestSector: 'APOIO' as const,
  type: 'PECA_CORTADA',
  pieceCode: 'CUT-101',
  description: 'GASPEA EXTERNA',
  modelName: 'RACER SPEEDZONE',
  color: 'BLACK',
  sizeGrade: '40',
  footSide: 'E',
  requestUnit: 'UN',
  ...overrides,
});

const apoioUpperRequest = (overrides: Record<string, unknown> = {}) => ({
  requestSector: 'APOIO' as const,
  type: 'CABEDAL',
  sku: 'CAB-204',
  description: 'CABEDAL EXTERNO',
  modelName: 'RACER SPEEDZONE',
  color: 'BLACK/WHITE',
  sizeGrade: '40',
  footSide: 'PAR',
  requestUnit: 'PAR',
  ...overrides,
});

test('Admin de Setor visualiza requisições próprias e as recebidas pelo setor fornecedor autorizado', async () => {
  let query: any;
  const ids = await findRequisitionIdsWithinStockScope({
    $queryRaw: async (statement: any) => { query = statement; return [{ id: 'REQ-1' }]; },
  }, 7, { role: 'admin_setor', assignedSector: 'DISTRIBUICAO', subsectorIds: [9] });
  const sqlText = String(query?.sql || query?.text || query?.strings?.join(' '));

  assert.deepEqual(ids, ['REQ-1']);
  assert.match(sqlText, /r\."sourceSector"/);
  assert.match(sqlText, /sourceStockItemIds/);
  assert.match(sqlText, /SubsectorConfig/);
});

test('sugere Peças Cortadas pelo modelo e variantes, com confirmação explícita', async () => {
  const tx = transactionFor([stockItem({ footSide: null })]);
  const candidates = await findRequisitionStockCandidates(tx, 7, mountingRequest());

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceSector, 'APOIO');
  assert.equal(candidates[0].quantity, 8);
  assert.equal(candidates[0].requiresConfirmation, true);
  assert.deepEqual(candidates[0].confirmationDetails, ['lado do pé não está cadastrado no estoque fornecedor']);
  assert.match(candidates[0].reason, /Modelo\/linha/);
  assert.deepEqual(candidates[0].locations, ['PRATELEIRA A (8)']);
});

test('não sugere correspondência por modelo quando uma variante informada diverge', async () => {
  const tx = transactionFor([stockItem({ materialColor: 'RED' })]);
  const candidates = await findRequisitionStockCandidates(tx, 7, mountingRequest());
  assert.deepEqual(candidates, []);
});

test('APOIO encontra peça cortada pelo pieceCode e rejeita tipo, modelo, material, grade e lado incompatíveis', async () => {
  const exact = stockItem({
    id: 401,
    componentType: 'PECA_CORTADA',
    type: 'PECA_CORTADA',
    pieceCode: 'CUT-101',
    sku: null,
    materialColor: 'BLACK',
    sizeGrade: '40',
    footSide: 'E',
    quantity: 7,
    locations: [{ quantity: 7, location: { name: 'AP-01' } }],
  });
  const wrongIdentifierField = stockItem({ id: 402, pieceCode: 'OTHER', sku: 'CUT-101' });
  const wrongComponent = stockItem({ id: 403, componentType: 'CABEDAL', type: 'CABEDAL', sku: 'CUT-101', pieceCode: null });
  const wrongModel = stockItem({ id: 404, productName: 'OTHER MODEL' });
  const wrongMaterial = stockItem({ id: 405, materialColor: 'RED' });
  const wrongGrade = stockItem({ id: 406, sizeGrade: '41' });
  const wrongSide = stockItem({ id: 407, footSide: 'D' });
  const candidates = await findRequisitionStockCandidates(transactionFor([
    exact, wrongIdentifierField, wrongComponent, wrongModel, wrongMaterial, wrongGrade, wrongSide,
  ]), 7, apoioPieceRequest({ description: 'DESCRIÇÃO INFORMADA PELO SOLICITANTE' }));

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].sourceStockItemIds, [401]);
  assert.equal(candidates[0].quantity, 7);
  assert.deepEqual(candidates[0].locations, ['AP-01 (7)']);
});

test('APOIO encontra cabedal pelo SKU, incluindo PAR completo, sem aceitar variantes incompatíveis', async () => {
  const exact = stockItem({
    id: 411,
    componentType: 'CABEDAL',
    type: 'CABEDAL',
    sku: 'CAB-204',
    pieceCode: null,
    description: 'CABEDAL EXTERNO',
    color: 'BLACK/WHITE',
    sizeGrade: '40',
    footSide: 'PAR',
    quantity: 5,
    locations: [{ quantity: 5, location: { name: 'AP-04' } }],
  });
  const wrongIdentifierField = stockItem({ id: 412, componentType: 'PECA_CORTADA', type: 'PECA_CORTADA', pieceCode: 'CAB-204', sku: null });
  const wrongModel = stockItem({ id: 413, componentType: 'CABEDAL', type: 'CABEDAL', sku: 'CAB-204', productName: 'OTHER MODEL', footSide: 'PAR' });
  const wrongColor = stockItem({ id: 414, componentType: 'CABEDAL', type: 'CABEDAL', sku: 'CAB-204', color: 'BLACK', footSide: 'PAR' });
  const wrongGrade = stockItem({ id: 415, componentType: 'CABEDAL', type: 'CABEDAL', sku: 'CAB-204', sizeGrade: '41', footSide: 'PAR' });
  const wrongSide = stockItem({ id: 416, componentType: 'CABEDAL', type: 'CABEDAL', sku: 'CAB-204', footSide: 'E' });
  const candidates = await findRequisitionStockCandidates(transactionFor([
    exact, wrongIdentifierField, wrongModel, wrongColor, wrongGrade, wrongSide,
  ]), 7, apoioUpperRequest());

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].sourceStockItemIds, [411]);
  assert.equal(candidates[0].quantity, 5);
  assert.deepEqual(candidates[0].locations, ['AP-04 (5)']);
});

test('variantes não informadas mantêm candidatos separados, cada um com seu próprio saldo e localização', async () => {
  const first = stockItem({ id: 421, pieceCode: 'CUT-101', footSide: null, materialColor: 'BLACK', sizeGrade: '40', quantity: 3,
    locations: [{ quantity: 3, location: { name: 'AP-01' } }] });
  const second = stockItem({ id: 422, pieceCode: 'CUT-101', footSide: null, materialColor: 'WHITE', sizeGrade: '41', quantity: 8,
    locations: [{ quantity: 8, location: { name: 'AP-02' } }] });
  const candidates = await findRequisitionStockCandidates(transactionFor([first, second]), 7, apoioPieceRequest({
    color: undefined,
    sizeGrade: undefined,
    footSide: undefined,
  }));

  assert.deepEqual(candidates.map(candidate => candidate.sourceStockItemIds), [[421], [422]]);
  assert.deepEqual(candidates.map(candidate => candidate.quantity), [3, 8]);
  assert.deepEqual(candidates.map(candidate => candidate.locations), [['AP-01 (3)'], ['AP-02 (8)']]);
});

test('APOIO não usa correspondência parcial nem outro campo de identificador quando não há item exato', async () => {
  const rows = [
    stockItem({ id: 431, pieceCode: 'CUT-101-ALT', sku: null }),
    stockItem({ id: 432, pieceCode: 'OTHER', sku: 'CUT-101' }),
  ];
  const candidates = await findRequisitionStockCandidates(transactionFor(rows), 7, apoioPieceRequest());
  assert.deepEqual(candidates, []);
});

test('matéria-prima do Corte consulta somente o estoque local e não cruza por código', async () => {
  const rawMaterial = stockItem({
    id: 451,
    sector: 'CORTE',
    componentType: null,
    code: 'RAW-451',
    sku: null,
    pieceCode: null,
    productName: null,
    name: 'COURO PRETO',
    description: 'COURO PRETO',
    type: 'MATERIA_PRIMA',
    color: null,
    materialColor: null,
    sizeGrade: null,
    footSide: null,
    unit: 'M²',
    quantity: 12,
    locations: [{ quantity: 12, location: { name: 'CORTE-01' } }],
  });
  const sameTextAsFinishedSku = stockItem({
    id: 452,
    sector: 'MONTAGEM',
    componentType: null,
    code: null,
    sku: 'RAW-451',
    type: 'PE_PRONTO',
  });
  const request = {
    requestSector: 'CORTE' as const,
    sku: 'RAW-451',
    description: 'COURO PRETO',
    requestUnit: 'M²',
  };
  const tx = transactionFor([rawMaterial, sameTextAsFinishedSku]);
  const candidates = await findRequisitionStockCandidates(tx, 7, request);
  const unverified = await findUnverifiedRequisitionStockMatches(tx, 7, request);

  assert.deepEqual(candidates.map(candidate => [candidate.sourceSector, candidate.sourceStockItemIds]), [['CORTE', [451]]]);
  assert.deepEqual(candidates[0].locations, ['CORTE-01 (12)']);
  assert.deepEqual(unverified, []);
});

test('busca de produto ou componente não sugere matéria-prima do Corte por SKU/modelo', async () => {
  const rawMaterial = stockItem({
    id: 453,
    sector: 'CORTE',
    componentType: null,
    code: null,
    sku: 'SHOE-99',
    type: 'MATERIA_PRIMA',
    productName: 'RACER SPEEDZONE',
    color: 'BLACK',
    sizeGrade: '40',
    footSide: 'E',
  });
  const tx = transactionFor([rawMaterial]);
  const candidates = await findRequisitionStockCandidates(tx, 7, mountingRequest());
  const unverified = await findUnverifiedRequisitionStockMatches(tx, 7, mountingRequest());

  assert.deepEqual(candidates, []);
  assert.deepEqual(unverified, []);
});

test('entre candidatos compatíveis, estoque de etapas mais prontas aparece primeiro', async () => {
  const montage = stockItem({ id: 461, sector: 'MONTAGEM', componentType: null, sku: 'COMP-461', type: 'EVA' });
  const apoio = stockItem({ id: 462, sector: 'APOIO', componentType: null, sku: 'COMP-461', type: 'EVA' });
  const candidates = await findRequisitionStockCandidates(transactionFor([apoio, montage]), 7, {
    requestSector: 'PRE_FABRICADO',
    sku: 'COMP-461',
    modelName: 'RACER SPEEDZONE',
    description: 'EVA - RACER SPEEDZONE',
    type: 'EVA',
    sizeGrade: '40',
    footSide: 'E',
    requestUnit: 'UN',
  });

  assert.deepEqual(candidates.map(candidate => candidate.sourceSector), ['MONTAGEM', 'APOIO']);
});

test('autocomplete APOIO filtra categoria e identificador exato sem agregar variantes', async t => {
  const originalFindMany = (prisma.stockItem as any).findMany;
  const queries: any[] = [];
  const cutPieceRows = [
    { id: 441, componentType: 'PECA_CORTADA', pieceCode: 'CUT-101', sku: null, productName: 'MODEL', description: 'GASPEA', sizeGrade: '40', materialColor: 'BLACK', color: null, footSide: 'E', quantity: 2 },
    { id: 442, componentType: 'PECA_CORTADA', pieceCode: 'CUT-101', sku: null, productName: 'MODEL', description: 'GASPEA', sizeGrade: '41', materialColor: 'WHITE', color: null, footSide: 'D', quantity: 6 },
  ];
  (prisma.stockItem as any).findMany = async ({ where }: any) => {
    queries.push(where);
    return cutPieceRows;
  };
  t.after(() => { (prisma.stockItem as any).findMany = originalFindMany; });

  const suggestions = await new StockItemService().getSearchSuggestions('APOIO' as any, 'CUT-101', 7, 12);
  assert.equal(queries[0].categoryId, 12);
  assert.equal(queries[0].componentType, undefined);
  assert.deepEqual(queries[0].OR, [{ sku: { equals: 'CUT-101', mode: 'insensitive' } }, { pieceCode: { equals: 'CUT-101', mode: 'insensitive' } }]);
  assert.deepEqual(suggestions.map((suggestion: any) => [suggestion.id, suggestion.availableQuantity, suggestion.sizeGrades[0]]), [
    [441, 2, '40'],
    [442, 6, '41'],
  ]);
});

test('estoque não verificado compara SKU somente com campos de código, sem confundir modelo ou descrição', async () => {
  const modelOnly = stockItem({ id: 301, sector: 'DISTRIBUICAO', componentType: null, sku: null, pieceCode: null, productName: 'SHOE-01' });
  const codeMatch = stockItem({ id: 302, sector: 'DISTRIBUICAO', componentType: 'CABEDAL', sku: null, pieceCode: 'SHOE-01' });
  const tx = transactionFor([modelOnly, codeMatch]);
  const matches = await findUnverifiedRequisitionStockMatches(tx, 7, mountingRequest({ sku: 'SHOE-01', modelName: null }));

  assert.deepEqual(matches.map(match => match.id), [302]);
  assert.match(matches[0].matchReasons.join(' '), /SKU informado/);
});

test('sugere um par fornecedor E+D sem combinar saldos de outros itens', async () => {
  const left = stockItem({ id: 201, pieceCode: 'CUT-201', footSide: 'E', quantity: 6 });
  const right = stockItem({ id: 202, pieceCode: 'CUT-201', footSide: 'D', quantity: 4 });
  const unrelated = stockItem({ id: 203, pieceCode: 'CUT-203', footSide: 'D', materialColor: 'RED', quantity: 99 });
  const tx = transactionFor([left, right, unrelated]);
  const candidates = await findRequisitionStockCandidates(tx, 7, mountingRequest({ footSide: 'PAR', requestUnit: 'PAR' }));

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].sourceStockItemIds, [201, 202]);
  assert.equal(candidates[0].quantity, 4);
  assert.equal(candidates[0].requiresConfirmation, true);
});

test('API exige confirmação para criar requisição com sugestão automática', async t => {
  const originalTransaction = prisma.$transaction;
  t.after(() => { (prisma as any).$transaction = originalTransaction; });
  const tx: any = transactionFor([stockItem({ categoryId: 12 })]);
  tx.categoryConfig = { findFirst: async () => ({ id: 12, name: 'MATERIAL', sectors: ['MONTAGEM', 'APOIO'], defaultUnitCode: 'UN', entryMode: 'SIDE_PAIR' }) };
  tx.$queryRaw = async () => [];
  (prisma as any).$transaction = async (callback: (transaction: any) => unknown) => callback(tx);

  const service = new RequisitionService();
  await assert.rejects(service.createRequisition({
    items: [{
      ...mountingRequest(), categoryId: 12,
      sourceCandidateId: 'stock:101',
      quantityRequested: 1,
      reason: 'REPOSIÇÃO',
      confirmSourceSuggestion: false,
    }],
  } as any, { factoryUnitId: 7, role: 'admin' } as any), /Confirme que a sugestão/);
});

test('DTO mantém falsa a confirmação ausente, preservando payloads legados', () => {
  const parsed = RequisitionItemInputSchema.parse({
    requestSector: 'MONTAGEM', categoryId: 12,
    quantityRequested: 1,
    reason: 'REPOSIÇÃO',
  });
  assert.equal(parsed.confirmSourceSuggestion, false);
});

test('DTO exige categoria e permite identificadores sem subtipo em APOIO', () => {
  for (const identity of [{ sku: 'CAB-204' }, { pieceCode: 'CUT-101' }]) {
    assert.equal(CheckStockAvailabilitySchema.safeParse({ requestSector: 'APOIO', categoryId: 12, description: 'MATERIAL', ...identity }).success, true);
    assert.equal(CheckStockAvailabilitySchema.safeParse({ requestSector: 'APOIO', description: 'MATERIAL', ...identity }).success, false);
  }
});

test('sugestões gerais usam trecho do identificador, prioridade de setores e escopo autorizado', async t => {
  const original = prisma.stockItem.findMany;
  t.after(() => { prisma.stockItem.findMany = original; });
  const queries: any[] = [];
  const priority = ['MONTAGEM', 'DISTRIBUICAO', 'PRE_FABRICADO', 'APOIO', 'CORTE'];
  prisma.stockItem.findMany = (async ({ where }: any) => {
    queries.push(where);
    const sectorFilter = where.AND[0].sector;
    const sector = typeof sectorFilter === 'string' ? sectorFilter : sectorFilter.in[0];
    assert.equal(where.factoryUnitId, 7);
    assert.deepEqual(where.AND[1].OR.map((entry: any) => Object.values(entry)[0]), Array(3).fill({ contains: 'SKU', mode: 'insensitive' }));
    assert.ok(where.AND.length > 2, 'consulta deve aplicar escopo do usuário');
    return [{ ...stockItem(), id: priority.indexOf(sector) + 1, sector, footSide: null }];
  }) as any;
  const service = new RequisitionService();
  const context = { factoryUnitId: 7, role: 'admin', subsectorIds: [] };
  const all = await service.searchStockSuggestions({ requestSector: 'TODOS', field: 'IDENTIFIER', query: 'SKU' }, 7, context);
  assert.deepEqual(all.map(entry => entry.sourceSector), priority);
  assert.equal(queries.length, 5);
  queries.length = 0;
  const specific = await service.searchStockSuggestions({ requestSector: 'APOIO', field: 'IDENTIFIER', query: 'SKU' }, 7, context);
  assert.equal(queries.length, 1);
  assert.deepEqual(specific.map(entry => entry.sourceSector), ['APOIO']);
});
