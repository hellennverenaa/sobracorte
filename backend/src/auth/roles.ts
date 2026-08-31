export const USER_ROLES = ['admin', 'admin_setor', 'lider', 'movimentador', 'leitor'] as const;
export type UserRole = typeof USER_ROLES[number];

export function deriveInitialRole(user: { usuario: string; funcao?: string }): UserRole {
  const funcao = String(user.funcao || '').toUpperCase().trim();

  if (['ENCARREGADO', 'SUPERVISOR'].some((cargo) => funcao.includes(cargo))) {
    return 'admin_setor';
  }
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
