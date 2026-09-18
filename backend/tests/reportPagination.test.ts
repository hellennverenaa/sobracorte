import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { ReportController } from '../src/controllers/ReportController';

function responseCapture() {
  const result: { body?: any; statusCode?: number } = {};
  return {
    result,
    res: {
      json(body: any) {
        result.body = body;
        return this;
      },
      status(code: number) {
        result.statusCode = code;
        return this;
      },
    } as any,
  };
}

test('relatórios paginam no banco e calculam totais fora da página', async () => {
  const controller = new ReportController();
  const stockItem = prisma.stockItem as any;
  const movement = prisma.stockMovement as any;
  const requisition = prisma.materialRequisition as any;
  const location = prisma.location as any;
  const originals = {
    stockFindMany: stockItem.findMany,
    stockCount: stockItem.count,
    stockAggregate: stockItem.aggregate,
    stockGroupBy: stockItem.groupBy,
    movementFindMany: movement.findMany,
    movementCount: movement.count,
    movementAggregate: movement.aggregate,
    movementGroupBy: movement.groupBy,
    requisitionFindMany: requisition.findMany,
    requisitionCount: requisition.count,
    requisitionAggregate: requisition.aggregate,
    requisitionGroupBy: requisition.groupBy,
    locationFindMany: location.findMany,
  };

  try {
    let inventoryQuery: any;
    stockItem.findMany = async (args: any) => {
      inventoryQuery = args;
      return [{
        id: 1,
        sector: 'CORTE',
        code: 'MAT-1',
        name: 'Tecido',
        quantity: 10,
        unit: 'm²',
        locations: [],
        createdAt: new Date('2026-01-01'),
      }];
    };
    stockItem.count = async () => 251;
    stockItem.aggregate = async () => ({ _sum: { quantity: 1000 } });
    stockItem.groupBy = async () => [{ sector: 'CORTE', _count: { _all: 251 }, _sum: { quantity: 1000 } }];

    const inventoryCapture = responseCapture();
    await controller.inventory({ user: { role: 'admin' }, tenant: { id: 7 }, query: { page: '2', limit: '999' } } as any, inventoryCapture.res);
    assert.equal(inventoryQuery.skip, 200);
    assert.equal(inventoryQuery.take, 200);
    assert.equal(inventoryCapture.result.body.items.length, 1);
    assert.equal(inventoryCapture.result.body.pagination.total, 251);
    assert.equal(inventoryCapture.result.body.pagination.limit, 200);
    assert.equal(inventoryCapture.result.body.totals.quantidadeTotal, 1000);

    movement.findMany = async (args: any) => {
      assert.equal(args.skip, 50);
      assert.equal(args.take, 50);
      return [];
    };
    movement.count = async () => 101;
    movement.aggregate = async () => ({ _sum: { quantity: 500 } });
    movement.groupBy = async () => [
      { type: 'ENTRADA', sector: 'CORTE', _count: { _all: 100 }, _sum: { quantity: 400 } },
      { type: 'SAIDA', sector: 'CORTE', _count: { _all: 1 }, _sum: { quantity: 100 } },
    ];
    location.findMany = async () => [];
    const movementCapture = responseCapture();
    await controller.movements({ user: { role: 'admin' }, tenant: { id: 7 }, query: { page: '2', limit: '50' } } as any, movementCapture.res);
    assert.equal(movementCapture.result.body.items.length, 0);
    assert.equal(movementCapture.result.body.pagination.total, 101);
    assert.equal(movementCapture.result.body.totals.qtdOperacoesEntrada, 100);
    assert.equal(movementCapture.result.body.totals.volumeTotalEntrada, 400);

    requisition.findMany = async (args: any) => {
      assert.equal(args.skip, 0);
      assert.equal(args.take, 50);
      return [];
    };
    requisition.count = async () => 60;
    requisition.aggregate = async () => ({ _sum: { quantityRequested: 80, quantityFulfilled: 40 } });
    requisition.groupBy = async () => [
      { status: 'PENDENTE', _count: { _all: 50 } },
      { status: 'ATENDIDA_TOTAL', _count: { _all: 10 } },
    ];
    const requisitionCapture = responseCapture();
    await controller.requisitions({ user: { role: 'admin' }, tenant: { id: 7 }, query: {} } as any, requisitionCapture.res);
    assert.equal(requisitionCapture.result.body.pagination.total, 60);
    assert.equal(requisitionCapture.result.body.totals.totalPendentes, 50);
    assert.equal(requisitionCapture.result.body.totals.quantidadeSolicitada, 80);
  } finally {
    stockItem.findMany = originals.stockFindMany;
    stockItem.count = originals.stockCount;
    stockItem.aggregate = originals.stockAggregate;
    stockItem.groupBy = originals.stockGroupBy;
    movement.findMany = originals.movementFindMany;
    movement.count = originals.movementCount;
    movement.aggregate = originals.movementAggregate;
    movement.groupBy = originals.movementGroupBy;
    requisition.findMany = originals.requisitionFindMany;
    requisition.count = originals.requisitionCount;
    requisition.aggregate = originals.requisitionAggregate;
    requisition.groupBy = originals.requisitionGroupBy;
    location.findMany = originals.locationFindMany;
  }
});

test('exportação de inventário não duplica CORTE e continua em lotes', async () => {
  const controller = new ReportController();
  const stockItem = prisma.stockItem as any;
  const originalFindMany = stockItem.findMany;
  const rows = (count: number, sector: string, firstId: number) => Array.from({ length: count }, (_, index) => ({
    id: firstId + index,
    sector,
    code: `${sector}-${firstId + index}`,
    name: 'Material',
    type: 'tecido',
    quantity: 1,
    unit: null,
    sizeGrade: '40',
    footSide: 'E',
    createdAt: new Date('2026-01-01'),
    locations: [{ location: { name: 'A' } }],
  }));

  const corteRows = rows(501, 'CORTE', 1);
  const otherRows = rows(2, 'APOIO', 1001);
  stockItem.findMany = async (args: any) => {
    if (args.where.sector === 'CORTE') {
      return args.where.id?.gt === 500 ? corteRows.slice(500) : args.where.id?.gt ? [] : corteRows.slice(0, 500);
    }
    assert.deepEqual(args.where.sector, { not: 'CORTE' });
    return otherRows;
  };

  const chunks: string[] = [];
  const res: any = {
    headersSent: false,
    setHeader() {},
    write(chunk: string) { chunks.push(chunk); },
    end() {},
  };

  try {
    await controller.exportInventory({ user: { role: 'admin' }, tenant: { id: 7 }, query: {} } as any, res);
    const csv = chunks.join('');
    assert.equal((csv.match(/"CORTE";/g) ?? []).length, 501);
    assert.equal((csv.match(/"APOIO";/g) ?? []).length, 2);
    assert.match(chunks[1], /^"CORTE";"CORTE-1";"Material";"TECIDO";"'-";"'-";"1";"m²";"A";/);
    assert.ok(chunks[501].startsWith('"CORTE";"CORTE-501";'));
    assert.ok(chunks[502].startsWith('"APOIO";"APOIO-1001";"Material";"tecido";"40";"E";"1";"UND";"A";'));
  } finally {
    stockItem.findMany = originalFindMany;
  }
});
