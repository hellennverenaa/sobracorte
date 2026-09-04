import assert from 'node:assert/strict';
import test from 'node:test';
import { updateUserRole } from '../src/routes';

function fakeClient(initialRole: string | null, auditFailure = false) {
  let role = initialRole;
  let audit: any = null;
  let updates = 0;
  return {
    client: {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => {
        const before = role;
        const tx = {
          user: {
            findFirst: async () => role === null ? null : ({
              id: 7, usuario: 'OPERADOR', nome: 'Operador', role,
              factoryUnitId: 42, matriculaDass: null,
            }),
            updateMany: async ({ data }: any) => {
              if (role === null) return { count: 0 };
              role = data.role;
              updates += 1;
              return { count: 1 };
            },
            findFirstOrThrow: async () => ({
              id: 7, usuario: 'OPERADOR', nome: 'Operador', role,
              factoryUnitId: 42, matriculaDass: null,
            }),
          },
          roleChangeAudit: {
            create: async ({ data }: any) => {
              audit = data;
              if (auditFailure) throw new Error('AUDIT_WRITE_FAILED');
              return data;
            },
          },
        };
        try {
          return await callback(tx);
        } catch (error) {
          role = before;
          throw error;
        }
      },
    },
    state: () => ({ role, audit, updates }),
  };
}

const actor = { id: 900, matricula: 12345, usuario: 'ADMIN', nome: 'Administrador' };

test('mudança de papel registra alvo, valores, ator e unidade', async () => {
  const fake = fakeClient('leitor');
  const result = await updateUserRole(fake.client, 7, 42, 'lider', actor);

  assert.equal(result.changed, true);
  assert.equal(fake.state().role, 'lider');
  assert.deepEqual(fake.state().audit, {
    userId: 7, usuario: 'OPERADOR', nome: 'Operador',
    previousRole: 'leitor', newRole: 'lider', factoryUnitId: 42,
    changedById: '12345', changedByName: 'Administrador',
  });
});

test('usuário inexistente não gera atualização nem auditoria', async () => {
  const fake = fakeClient(null);
  await assert.rejects(updateUserRole(fake.client, 7, 42, 'lider', actor), /USER_NOT_FOUND/);
  assert.deepEqual(fake.state(), { role: null, audit: null, updates: 0 });
});

test('reenviar o mesmo papel não gera evento redundante', async () => {
  const fake = fakeClient('lider');
  const result = await updateUserRole(fake.client, 7, 42, 'lider', actor);
  assert.equal(result.changed, false);
  assert.deepEqual(fake.state(), { role: 'lider', audit: null, updates: 0 });
});

test('falha da auditoria reverte a mudança de papel', async () => {
  const fake = fakeClient('leitor', true);
  await assert.rejects(updateUserRole(fake.client, 7, 42, 'lider', actor), /AUDIT_WRITE_FAILED/);
  assert.equal(fake.state().role, 'leitor');
  assert.equal(fake.state().updates, 1);
});
