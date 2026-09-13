import assert from 'node:assert/strict';
import test from 'node:test';
import jsonwebtoken from 'jsonwebtoken';
import { canAssignRole, INITIAL_USER_ROLE, isUserRole } from '../src/auth/roles';
import { syncUser } from '../src/controllers/AuthController';
import { verifyAccessToken } from '../src/auth/verifyToken';
import {
  normalizeRegistration,
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
  assert.deepEqual(resolveTenantRequest({ unidade: 'SEST', matricula: '100' }, 'STJ', new Set(['SEST:100'])), {
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
  assert.deepEqual(resolveTenantRequest({ unidade: ' saj ', matricula: ' a001x ' }, undefined, new Set(['SEST:1'])), {
    requestedUnit: 'SAJ', isGlobalAdmin: false, registration: 'A001X',
  });
  assert.throws(
    () => resolveTenantRequest({ unidade: 'SAJ', matricula: 'A001X' }, 'SEST', new Set(['SEST:1'])),
    { status: 403 },
  );
});

test('administrador global exige correspondência exata de unidade e matrícula', () => {
  assert.equal(resolveTenantRequest({ unidade: 'SEST', matricula: '3023093' }, 'SAJ', new Set(['SEST:3023093'])).isGlobalAdmin, true);
  assert.equal(resolveTenantRequest({ unidade: 'SAJ', matricula: '3023093' }, 'SAJ', new Set(['SEST:3023093'])).isGlobalAdmin, false);
  assert.equal(resolveTenantRequest({ unidade: 'SEST', matricula: 'OUTRO' }, 'SEST', new Set(['SEST:3023093'])).isGlobalAdmin, false);
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

test('sincronização externa prioriza origem e id e preserva o papel local', async () => {
  const calls: any[] = [];
  const existing = { id: 9, role: 'lider' };
  const result = await syncUser({ id: 'ext-12', origem: 'EXTERNO', usuario: 'NOVO.USUARIO', matricula: '123', nome: 'Nome Novo' } as any, 42, {
    user: {
      findUnique: async (args: any) => { calls.push(args); return existing; },
      update: async (args: any) => ({ ...existing, ...args.data }),
    },
  });
  assert.deepEqual(calls[0].where, { factoryUnitId_authOrigin_authUserId: { factoryUnitId: 42, authOrigin: 'EXTERNO', authUserId: 'ext-12' } });
  assert.equal(result.role, 'lider');
  assert.equal(result.usuario, 'NOVO.USUARIO');
});

test('sincronização externa vincula registro antigo não vinculado', async () => {
  let update: any;
  await syncUser({ id: 'ext-13', origem: 'EXTERNO', usuario: 'ANTIGO.USUARIO', matricula: '124' } as any, 7, {
    user: {
      findUnique: async () => null,
      findFirst: async () => ({ id: 10, role: 'operador' }),
      update: async (args: any) => { update = args; return args.data; },
    },
  });
  assert.equal(update.where.id, 10);
  assert.equal(update.data.authOrigin, 'EXTERNO');
  assert.equal(update.data.authUserId, 'ext-13');
});

test('primeira sincronização externa cria leitor com identidade estável', async () => {
  let created: any;
  const result = await syncUser({ id: 'ext-14', origem: 'EXTERNO', usuario: 'NOVO.LEITOR', matricula: '125' } as any, 8, {
    user: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async (args: any) => { created = args.data; return args.data; },
    },
  });
  assert.equal(created.factoryUnitId, 8);
  assert.equal(created.authOrigin, 'EXTERNO');
  assert.equal(created.authUserId, 'ext-14');
  assert.equal(result.role, 'leitor');
});

test('conflito ao criar identidade externa não é convertido em outro vínculo', async () => {
  const conflict = Object.assign(new Error('unique constraint'), { code: 'P2002' });
  await assert.rejects(() => syncUser({ id: 'ext-15', origem: 'EXTERNO', usuario: 'JA.VINCULADO', matricula: '126' } as any, 8, {
    user: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => { throw conflict; },
    },
  }), conflict);
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
