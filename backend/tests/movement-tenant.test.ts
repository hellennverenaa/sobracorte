import assert from 'node:assert/strict';
import test from 'node:test';
import { MovementController } from '../src/controllers/MovementController';
import { prisma } from '../src/prisma';

type Scenario = 'material' | 'location' | 'origin';

async function runScenario(missing: Scenario) {
  let mutations = 0;
  const tx: any = {
    material: {
      findFirst: async () => missing === 'material' ? null : {
        id: 10, code: 'MAT-10', name: 'Material', categoryId: 20,
        category: { name: 'TECIDO' }, unit: { symbol: 'm' },
      },
      update: async () => { mutations += 1; },
    },
    location: {
      findFirst: async () => missing === 'location' ? null : { id: 30, name: 'A-01' },
    },
    locationCategory: {
      findFirst: async () => ({ locationId: 30, categoryId: 20, factoryUnitId: 1 }),
    },
    originConfig: {
      findFirst: async () => missing === 'origin' ? null : { id: 40, name: 'Consumo' },
    },
    materialLocation: {
      upsert: async () => { mutations += 1; },
    },
    movement: {
      create: async () => { mutations += 1; },
    },
  };

  const originalTransaction = prisma.$transaction;
  (prisma as any).$transaction = async (callback: (client: any) => unknown) => callback(tx);
  const response = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const request = {
    body: { materialId: 10, quantity: '1', type: 'entrada', locationId: 30, originId: 40 },
    tenant: { id: 1, code: 'SEST', name: 'Santo Estêvão' },
    user: { usuario: 'TESTE', nome: 'Usuário', matricula: 123 },
  };

  try {
    await new MovementController().create(request as any, response as any);
  } finally {
    (prisma as any).$transaction = originalTransaction;
  }
  return { response, mutations };
}

test('não movimenta material de outra unidade', async () => {
  const result = await runScenario('material');
  assert.equal(result.response.statusCode, 404);
  assert.match(result.response.body.error, /Material/);
  assert.equal(result.mutations, 0);
});

test('não movimenta usando localização de outra unidade', async () => {
  const result = await runScenario('location');
  assert.equal(result.response.statusCode, 404);
  assert.match(result.response.body.error, /Localização/);
  assert.equal(result.mutations, 0);
});

test('não movimenta usando origem de outra unidade', async () => {
  const result = await runScenario('origin');
  assert.equal(result.response.statusCode, 400);
  assert.match(result.response.body.error, /Origem/);
  assert.equal(result.mutations, 0);
});
