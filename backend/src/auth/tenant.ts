export class TenantAuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
  }
}

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const REGISTRATION_PATTERN = /^\d+$/;

/** Normalizes provider and legacy registrations without losing textual IDs. */
export function normalizeRegistration(value: unknown): string {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (!/^\d+$/.test(normalized)) return normalized;
    const registration = BigInt(normalized);
    return registration > 0n ? registration.toString() : '';
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'bigint' && value > 0n) return value.toString();
  return '';
}

export function registrationToBigInt(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  const registration = BigInt(value);
  return registration > 0n && registration <= POSTGRES_BIGINT_MAX ? registration : null;
}

export function resolveTenantRequest(
  claims: { unidade?: unknown; matricula?: unknown },
  header: string | undefined,
  globalAdminIdentities: ReadonlySet<string>,
) {
  const jwtUnit = typeof claims.unidade === 'string' ? claims.unidade.trim().toUpperCase() : '';
  const registration = normalizeRegistration(claims.matricula);
  if (!jwtUnit || !REGISTRATION_PATTERN.test(registration)) {
    throw new TenantAuthorizationError('Token sem unidade ou matrícula válida.', 401);
  }

  const requestedUnit = header?.trim().toUpperCase() || jwtUnit;
  const isGlobalAdmin = globalAdminIdentities.has(`${jwtUnit}:${registration}`);
  if (requestedUnit !== jwtUnit && !isGlobalAdmin) {
    throw new TenantAuthorizationError('Acesso negado para a unidade selecionada.', 403);
  }
  return { requestedUnit, isGlobalAdmin, registration };
}

export type ActiveTenant = { id: number; code: string; name: string; enableRequisitions: boolean };

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
