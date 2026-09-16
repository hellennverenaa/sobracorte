/**
 * Regras puras compartilhadas pela tela de login e por seus testes.
 *
 * A unidade SEST é a única exceção: ela continua no Portal Unix. Todas as
 * demais unidades visíveis precisam existir nos dois catálogos antes de serem
 * oferecidas ao usuário.
 */

export const LEGACY_UNIT_CODE = 'SEST'
export const HIDDEN_UNIT_CODES = new Set(['ITP', 'IVT'])

export function normalizeUnitCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function normalizeUnit(unit) {
  if (typeof unit === 'string') {
    const code = normalizeUnitCode(unit)
    return code ? { code, name: code } : null
  }
  if (!unit || typeof unit !== 'object') return null
  const code = normalizeUnitCode(unit.code ?? unit.codigo ?? unit.unidade)
  if (!code) return null
  return { ...unit, code, name: unit.name ?? unit.nome ?? code }
}

export function normalizeUnits(response) {
  const source = Array.isArray(response)
    ? response
    : response?.data?.data ?? response?.data?.items ?? response?.data ?? response?.items
  return Array.isArray(source) ? source.map(normalizeUnit).filter(Boolean) : []
}

export function isLegacyUnit(unitCode) {
  return normalizeUnitCode(unitCode) === LEGACY_UNIT_CODE
}

/**
 * Keep the backend catalog's order and metadata. SEST is always retained,
 * while external units must be present in the identities catalog as well.
 */
export function intersectFactoryUnits(factoryResponse, externalResponse) {
  const factoryUnits = normalizeUnits(factoryResponse)
  const externalCodes = new Set(normalizeUnits(externalResponse).map(unit => unit.code))

  return factoryUnits.filter(unit => {
    if (HIDDEN_UNIT_CODES.has(unit.code)) return false
    return isLegacyUnit(unit.code) || externalCodes.has(unit.code)
  })
}

export function loginRequest(unitCode, username, password) {
  const unidade = normalizeUnitCode(unitCode)
  const usuario = String(username ?? '').trim()
  const senha = String(password ?? '')
  if (isLegacyUnit(unidade)) {
    return { endpoint: '/auth/login', payload: { usuario, senha }, legacy: true }
  }
  return {
    endpoint: '/auth/external/login',
    payload: { unidade, usuario, senha },
    legacy: false,
  }
}

function withQuery(baseUrl, path, unitCode) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '')
  const query = new URLSearchParams({ unidade: normalizeUnitCode(unitCode) }).toString()
  return `${base}${path}?${query}`
}

export function buildRegistrationUrl(baseUrl, unitCode) {
  return withQuery(baseUrl, '/register', unitCode)
}

export function buildRecoveryUrl(baseUrl, unitCode) {
  return withQuery(baseUrl, '/recover', unitCode)
}

export function getLoginPresentation(unitCode, urls = {}) {
  const legacy = isLegacyUnit(unitCode)
  return {
    legacy,
    issuer: legacy ? 'Portal Unix' : 'DASS Identidades',
    usernameLabel: legacy ? 'Usuário Unix' : 'Usuário',
    usernamePlaceholder: legacy ? 'Ex: hellen.magalhaes' : 'Ex: nome.usuario',
    registrationUrl: legacy ? String(urls.portalUnixUrl ?? '') : buildRegistrationUrl(urls.dassIdentitiesUrl, unitCode),
    recoveryUrl: legacy ? String(urls.portalUnixUrl ?? '') : buildRecoveryUrl(urls.dassIdentitiesUrl, unitCode),
  }
}

export function externalLoginMessage(code) {
  switch (code) {
    case 'REGISTRATION_PENDING':
      return 'Seu cadastro está aguardando aprovação no DASS Identidades.'
    case 'REGISTRATION_REJECTED':
      return 'Seu cadastro foi rejeitado no DASS Identidades. Consulte o portal para mais informações.'
    case 'PASSWORD_CHANGE_REQUIRED':
      return 'Sua senha temporária precisa ser alterada no DASS Identidades antes do acesso.'
    default:
      return null
  }
}
