import assert from 'node:assert/strict';
import test from 'node:test';
import jsonwebtoken from 'jsonwebtoken';
import { canAssignRole, INITIAL_USER_ROLE, isUserRole } from '../src/auth/roles';
import { syncUser } from '../src/controllers/AuthController';
import { verifyAccessToken } from '../src/auth/verifyToken';
import {
  normalizeRegistration,
  parseSafeNumericRegistration,
  registrationToBigInt,
  requireActiveTenant,
  resolveTenantRequest,
} from '../src/auth/tenant';

const secret = 'test-secret';

test('verifyAccessToken aceita somente token assinado e identificado', () => {
  const token = jsonwebtoken.sign({ usuario: 'USER.TESTE', funcao: 'AUXILIAR' }, secret, { expiresIn: '5m' });
  assert.equal(verifyAccessToken(token, secret).usuario, 'USER.TESTE');

  assert.throws(() => verifyAccessToken(token, 'outra-chave'), /invalid signature/);
  assert.throws(() => verifyAccessToken(jsonwebtoken.sign({ funcao: 'AUXILIAR' }, secret), secret));
});

test('verifyAccessToken rejeita token expirado', () => {
  const token = jsonwebtoken.sign({ usuario: 'USER.TESTE' }, secret, { expiresIn: -1 });
  assert.throws(() => verifyAccessToken(token, secret), { name: 'TokenExpiredError' });
});

test('novos usuários sempre entram como leitores', () => {
  assert.equal(INITIAL_USER_ROLE, 'leitor');
});

test('somente administrador global pode atribuir papel de admin', () => {
  assert.equal(canAssignRole('admin', false), false);
  assert.equal(canAssignRole('admin', true), true);
  assert.equal(canAssignRole('lider', false), true);
  assert.equal(canAssignRole('leitor', false), true);
});

test('resolveTenantRequest mantém usuários comuns em sua unidade', () => {
  assert.deepEqual(resolveTenantRequest({ unidade: 'SEST', matricula: '100' }, undefined, new Set()), {
    requestedUnit: 'SEST', isGlobalAdmin: false, registration: '100',
  });
  assert.deepEqual(resolveTenantRequest({ unidade: 'STJ', matricula: '101' }, 'STJ', new Set()), {
    requestedUnit: 'STJ', isGlobalAdmin: false, registration: '101',
  });
  assert.throws(() => resolveTenantRequest({ unidade: 'SEST', matricula: '100' }, 'STJ', new Set()), { status: 403 });
});

test('resolveTenantRequest permite ao administrador global escolher uma unidade', () => {
  assert.deepEqual(resolveTenantRequest({ unidade: 'SEST', matricula: '100' }, 'STJ', new Set([100])), {
    requestedUnit: 'STJ', isGlobalAdmin: true, registration: '100',
  });
});

test('resolveTenantRequest rejeita JWT sem unidade ou matrícula', () => {
  assert.throws(() => resolveTenantRequest({ matricula: '100' }, undefined, new Set()), { status: 401 });
  assert.throws(() => resolveTenantRequest({ unidade: 'SEST' }, undefined, new Set()), { status: 401 });
  assert.throws(() => resolveTenantRequest({ unidade: 'SEST', matricula: '   ' }, undefined, new Set()), { status: 401 });
});

test('resolveTenantRequest normaliza e aceita matrículas alfanuméricas sem privilégio global', () => {
  assert.equal(normalizeRegistration('  a001x  '), 'A001X');
  assert.deepEqual(resolveTenantRequest({ unidade: ' saj ', matricula: ' a001x ' }, undefined, new Set([1])), {
    requestedUnit: 'SAJ', isGlobalAdmin: false, registration: 'A001X',
  });
  assert.throws(
    () => resolveTenantRequest({ unidade: 'SAJ', matricula: 'A001X' }, 'SEST', new Set([1])),
    { status: 403 },
  );
});

test('somente matrículas numéricas positivas e seguras podem ser administradores globais', () => {
  assert.equal(parseSafeNumericRegistration('00100'), 100);
  assert.equal(parseSafeNumericRegistration('0'), null);
  assert.equal(parseSafeNumericRegistration('9007199254740992'), null);
  assert.equal(parseSafeNumericRegistration('A100'), null);
  assert.equal(resolveTenantRequest({ unidade: 'SAJ', matricula: '00100' }, 'SEST', new Set([100])).isGlobalAdmin, true);
  assert.equal(resolveTenantRequest({ unidade: 'SAJ', matricula: '9007199254740992' }, 'SAJ', new Set([9007199254740992 as any])).isGlobalAdmin, false);
});

test('matriculaDass só usa o intervalo BIGINT positivo do PostgreSQL', () => {
  assert.equal(registrationToBigInt('A100'), null);
  assert.equal(registrationToBigInt('0'), null);
  assert.equal(registrationToBigInt('9223372036854775807'), 9223372036854775807n);
  assert.equal(registrationToBigInt('9223372036854775808'), null);
});

test('sincronização preserva identidade por unidade e cria novo usuário como leitor', async () => {
  let upsertArgs: any;
  const client = {
    user: {
      upsert: async (args: any) => {
        upsertArgs = args;
        return args.create;
      },
    },
  };

  const user = await syncUser({
    usuario: '  usuario.saj ',
    matricula: ' abc123 ',
    nome: 'Usuário SAJ',
    email: 'usuario@example.test',
    setor: 'Operação',
    funcao: 'Leitor',
  } as any, 42, client);

  assert.deepEqual(upsertArgs.where, {
    factoryUnitId_usuario: { factoryUnitId: 42, usuario: 'USUARIO.SAJ' },
  });
  assert.equal(upsertArgs.create.factoryUnitId, 42);
  assert.equal(upsertArgs.create.usuario, 'USUARIO.SAJ');
  assert.equal(upsertArgs.create.matriculaDass, null);
  assert.equal(upsertArgs.create.role, 'leitor');
  assert.equal(user.role, 'leitor');
});

test('sincronização isola o mesmo usuário entre unidades', async () => {
  const upserts: any[] = [];
  const client = {
    user: {
      upsert: async (args: any) => {
        upserts.push(args);
        return args.create;
      },
    },
  };
  const identity = { usuario: 'MESMO.USUARIO', matricula: 'A001X' } as any;

  await syncUser(identity, 1, client);
  await syncUser(identity, 2, client);

  assert.deepEqual(upserts.map(({ where }) => where), [
    { factoryUnitId_usuario: { factoryUnitId: 1, usuario: 'MESMO.USUARIO' } },
    { factoryUnitId_usuario: { factoryUnitId: 2, usuario: 'MESMO.USUARIO' } },
  ]);
  assert.deepEqual(upserts.map(({ create }) => create.role), ['leitor', 'leitor']);
});

test('sincronização não envia matrícula fora do BIGINT para o PostgreSQL', async () => {
  let upsertArgs: any;
  await syncUser({ usuario: 'USUARIO', matricula: '9223372036854775808' } as any, 42, {
    user: { upsert: async (args: any) => { upsertArgs = args; return args.create; } },
  });
  assert.equal(upsertArgs.create.matriculaDass, null);
});

test('requireActiveTenant rejeita unidade inexistente ou inativa', async () => {
  await assert.rejects(() => requireActiveTenant('INVALIDA', async () => null), { status: 403 });
  assert.deepEqual(
    await requireActiveTenant('SEST', async (code) => ({ id: 1, code, name: 'Santo Estêvão' })),
    { id: 1, code: 'SEST', name: 'Santo Estêvão' },
  );
});

test('isUserRole aceita apenas os quatro papéis públicos', () => {
  assert.equal(isUserRole('admin'), true);
  assert.equal(isUserRole('lider'), true);
  assert.equal(isUserRole('root'), false);
  assert.equal(isUserRole(null), false);
});
