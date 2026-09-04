import assert from 'node:assert/strict';
import test from 'node:test';
import { MaterialController } from '../src/controllers/MaterialController';
import { prisma } from '../src/prisma';

type MaterialState = {
  quantity: string;
  locationQuantities: string[];
};

async function attemptDelete(state: MaterialState) {
  let audits = 0;
  let deletions = 0;
  let isolationLevel: unknown;
  const tx: any = {
    material: {
      findFirst: async () => ({
        id: 10,
        code: 'MAT-10',
        name: 'Material',
        quantity: state.quantity,
        factoryUnitId: 1,
        category: { name: 'TECIDO' },
        unit: { symbol: 'm' },
        locations: state.locationQuantities.map((quantity, index) => ({
          locationId: index + 1,
          quantity,
          location: { name: `A-${index + 1}` },
        })),
      }),
      delete: async () => { deletions += 1; },
    },
    materialDeletionAudit: {
      create: async () => { audits += 1; },
    },
  };

  const originalTransaction = prisma.$transaction;
  (prisma as any).$transaction = async (callback: (client: any) => unknown, options: any) => {
    isolationLevel = options?.isolationLevel;
    return callback(tx);
  };
  const response = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const request = {
    params: { id: '10' },
    tenant: { id: 1, code: 'SEST', name: 'Santo Estêvão' },
    user: { usuario: 'TESTE', nome: 'Usuário', matricula: 123 },
  };

  try {
    await new MaterialController().delete(request as any, response as any);
  } finally {
    (prisma as any).$transaction = originalTransaction;
  }

  return { response, audits, deletions, isolationLevel };
}

test('recusa excluir material com saldo total', async () => {
  const result = await attemptDelete({ quantity: '2.000', locationQuantities: ['2.000'] });
  assert.equal(result.response.statusCode, 409);
  assert.match(result.response.body.error, /estoque estiver zerado/);
  assert.equal(result.audits, 0);
  assert.equal(result.deletions, 0);
});

test('recusa excluir material com saldo em localização mesmo se o total estiver inconsistente', async () => {
  const result = await attemptDelete({ quantity: '0.000', locationQuantities: ['1.000'] });
  assert.equal(result.response.statusCode, 409);
  assert.equal(result.audits, 0);
  assert.equal(result.deletions, 0);
});

test('exclui e audita material completamente zerado em transação serializável', async () => {
  const result = await attemptDelete({ quantity: '0.000', locationQuantities: ['0.000'] });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.audits, 1);
  assert.equal(result.deletions, 1);
  assert.equal(result.isolationLevel, 'Serializable');
});
