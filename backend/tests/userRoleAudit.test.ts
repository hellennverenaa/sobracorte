import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAssignRole } from '../src/auth/roles';
import {
  UserService,
  UserNotFoundError,
  UserConcurrencyConflictError,
  UnauthorizedRoleAssignmentError,
} from '../src/services/UserService';

test('canAssignRole permite atribuir papéis comuns a administradores locais', () => {
  assert.equal(canAssignRole('admin_setor', false), true);
  assert.equal(canAssignRole('lider', false), true);
  assert.equal(canAssignRole('movimentador', false), true);
  assert.equal(canAssignRole('leitor', false), true);
});

test('canAssignRole bloqueia atribuição de admin para quem não é Global Admin', () => {
  assert.equal(canAssignRole('admin', false), false);
  assert.equal(canAssignRole('admin', true), true);
});

test('UserService.updateUserRole rejeita promoção para admin quando ator não é Global Admin', async () => {
  const service = new UserService();
  const mockPrisma = {};

  await assert.rejects(
    () =>
      service.updateUserRole(mockPrisma, {
        targetUserId: 1,
        factoryUnitId: 1,
        newRole: 'admin',
        actor: {
          nome: 'Admin Local',
          usuario: 'admin_local',
          isGlobalAdmin: false,
        },
      }),
    (err: any) => {
      assert(err instanceof UnauthorizedRoleAssignmentError);
      return true;
    }
  );
});

test('UserService.updateUserRole detecta conflito de concorrência quando expectedRole diverge', async () => {
  const service = new UserService();

  const mockPrisma = {
    $transaction: async (cb: any) => {
      const tx = {
        userRoleBinding: {
          findFirst: async () => ({
            id: 10,
            role: 'lider', // Papel já foi alterado para líder no banco
            assignedSector: 'CORTE',
            identity: { usuario: 'operador1', nome: 'Operador Um' },
          }),
        },
      };
      return cb(tx);
    },
  };

  await assert.rejects(
    () =>
      service.updateUserRole(mockPrisma, {
        targetUserId: 10,
        factoryUnitId: 1,
        newRole: 'admin_setor',
        expectedRole: 'movimentador', // Tela achava que ele ainda era movimentador
        actor: {
          nome: 'Gestor',
          usuario: 'gestor',
          isGlobalAdmin: true,
        },
      }),
    (err: any) => {
      assert(err instanceof UserConcurrencyConflictError);
      return true;
    }
  );
});

test('UserService.updateUserRole é idempotente quando dados não são alterados (sem auditoria redundante)', async () => {
  const service = new UserService();
  let auditCreated = false;

  const mockPrisma = {
    $transaction: async (cb: any) => {
      const tx = {
        userRoleBinding: {
          findFirst: async () => ({
            id: 10,
            role: 'lider',
            assignedSector: 'CORTE',
            identity: { usuario: 'operador1', nome: 'Operador Um' },
          }),
        },
        roleChangeAudit: {
          create: async () => {
            auditCreated = true;
          },
        },
      };
      return cb(tx);
    },
  };

  const result = await service.updateUserRole(mockPrisma, {
    targetUserId: 10,
    factoryUnitId: 1,
    newRole: 'lider',
    newSector: 'CORTE',
    expectedRole: 'lider',
    actor: {
      nome: 'Gestor',
      usuario: 'gestor',
      isGlobalAdmin: true,
    },
  });

  assert.equal(result.changed, false);
  assert.equal(auditCreated, false);
});

test('UserService.updateUserRole atualiza usuário e persiste auditoria em RoleChangeAudit e StockMovement', async () => {
  const service = new UserService();
  let userUpdated = false;
  let auditRecord: any = null;
  let movementRecord: any = null;

  const mockPrisma = {
    $transaction: async (cb: any) => {
      const tx = {
        userRoleBinding: {
          findFirst: async () => ({
            id: 10,
            role: 'leitor',
            assignedSector: null,
            identity: { usuario: 'operador1', nome: 'Operador Um' },
          }),
          update: async ({ data }: any) => {
            userUpdated = true;
            return {
              id: 10,
              role: data.role,
              assignedSector: data.assignedSector,
            };
          },
        },
        roleChangeAudit: {
          create: async ({ data }: any) => {
            auditRecord = data;
            return { id: 1, ...data };
          },
        },
        stockMovement: {
          create: async ({ data }: any) => {
            movementRecord = data;
            return { id: 1, ...data };
          },
        },
      };
      return cb(tx);
    },
  };

  const result = await service.updateUserRole(mockPrisma, {
    targetUserId: 10,
    factoryUnitId: 1,
    newRole: 'movimentador',
    newSector: 'CORTE',
    expectedRole: 'leitor',
    actor: {
      matricula: '12345',
      nome: 'Admin Master',
      usuario: 'admin',
      isGlobalAdmin: true,
    },
  });

  assert.equal(result.changed, true);
  assert.equal(userUpdated, true);
  assert.equal(result.user.role, 'movimentador');
  assert.equal(result.user.assignedSector, 'CORTE');

  // Verifica dados do log de auditoria
  assert.equal(auditRecord.userId, 10);
  assert.equal(auditRecord.bindingId, 10);
  assert.equal(auditRecord.previousRole, 'leitor');
  assert.equal(auditRecord.newRole, 'movimentador');
  assert.equal(auditRecord.previousSector, null);
  assert.equal(auditRecord.newSector, 'CORTE');
  assert.equal(auditRecord.changedById, '12345');
  assert.equal(auditRecord.changedByName, 'Admin Master');

  // Verifica log corporativo em StockMovement
  assert.equal(movementRecord.type, 'EDICAO_CONFIGURACAO');
  assert.equal(movementRecord.sector, 'CONFIGURACOES');
  assert(movementRecord.reason.includes('operador1'));
});
