import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { ReportController } from '../src/controllers/ReportController';
import { DashboardController } from '../src/controllers/DashboardController';
import { StockMovementService } from '../src/services/StockMovementService';
import { movementSnapshot } from '../src/services/movementSnapshot';

function replace(t: any, target: any, methods: Record<string, any>) {
  for (const [name, method] of Object.entries(methods)) {
    const original = target[name];
    target[name] = method;
    t.after(() => { target[name] = original; });
  }
}

function capture() {
  let body: any;
  const chunks: string[] = [];
  return {
    get body() { return body; }, chunks,
    res: { json(value: any) { body = value; }, status() { return this; },
      setHeader() {}, write(value: string) { chunks.push(value); }, end() {}, headersSent: false } as any,
  };
}

const historical = {
  id: 1, factoryUnitId: 1, sector: 'MONTAGEM', type: 'SAIDA_REQUISICAO', quantity: 3,
  createdAt: new Date('2026-09-17T12:00:00Z'), sourceLocationId: 10,
  sourceLocationName: 'Local original',
  ...movementSnapshot({ sku: 'SKU-original', productName: 'Modelo original', description: 'Descrição original',
    type: 'CABEDAL', unit: 'UND', sizeGrade: '40', footSide: 'E', color: 'AZUL' }),
  stockItem: { sku: 'SKU-renomeado', productName: 'Modelo novo', description: 'Descrição nova',
    type: 'OUTRO', unit: 'KG', sizeGrade: '41', footSide: 'D', color: 'VERMELHO' },
};

test('relatório e CSV incluem requisições e preservam snapshots após renomeação e exclusão', async t => {
  const rows = [historical, { ...historical, id: 2, stockItem: null }];
  const groups = [{ type: 'SAIDA_REQUISICAO', sector: 'MONTAGEM', itemUnit: 'UND',
    _count: { _all: 2 }, _sum: { quantity: 6 } }];
  let csv = false;
  let batch = 0;
  replace(t, prisma.stockMovement, {
    findMany: async (args: any) => {
      assert.ok(args.where.type.in.includes('SAIDA_REQUISICAO'));
      if (args.where.AND?.[0]?.OR?.some((part: any) => part.sourceStockItemId)) {
        assert.ok(args.where.AND[0].OR.some((part: any) => part.sourceStockItemId === 1));
        assert.ok(args.where.OR.some((part: any) => part.operatorName));
      }
      if (args.where.AND?.[0]?.OR?.some((part: any) => part.itemModelName)) {
        const criteria = args.where.AND[0].OR;
        assert.ok(criteria.some((part: any) => part.itemModelName?.contains === 'Modelo original'));
        assert.ok(criteria.some((part: any) => part.itemModelName === null && part.stockItem?.productName));
      }
      return csv && batch++ > 0 ? [] : rows;
    },
    count: async () => 2,
    aggregate: async () => ({ _sum: { quantity: 6 } }),
    groupBy: async () => groups,
  });
  replace(t, prisma.location, { findMany: async () => [{ id: 10, name: 'Local renomeado' }] });
  const controller = new ReportController();
  for (const movementType of ['SAIDA', 'TODOS']) {
    const result = capture();
    await controller.movements({ user: { role: 'admin' }, tenant: { id: 1 }, query: { movementType, search: 'Modelo original' } } as any, result.res);
    assert.equal(result.body.totals.qtdOperacoesSaida, 2);
    assert.equal(result.body.totals.volumeTotalSaida, 6);
    for (const item of result.body.items) {
      assert.equal(item.codigo, 'SKU-original');
      assert.equal(item.nomeModelo, 'Modelo original');
      assert.equal(item.descricao, 'Descrição original');
      assert.equal(item.unidade, 'UND');
      assert.equal(item.gradeTamanho, '40');
      assert.equal(item.ladoPe, 'E');
      assert.equal(item.cor, 'AZUL');
      assert.equal(item.prateleira, 'Local original');
    }
    csv = true; batch = 0;
    const exported = capture();
    await controller.exportMovements({ user: { role: 'admin' }, tenant: { id: 1 }, query: { movementType, search: 'Modelo original' } } as any, exported.res);
    assert.equal(exported.chunks.length, 3);
    assert.match(exported.chunks[1], /SAIDA_REQUISICAO.*SKU-original.*Descrição original.*CABEDAL.*40.*E.*UND.*Local original/);
    assert.doesNotMatch(exported.chunks.join(''), /renomeado|Descrição nova|Modelo novo|VERMELHO/);
    csv = false;
  }
  const history = await new StockMovementService().getHistory({ type: 'SAIDA', stockItemId: 1, operatorId: 'Operador', page: 1, limit: 20 } as any, { factoryUnitId: 1, role: 'admin' } as any);
  assert.equal(history.total, 2);
});

test('subtotais mistos não somam KG e M²; aliases da mesma unidade são agregados', async t => {
  const groups = [
    { type: 'SAIDA_REQUISICAO', sector: 'CORTE', itemUnit: 'KG', _count: { _all: 1 }, _sum: { quantity: 2 } },
    { type: 'SAIDA_REQUISICAO', sector: 'CORTE', itemUnit: 'M²', _count: { _all: 1 }, _sum: { quantity: 3 } },
    { type: 'SAIDA_REQUISICAO', sector: 'CORTE', itemUnit: 'M2', _count: { _all: 1 }, _sum: { quantity: 4 } },
  ];
  replace(t, prisma.stockMovement, {
    findMany: async () => [], count: async () => 3, aggregate: async () => ({ _sum: { quantity: 9 } }),
    groupBy: async () => groups,
  });
  replace(t, prisma.location, { findMany: async () => [] });
  const result = capture();
  await new ReportController().movements({ user: { role: 'admin' }, tenant: { id: 1 }, query: {} } as any, result.res);
  const totals = result.body.totals;
  assert.equal(totals.volumeTotalSaida, null);
  assert.equal(totals.porSetor.CORTE.quantidadeTotal, null);
  assert.equal(totals.porTipo.SAIDA_REQUISICAO.quantidadeTotal, null);
  assert.deepEqual(totals.porSetor.CORTE.porUnidade, { KG: { quantidadeTotal: 2 }, 'M²': { quantidadeTotal: 7 } });
  assert.equal(totals.volumePorUnidade['M²'].saida, 7);
});

test('dashboard separa volumes de saída e calcula origem pela contagem de registros', async t => {
  replace(t, prisma.stockItem, { count: async () => 0, aggregate: async () => ({ _sum: { quantity: 0 } }), groupBy: async (args: any) => {
    if (args.by[0] === 'type') {
      assert.deepEqual(args._count, { _all: true });
      assert.equal(args._sum, undefined);
      return [{ type: 'TECIDO', _count: { _all: 3 } }];
    }
    return [];
  }, findMany: async () => [] });
  replace(t, prisma.stockMovement, {
    count: async () => 0, aggregate: async () => ({ _sum: { quantity: 0 } }),
    groupBy: async (args: any) => {
      if (args.by.includes('origem')) return args.where.sector === 'CORTE'
        ? [{ origem: 'Origem A', _count: { _all: 1 }, _sum: { quantity: 1000 } }]
        : [{ origem: 'Origem B', sector: 'APOIO', _count: { _all: 3 }, _sum: { quantity: 1 } }];
      if (args.by[0] === 'itemUnit') return args.where.sector === 'CORTE'
        ? [{ itemUnit: 'KG', _sum: { quantity: 2 } }, { itemUnit: 'M2', _sum: { quantity: 3 } }, { itemUnit: 'M²', _sum: { quantity: 4 } }]
        : [];
      return [];
    },
  });
  replace(t, prisma, { $queryRaw: async () => [] });
  const result = capture();
  await new DashboardController().getSummary({ tenant: { id: 1 }, user: { role: 'admin' } } as any, result.res);
  assert.equal(result.body.distribuicao[0]._count._all, 3);
  assert.deepEqual(result.body.setores.corte.exitsByUnit, { KG: 2, 'M²': 7 });
  assert.equal(result.body.setores.corte.totalExitsVolume, null);
  assert.equal(result.body.origemSobras[0].origem, 'Origem B');
  assert.equal(result.body.origemSobras[0].percentage, 75);
  assert.equal(result.body.origemSobras[1].percentage, 25);
});
