import assert from 'node:assert/strict';
import test from 'node:test';
import jsonwebtoken from 'jsonwebtoken';
import { deriveInitialRole, isUserRole } from '../src/auth/roles';
import { verifyAccessToken } from '../src/auth/verifyToken';
import { requireActiveTenant, resolveTenantRequest } from '../src/auth/tenant';

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

test('deriveInitialRole deriva o papel pelo cargo sem administradores hardcoded', () => {
  assert.equal(deriveInitialRole({ usuario: 'USER.TESTE', funcao: 'Líder de produção' }), 'lider');
  assert.equal(deriveInitialRole({ usuario: 'USER.TESTE', funcao: 'Auxiliar' }), 'movimentador');
  assert.equal(deriveInitialRole({ usuario: 'USER.TESTE', funcao: 'Operador' }), 'leitor');
  assert.equal(deriveInitialRole({ usuario: 'HELLEN.MAGALHAES', funcao: 'Operador' }), 'leitor');
});

test('resolveTenantRequest mantém usuários comuns em sua unidade', () => {
  assert.deepEqual(resolveTenantRequest({ unidade: 'SEST', matricula: '100' }, undefined, new Set()), {
    requestedUnit: 'SEST', isGlobalAdmin: false, registration: 100,
  });
  assert.deepEqual(resolveTenantRequest({ unidade: 'STJ', matricula: '101' }, 'STJ', new Set()), {
    requestedUnit: 'STJ', isGlobalAdmin: false, registration: 101,
  });
  assert.throws(() => resolveTenantRequest({ unidade: 'SEST', matricula: '100' }, 'STJ', new Set()), { status: 403 });
});

test('resolveTenantRequest permite ao administrador global escolher uma unidade', () => {
  assert.deepEqual(resolveTenantRequest({ unidade: 'SEST', matricula: '100' }, 'STJ', new Set([100])), {
    requestedUnit: 'STJ', isGlobalAdmin: true, registration: 100,
  });
});

test('resolveTenantRequest rejeita JWT sem unidade ou matrícula', () => {
  assert.throws(() => resolveTenantRequest({ matricula: '100' }, undefined, new Set()), { status: 401 });
  assert.throws(() => resolveTenantRequest({ unidade: 'SEST' }, undefined, new Set()), { status: 401 });
  assert.throws(() => resolveTenantRequest({ unidade: 'SEST', matricula: 'x' }, undefined, new Set()), { status: 401 });
});

test('requireActiveTenant rejeita unidade inexistente ou inativa', async () => {
  await assert.rejects(() => requireActiveTenant('INVALIDA', async () => null), { status: 403 });
  assert.deepEqual(
    await requireActiveTenant('SEST', async (code) => ({ id: 1, code, name: 'Santo Estêvão' })),
    { id: 1, code: 'SEST', name: 'Santo Estêvão' },
  );
});

test('isUserRole aceita apenas os papéis públicos válidos', () => {
  assert.equal(isUserRole('admin'), true);
  assert.equal(isUserRole('admin_setor'), true);
  assert.equal(isUserRole('lider'), true);
  assert.equal(isUserRole('movimentador'), true);
  assert.equal(isUserRole('leitor'), true);
  assert.equal(isUserRole('root'), false);
  assert.equal(isUserRole(null), false);
});
