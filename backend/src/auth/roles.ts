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
