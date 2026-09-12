export const USER_ROLES = ['admin', 'admin_setor', 'lider', 'movimentador', 'leitor'] as const;
export type UserRole = typeof USER_ROLES[number];

/**
 * Papel inicial padrão para novos usuários sincronizados.
 * Totalmente desacoplado de strings de função ou cargos de RH da DASS.
 * A elevação de papel é de competência exclusiva dos Administradores do sistema.
 */
export function deriveInitialRole(_user?: { usuario?: string; funcao?: string }): UserRole {
  return 'leitor';
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

/**
 * Valida se o administrador atual possui prerrogativa para conceder o papel solicitado.
 * A concessão do perfil de Administrador Master ('admin') exige privilégios de Administrador Global (isGlobalAdmin === true).
 */
export function canAssignRole(newRole: UserRole, isGlobalAdmin: boolean): boolean {
  if (newRole === 'admin') {
    return isGlobalAdmin;
  }
  return true;
}
