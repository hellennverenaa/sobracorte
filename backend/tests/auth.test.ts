import assert from 'node:assert/strict';
import test from 'node:test';
import jsonwebtoken from 'jsonwebtoken';
import { deriveInitialRole, isUserRole } from '../src/auth/roles';
import { verifyAccessToken } from '../src/auth/verifyToken';

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

test('deriveInitialRole preserva a matriz e compara administradores de forma exata', () => {
  assert.equal(deriveInitialRole({ usuario: 'USER.TESTE', funcao: 'Líder de produção' }), 'lider');
  assert.equal(deriveInitialRole({ usuario: 'USER.TESTE', funcao: 'Auxiliar' }), 'movimentador');
  assert.equal(deriveInitialRole({ usuario: 'USER.TESTE', funcao: 'Operador' }), 'leitor');
  assert.equal(deriveInitialRole({ usuario: 'HELLEN.MAGALHAES', funcao: 'Operador' }), 'admin');
  assert.equal(deriveInitialRole({ usuario: 'FAKE.HELLEN.MAGALHAES', funcao: 'Operador' }), 'leitor');
});

test('isUserRole aceita apenas os quatro papéis públicos', () => {
  assert.equal(isUserRole('admin'), true);
  assert.equal(isUserRole('lider'), true);
  assert.equal(isUserRole('root'), false);
  assert.equal(isUserRole(null), false);
});
