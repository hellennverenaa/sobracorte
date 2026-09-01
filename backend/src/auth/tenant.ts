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

export async function resolveTenantRequestWithAdminCheck(
  claims: { unidade?: unknown; matricula?: unknown; usuario?: unknown },
  header: string | undefined,
  globalAdminRegistrations: ReadonlySet<number>,
  isDbAdminCheck?: (matricula: number, usuario: string) => Promise<boolean>,
) {
  const jwtUnit = typeof claims.unidade === 'string' ? claims.unidade.trim().toUpperCase() : '';
  const registration = Number(claims.matricula);
  const validRegistration = Number.isSafeInteger(registration) && registration > 0 ? registration : 0;
  const usuario = typeof claims.usuario === 'string' ? claims.usuario.trim().toUpperCase() : '';
  
  if (!jwtUnit && !header) {
    throw new TenantAuthorizationError('Token sem unidade válida.', 401);
  }

  const requestedUnit = header?.trim().toUpperCase() || jwtUnit;
  let isGlobalAdmin = validRegistration > 0 ? globalAdminRegistrations.has(validRegistration) : false;

  if (!isGlobalAdmin && isDbAdminCheck) {
    isGlobalAdmin = await isDbAdminCheck(validRegistration, usuario);
  }

  if (requestedUnit !== jwtUnit && !isGlobalAdmin) {
    throw new TenantAuthorizationError('Acesso negado: Seu usuário não possui permissão para acessar a unidade selecionada.', 403);
  }
  return { requestedUnit, isGlobalAdmin, registration: validRegistration };
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
