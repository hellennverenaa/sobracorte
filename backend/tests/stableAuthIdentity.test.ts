import assert from 'node:assert/strict';
import test from 'node:test';
import { syncUser, LegacyIdentityConflictError } from '../src/controllers/AuthController';

function matchesLegacyWhere(user: any, where: any): boolean {
  return Object.entries(where).every(([field, value]: [string, any]) => {
    if (field === 'AND') return value.every((condition: any) => matchesLegacyWhere(user, condition));
    if (field === 'OR') return value.some((condition: any) => matchesLegacyWhere(user, condition));
    return (user[field] ?? null) === value;
  });
}

function clientWith(legacyUsers: any[] = []) {
  const identities: any[] = [];
  const bindings: any[] = [];
  return {
    identities,
    bindings,
    client: {
      user: {
        findMany: async ({ where, take }: any) => legacyUsers.filter((user) =>
          matchesLegacyWhere(user, where)
        ).slice(0, take),
      },
      authIdentity: {
        findUnique: async ({ where }: any) => identities.find(candidate =>
          candidate.nativeUnitId === where.nativeUnitId_authOrigin_authUserId.nativeUnitId &&
          candidate.authOrigin === where.nativeUnitId_authOrigin_authUserId.authOrigin &&
          candidate.authUserId === where.nativeUnitId_authOrigin_authUserId.authUserId) || null,
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
        findUnique: async ({ where }: any) => bindings.find(candidate =>
          candidate.identityId === where.identityId_factoryUnitId.identityId &&
          candidate.factoryUnitId === where.identityId_factoryUnitId.factoryUnitId) || null,
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

test('fallback legado não herda permissões de outro identificador estável com mesma matrícula/usuário', async () => {
  const state = clientWith([
    { factoryUnitId: 1, authOrigin: 'LEGADO', authUserId: 'other-provider-id', usuario: 'USER.TESTE', matriculaDass: 100n, role: 'admin' },
  ]);
  const result = await syncUser({ ...external, origem: 'LEGADO' }, 1, 1, false, state.client);
  assert.equal(result.binding.role, 'leitor');
  assert.equal(result.binding.assignedSector, null);
});

test('fallback legado reconhece a chave estável mesmo após mudança cadastral', async () => {
  const state = clientWith([
    { factoryUnitId: 1, authOrigin: 'LEGADO', authUserId: external.id, usuario: 'OLD.NAME', matriculaDass: 200n, role: 'lider', assignedSector: 'CORTE' },
  ]);
  const result = await syncUser({ ...external, origem: 'LEGADO' }, 1, 1, false, state.client);
  assert.equal(result.binding.role, 'lider');
  assert.equal(result.binding.assignedSector, 'CORTE');
});

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

test('perfil legado ambíguo rejeita bootstrap sem criar identidade ou vínculo', async () => {
  const state = clientWith([
    { id: 1, factoryUnitId: 1, authOrigin: null, usuario: 'USER.TESTE', matriculaDass: 100n, role: 'admin', assignedSector: null },
    { id: 2, factoryUnitId: 1, authOrigin: 'LEGADO', usuario: 'USER.TESTE', matriculaDass: 100n, role: 'lider', assignedSector: 'CORTE' },
  ]);
  await assert.rejects(syncUser({ ...external, origem: 'LEGADO' }, 1, 1, false, state.client), LegacyIdentityConflictError);
  assert.equal(state.identities.length, 0);
  assert.equal(state.bindings.length, 0);
});

test('vínculo legado já migrado sincroniza sem consultar User', async () => {
  const state = clientWith([{ factoryUnitId: 1, authOrigin: 'LEGADO', usuario: 'USER.TESTE', role: 'lider', assignedSector: 'CORTE' }]);
  const user = { ...external, origem: 'LEGADO' };
  await syncUser(user, 1, 1, false, state.client);
  state.client.user.findMany = async () => { throw new Error('User não deve ser consultado'); };
  const result = await syncUser({ ...user, nome: 'Atualizado' }, 1, 1, false, state.client);
  assert.equal(result.binding.role, 'lider');
  assert.equal(result.binding.assignedSector, 'CORTE');
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

test('conflito único concorrente recarrega o vínculo sem alterar suas permissões', async () => {
  const state = clientWith();
  const first = await syncUser(external, 1, 1, false, state.client);
  first.binding.role = 'lider';
  first.binding.assignedSector = 'CORTE';
  state.client.userRoleBinding.upsert = async () => { throw Object.assign(new Error('concurrent insert'), { code: 'P2002' }); };
  const result = await syncUser(external, 1, 1, false, state.client);
  assert.equal(result.binding.id, first.binding.id);
  assert.equal(result.binding.role, 'lider');
  assert.equal(result.binding.assignedSector, 'CORTE');
  state.client.userRoleBinding.findUnique = async () => null;
  await assert.rejects(syncUser(external, 1, 1, false, state.client), (error: any) => error.code === 'P2002');
});
