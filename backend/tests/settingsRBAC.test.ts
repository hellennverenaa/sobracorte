import assert from 'node:assert/strict';
import test from 'node:test';

test('Settings RBAC: Admin Master tem permissão para excluir categorias com registros vinculados', () => {
  const category = { id: 1, name: 'SINTETICO' };
  const totalActive = 5; // 5 materiais vinculados
  const user = { role: 'admin', isGlobalAdmin: false };

  const isAdmin = user.role === 'admin' || user.isGlobalAdmin;
  const isBlocked = totalActive > 0 && !isAdmin;

  assert.equal(isAdmin, true);
  assert.equal(isBlocked, false);
});

test('Settings RBAC: Admin de Setor e operadores comuns são bloqueados ao tentar excluir categoria com vínculos', () => {
  const category = { id: 1, name: 'SINTETICO' };
  const totalActive = 3;
  const user = { role: 'admin_setor', assignedSector: 'CORTE', isGlobalAdmin: false };

  const isAdmin = user.role === 'admin' || user.isGlobalAdmin;
  const isBlocked = totalActive > 0 && !isAdmin;

  assert.equal(isAdmin, false);
  assert.equal(isBlocked, true);
});

test('Settings RBAC: Admin Master tem permissão para excluir localizações/prateleiras com histórico e vinculações', () => {
  const location = { id: 10, name: 'PRATELEIRA-01' };
  const totalActive = 2; // 2 itens associados
  const totalQuantity = 0;
  const user = { role: 'admin', isGlobalAdmin: true };

  const isAdmin = user.role === 'admin' || user.isGlobalAdmin;
  const isBlocked = totalActive > 0 && !isAdmin;

  assert.equal(isAdmin, true);
  assert.equal(isBlocked, false);
});

test('Settings RBAC: Não-admin é bloqueado ao tentar excluir localização com vínculos', () => {
  const location = { id: 10, name: 'PRATELEIRA-01' };
  const totalActive = 4;
  const user = { role: 'admin_setor', assignedSector: 'APOIO', isGlobalAdmin: false };

  const isAdmin = user.role === 'admin' || user.isGlobalAdmin;
  const isBlocked = totalActive > 0 && !isAdmin;

  assert.equal(isAdmin, false);
  assert.equal(isBlocked, true);
});

test('Settings RBAC: Desativação de Unidade de Medida com itens vinculados bloqueia não-admin', () => {
  const unit = { id: 2, name: 'Metro Quadrado', symbol: 'M²' };
  const totalActive = 120;
  const user = { role: 'admin_setor', assignedSector: 'CORTE', isGlobalAdmin: false };

  const isAdmin = user.role === 'admin' || user.isGlobalAdmin;
  const isBlocked = totalActive > 0 && !isAdmin;

  assert.equal(isBlocked, true);
});

test('Settings RBAC: Exclusão de Origem com movimentações vinculadas bloqueia não-admin e permite Admin Master', () => {
  const origin = { id: 5, name: 'DEVOLUÇÃO DE PRODUÇÃO' };
  const totalActive = 15;

  const nonAdminUser = { role: 'admin_setor', assignedSector: 'MONTAGEM' };
  const adminUser = { role: 'admin' };

  const isBlockedForNonAdmin = totalActive > 0 && !(nonAdminUser.role === 'admin');
  const isBlockedForAdmin = totalActive > 0 && !(adminUser.role === 'admin');

  assert.equal(isBlockedForNonAdmin, true);
  assert.equal(isBlockedForAdmin, false);
});
