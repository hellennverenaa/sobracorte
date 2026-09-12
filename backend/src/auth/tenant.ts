export class TenantAuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
  }
}

export function resolveTenantRequest(
  claims: { unidade?: unknown; matricula?: unknown },
  header: string | undefined,
  globalAdminRegistrations: ReadonlySet<number>,
) {
  const jwtUnit = typeof claims.unidade === 'string' ? claims.unidade.trim().toUpperCase() : '';
  const registration = Number(claims.matricula);
  if (!jwtUnit || !Number.isSafeInteger(registration) || registration <= 0) {
    throw new TenantAuthorizationError('Token sem unidade ou matrícula válida.', 401);
  }

  const requestedUnit = header?.trim().toUpperCase() || jwtUnit;
  const isGlobalAdmin = globalAdminRegistrations.has(registration);
  if (requestedUnit !== jwtUnit && !isGlobalAdmin) {
    throw new TenantAuthorizationError('Acesso negado para a unidade selecionada.', 403);
  }
  return { requestedUnit, isGlobalAdmin, registration };
}

type ActiveTenant = { id: number; code: string; name: string };

export async function requireActiveTenant(
  code: string,
  findTenant: (code: string) => Promise<ActiveTenant | null>,
): Promise<ActiveTenant> {
  const tenant = await findTenant(code);
  if (!tenant) {
    throw new TenantAuthorizationError('Unidade inexistente, inativa ou não autorizada.', 403);
  }
  return tenant;
}
