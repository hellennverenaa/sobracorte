import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { SettingsController } from '../src/controllers/SettingsController';
import { tenantStorage } from '../src/context/tenantContext';

function replace(t: any, object: any, key: string, value: any) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}
function response() {
  const result = { status: 200, body: undefined as any };
  const res: any = { status(code: number) { result.status = code; return res; }, json(body: any) { result.body = body; return res; } };
  return { result, res };
}

for (const method of ['getLocations', 'getOrigins'] as const) {
  test(`${method}: filtro Distribuição inclui Expedição legada na mesma unidade`, async t => {
    let query: any;
    replace(t, method === 'getLocations' ? prisma.location : prisma.originConfig, 'findMany', async (args: any) => { query = args.where; return []; });
    const { result, res } = response();
    await tenantStorage.run({ tenantId: 1 }, () => new SettingsController()[method]({
      tenant: { id: 1 }, user: { role: 'admin' }, query: { sector: 'DISTRIBUICAO' },
    } as any, res));
    assert.equal(result.status, 200);
    assert.equal(query.factoryUnitId, 1);
    assert.deepEqual(query.OR, [{ sector: 'DISTRIBUICAO' }, { sector: 'EXPEDICAO' }, { sector: null }]);
  });
}

for (const mode of ['SELECTED', 'ALL']) {
  test(`edição ${mode}: lista vazia ${mode === 'SELECTED' ? 'não remove categoria usada' : 'permite todas as categorias'}`, async t => {
    let writes = 0;
    replace(t, prisma.location, 'findFirst', async () => ({ id: 2, name: 'Área de Triagem', categoryMode: 'SELECTED', sector: null, subsectorId: null }));
    replace(t, prisma, '$transaction', async (callback: any) => callback({
      $queryRaw: async () => [],
      stockItemLocation: { findMany: async () => [{ quantity: 5, stockItem: { sector: 'CORTE', categoryId: 10 } }] },
      locationCategory: { deleteMany: async () => { writes++; } },
      location: { update: async ({ data }: any) => { writes++; return data; } },
      stockMovement: { create: async () => { writes++; } },
    }));
    const { result, res } = response();
    await tenantStorage.run({ tenantId: 1 }, () => new SettingsController().updateLocation({
      tenant: { id: 1 }, user: { role: 'admin' }, params: { id: '2' },
      body: { categoryMode: mode, categoryIds: [] },
    } as any, res));
    assert.equal(result.status, mode === 'SELECTED' ? 400 : 200);
    if (mode === 'SELECTED') {
      assert.match(result.body.error, /não pode perder a categoria/);
      assert.equal(writes, 0);
    } else assert.equal(writes, 3);
  });
}
