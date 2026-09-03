import assert from 'node:assert/strict';
import test from 'node:test';
import { ImportValidationError, importMaterials } from '../src/import/materialImport';

function fakeClient() {
  let transactionCalls = 0;
  const created: any[] = [];
  const client: any = {
    categoryConfig: { findMany: async () => [{ id: 1, name: 'TECIDO', unitLocked: false }] },
    unitConfig: { findMany: async () => [{ id: 2, name: 'Metro', symbol: 'm', active: true }] },
    location: { findMany: async () => [{ id: 3, name: 'A-01', categories: [{ categoryId: 1 }] }] },
    originConfig: { findMany: async () => [{ id: 4, name: 'Outros' }] },
    material: { findMany: async () => [], create: async () => ({ id: 9 }) },
    $transaction: async (callback: any) => {
      transactionCalls += 1;
      const tx: any = {
        material: { create: async (args: any) => { created.push(args); return { id: 9 }; } },
        movement: { create: async (args: any) => { created.push(args); return args; } },
      };
      return callback(tx);
    },
    get transactionCalls() { return transactionCalls; },
    get created() { return created; },
  };
  return client;
}

test('importação válida resolve IDs, snapshots e usa uma transação', async () => {
  const client = fakeClient();
  const result = await importMaterials(10, [{ code: '1001', name: 'Tecido preto', category: 'TECIDO', unit: 'm', location: 'A-01', quantity: '150.0' }], undefined, client);
  assert.deepEqual(result, { inseridos: 1, processados: 1 });
  assert.equal(client.transactionCalls, 1);
  assert.equal(client.created[0].data.quantity, '150.000');
  assert.equal(client.created[1].data.materialCode, '1001');
  assert.equal(client.created[1].data.originId, 4);
});

test('falha de domínio impede a transação e retorna linha', async () => {
  const client = fakeClient();
  await assert.rejects(
    importMaterials(10, [{ code: '1001', name: 'Tecido', category: 'COURO', unit: 'm', location: 'A-01', quantity: '1' }], undefined, client),
    (error: unknown) => {
      assert.ok(error instanceof ImportValidationError);
      assert.equal(error.errors[0].line, 1);
      return true;
    },
  );
  assert.equal(client.transactionCalls, 0);
});
