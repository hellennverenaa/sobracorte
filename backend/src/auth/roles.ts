export const USER_ROLES = ['admin', 'lider', 'movimentador', 'leitor'] as const;
export type UserRole = typeof USER_ROLES[number];

const ADMIN_USERS = new Set([
  'HELLEN.MAGALHAES',
  'HENDRIUS.SANTANA',
  'PAULO.RICARDO',
  'MIDIAN.SANTANA',
  'CLEONICE.SOARES',
]);

export function deriveInitialRole(user: { usuario: string; funcao?: string }): UserRole {
  const usuario = String(user.usuario || '').toUpperCase().trim();
  const funcao = String(user.funcao || '').toUpperCase().trim();

  if (ADMIN_USERS.has(usuario)) return 'admin';
  if (['LIDER', 'LÍDER', 'ANALISTA', 'COORDENADOR', 'GERENTE'].some((cargo) => funcao.includes(cargo))) {
    return 'lider';
  }
  if (['AUXILIAR', 'ASSISTENTE'].some((cargo) => funcao.includes(cargo))) {
    return 'movimentador';
  }
  return 'leitor';
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}
