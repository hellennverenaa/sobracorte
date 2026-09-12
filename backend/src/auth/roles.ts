export const USER_ROLES = ['admin', 'lider', 'movimentador', 'leitor'] as const;
export type UserRole = typeof USER_ROLES[number];
export const INITIAL_USER_ROLE: UserRole = 'leitor';

export function canAssignRole(role: UserRole, isGlobalAdmin: boolean): boolean {
  return role !== 'admin' || isGlobalAdmin;
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}
