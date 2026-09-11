export class TenantAuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
  }
}

/**
 * Authentication service identifiers are strings. Legacy tokens may still
 * contain a JSON number, so integer numbers are accepted for compatibility.
 */
export function normalizeRegistration(value: unknown): string {
  if (typeof value === 'string') return value.trim().toUpperCase();
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  return '';
}

export function parseSafeNumericRegistration(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const registration = Number(value);
  if (!Number.isSafeInteger(registration) || registration <= 0) return null;
  return registration;
}

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const REGISTRATION_PATTERN = /^[A-Z0-9]+$/u;

/** Returns the positive PostgreSQL BIGINT representation, when available. */
export function registrationToBigInt(value: string): bigint | null {
  if (!/^\d+$/u.test(value)) return null;
  const registration = BigInt(value);
  if (registration <= 0n || registration > POSTGRES_BIGINT_MAX) return null;
  return registration;
}

export function resolveTenantRequest(
  claims: { unidade?: unknown; matricula?: unknown },
  header: string | undefined,
  globalAdminRegistrations: ReadonlySet<number>,
) {
  const jwtUnit = typeof claims.unidade === 'string' ? claims.unidade.trim().toUpperCase() : '';
  const registration = normalizeRegistration(claims.matricula);
  if (!jwtUnit || !REGISTRATION_PATTERN.test(registration)) {
    throw new TenantAuthorizationError('Token sem unidade ou matrícula válida.', 401);
  }

  const requestedUnit = header?.trim().toUpperCase() || jwtUnit;
  const numericRegistration = parseSafeNumericRegistration(registration);
  const isGlobalAdmin = numericRegistration !== null && globalAdminRegistrations.has(numericRegistration);
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
