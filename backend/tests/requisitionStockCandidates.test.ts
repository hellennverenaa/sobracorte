import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { RequisitionService } from '../src/services/RequisitionService';
import { findRequisitionStockCandidates, findUnverifiedRequisitionStockMatches } from '../src/services/requisitionStock';
import { RequisitionItemInputSchema } from '../src/types/stock.dto';

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
    requisitionStockCompatibility: { findMany: async () => [] },
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
  const tx: any = transactionFor([stockItem()]);
  tx.$queryRaw = async () => [];
  (prisma as any).$transaction = async (callback: (transaction: any) => unknown) => callback(tx);

  const service = new RequisitionService();
  await assert.rejects(service.createRequisition({
    items: [{
      ...mountingRequest(),
      sourceCandidateId: 'stock:101',
      quantityRequested: 1,
      reason: 'REPOSIÇÃO',
      confirmSourceSuggestion: false,
    }],
  } as any, { factoryUnitId: 7, role: 'admin' } as any), /Confirme que a sugestão/);
});

test('DTO mantém falsa a confirmação ausente, preservando payloads legados', () => {
  const parsed = RequisitionItemInputSchema.parse({
    requestSector: 'MONTAGEM',
    quantityRequested: 1,
    reason: 'REPOSIÇÃO',
  });
  assert.equal(parsed.confirmSourceSuggestion, false);
});
