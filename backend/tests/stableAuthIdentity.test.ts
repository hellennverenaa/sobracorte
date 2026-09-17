import assert from 'node:assert/strict';
import test from 'node:test';
import { syncUser } from '../src/controllers/AuthController';

function clientWith(legacyUsers: any[] = []) {
  const identities: any[] = [];
  const bindings: any[] = [];
  return {
    identities,
    bindings,
    client: {
      user: {
        findMany: async ({ where, take }: any) => legacyUsers.filter((user) =>
          user.factoryUnitId === where.factoryUnitId &&
          (user.authOrigin === null || user.authOrigin === 'LEGADO') &&
          (user.usuario === 'USER.TESTE' || user.matriculaDass === 100n)
        ).slice(0, take),
      },
      authIdentity: {
        upsert: async ({ where, update, create }: any) => {
          const key = where.nativeUnitId_authOrigin_authUserId;
          let identity = identities.find((candidate) =>
            candidate.nativeUnitId === key.nativeUnitId &&
            candidate.authOrigin === key.authOrigin &&
            candidate.authUserId === key.authUserId,
          );
          if (identity) Object.assign(identity, update);
          else {
            identity = { id: identities.length + 1, ...create };
            identities.push(identity);
          }
          return identity;
        },
      },
      userRoleBinding: {
        upsert: async ({ where, create }: any) => {
          const key = where.identityId_factoryUnitId;
          let binding = bindings.find((candidate) =>
            candidate.identityId === key.identityId && candidate.factoryUnitId === key.factoryUnitId,
          );
          if (!binding) {
            binding = { id: bindings.length + 1, ...create };
            bindings.push(binding);
          }
          return binding;
        },
      },
    },
  };
}

const external = {
  usuario: 'USER.TESTE', matricula: '100', unidade: 'SEST', origem: 'EXTERNO',
  id: 'provider-1', nome: 'Nome externo',
} as any;

test('identidades de origens diferentes não colidem nem herdam RBAC legado', async () => {
  const state = clientWith([
    { id: 1, factoryUnitId: 1, authOrigin: 'LEGADO', usuario: 'USER.TESTE', matriculaDass: 100n, role: 'lider', assignedSector: 'CORTE' },
  ]);
  const externalResult = await syncUser(external, 1, 1, false, state.client);
  const legacyResult = await syncUser({ ...external, origem: 'LEGADO', id: 'legacy-1' }, 1, 1, false, state.client);

  assert.notEqual(externalResult.identity.id, legacyResult.identity.id);
  assert.equal(externalResult.binding.role, 'leitor');
  assert.equal(legacyResult.binding.role, 'lider');
  assert.equal(state.identities.length, 2);
});

test('sincronização cadastral preserva papel e setor do vínculo local', async () => {
  const state = clientWith();
  const first = await syncUser(external, 1, 1, false, state.client);
  first.binding.role = 'movimentador';
  first.binding.assignedSector = 'APOIO';

  const second = await syncUser({ ...external, nome: 'Nome atualizado' }, 1, 1, false, state.client);
  assert.equal(second.identity.nome, 'Nome atualizado');
  assert.equal(second.binding.role, 'movimentador');
  assert.equal(second.binding.assignedSector, 'APOIO');
});

test('perfil legado ambíguo não concede RBAC', async () => {
  const state = clientWith([
    { id: 1, factoryUnitId: 1, authOrigin: null, usuario: 'USER.TESTE', matriculaDass: 100n, role: 'admin', assignedSector: null },
    { id: 2, factoryUnitId: 1, authOrigin: 'LEGADO', usuario: 'USER.TESTE', matriculaDass: 100n, role: 'lider', assignedSector: 'CORTE' },
  ]);
  const result = await syncUser({ ...external, origem: 'LEGADO' }, 1, 1, false, state.client);
  assert.equal(result.binding.role, 'leitor');
  assert.equal(result.binding.assignedSector, null);
});

test('admin global sincroniza identidade nativa sem criar vínculo na unidade visitada', async () => {
  const state = clientWith();
  const result = await syncUser({ ...external, origem: 'LEGADO' }, 1, 2, true, state.client);
  assert.equal(result.identity.nativeUnitId, 1);
  assert.equal(result.binding, null);
  assert.equal(state.bindings.length, 0);
});

test('bootstrap concorrente é idempotente para identidade e vínculo', async () => {
  const state = clientWith();
  await Promise.all([
    syncUser(external, 1, 1, false, state.client),
    syncUser(external, 1, 1, false, state.client),
  ]);
  assert.equal(state.identities.length, 1);
  assert.equal(state.bindings.length, 1);
});
