import assert from 'node:assert/strict';
import test from 'node:test';
import { syncUser } from '../src/controllers/AuthController';

function clientWith(users: any[]) {
  return {
    user: {
      findUnique: async ({ where }: any) => users.find((user) =>
        user.factoryUnitId === where.factoryUnitId_authOrigin_authUserId.factoryUnitId &&
        user.authOrigin === where.factoryUnitId_authOrigin_authUserId.authOrigin &&
        user.authUserId === where.factoryUnitId_authOrigin_authUserId.authUserId,
      ) ?? null,
      findMany: async ({ where, take }: any) => users.filter((user) => user.factoryUnitId === where.factoryUnitId &&
        (user.authOrigin === null || user.authOrigin === 'LEGADO') &&
        (user.usuario === 'USER.TESTE' || user.matriculaDass === 100n)).slice(0, take),
      update: async ({ where, data }: any) => {
        const selector = where.id_factoryUnitId;
        const user = users.find((candidate) =>
          candidate.id === selector.id && candidate.factoryUnitId === selector.factoryUnitId,
        )!;
        Object.assign(user, data);
        return user;
      },
      create: async ({ data }: any) => {
        const user = { id: users.length + 1, ...data };
        users.push(user);
        return user;
      },
    },
  };
}

const external = { usuario: 'USER.TESTE', matricula: '100', unidade: 'SEST', origem: 'EXTERNO', id: 'provider-1', nome: 'Nome externo' } as any;

test('identidade estável separa origens e mantém RBAC local ao sincronizar', async () => {
  const users: any[] = [{ id: 1, factoryUnitId: 1, authOrigin: 'OUTRO_PROVEDOR', authUserId: 'provider-1', usuario: 'USER.TESTE', matriculaDass: 100n, role: 'lider', assignedSector: 'CORTE' }];
  const client = clientWith(users);
  const created = await syncUser(external, 1, client);
  assert.equal(created.id, 2);
  assert.equal(users[0].role, 'lider');

  const updated = await syncUser({ ...external, nome: 'Nome atualizado' }, 1, client);
  assert.equal(updated.id, 2);
  assert.equal(updated.role, 'leitor');
  updated.role = 'movimentador';
  updated.assignedSector = 'APOIO';
  await syncUser(external, 1, client);
  assert.equal(updated.role, 'movimentador');
  assert.equal(updated.assignedSector, 'APOIO');
});

test('primeiro login vincula apenas perfil legado da mesma unidade', async () => {
  const users: any[] = [
    { id: 1, factoryUnitId: 1, authOrigin: null, authUserId: null, usuario: 'USER.TESTE', matriculaDass: 100n, role: 'lider', assignedSector: 'CORTE' },
    { id: 2, factoryUnitId: 2, authOrigin: null, authUserId: null, usuario: 'USER.TESTE', matriculaDass: 100n, role: 'admin' },
  ];
  const user = await syncUser(external, 1, clientWith(users));
  assert.equal(user.id, 1);
  assert.equal(user.authOrigin, 'EXTERNO');
  assert.equal(user.authUserId, 'provider-1');
  assert.equal(user.role, 'lider');
  assert.equal(users[1].authOrigin, null);
});

test('primeiro login não herda RBAC quando o vínculo legado é ambíguo', async () => {
  const users: any[] = [
    { id: 1, factoryUnitId: 1, authOrigin: null, authUserId: null, usuario: 'USER.TESTE', matriculaDass: 100n, role: 'admin' },
    { id: 2, factoryUnitId: 1, authOrigin: 'LEGADO', authUserId: 'old-user', usuario: 'USER.TESTE', matriculaDass: 100n, role: 'lider' },
  ];
  const user = await syncUser(external, 1, clientWith(users));
  assert.equal(user.id, 3);
  assert.equal(user.role, 'leitor');
  assert.equal(users[0].authOrigin, null);
  assert.equal(users[1].authOrigin, 'LEGADO');
});
