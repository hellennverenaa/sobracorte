export const LEGACY_UNIT_CODE = 'SEST'

export function normalizeUnitCode(unitCode) {
  return typeof unitCode === 'string' ? unitCode.trim().toUpperCase() : ''
}

export function isLegacyUnit(unitCode) {
  return normalizeUnitCode(unitCode) === LEGACY_UNIT_CODE
}

export function getLoginEndpoint(unitCode) {
  return isLegacyUnit(unitCode) ? '/auth/login' : '/auth/external/login'
}

export function buildLoginPayload(unitCode, usuario, senha) {
  const normalizedUnit = normalizeUnitCode(unitCode)
  const credentials = { usuario, senha }

  return isLegacyUnit(normalizedUnit)
    ? credentials
    : { unidade: normalizedUnit, ...credentials }
}

export function selectInitialUnit(units, lastUnit) {
  const availableUnits = Array.isArray(units) ? units : []
  const normalizedLastUnit = normalizeUnitCode(lastUnit)
  const storedUnit = availableUnits.find(
    (unit) => normalizeUnitCode(unit?.code) === normalizedLastUnit,
  )

  return storedUnit?.code || availableUnits[0]?.code || ''
}

export function shouldDiscardStoredUnit(units, lastUnit) {
  const normalizedLastUnit = normalizeUnitCode(lastUnit)
  if (!normalizedLastUnit) return false

  return !Array.isArray(units) || !units.some(
    (unit) => normalizeUnitCode(unit?.code) === normalizedLastUnit,
  )
}

export async function loginByUnit(authClient, unitCode, usuario, senha) {
  const normalizedUnit = normalizeUnitCode(unitCode)
  if (isLegacyUnit(normalizedUnit)) {
    return authClient.post('/auth/login', { usuario, senha })
  }

  try {
    return await authClient.post(
      '/auth/external/login',
      { unidade: normalizedUnit, usuario, senha },
    )
  } catch (error) {
    // Administradores globais mantêm sua identidade no cadastro legado. O
    // backend SobraCorte decide se o JWT legado pode acessar a unidade pedida.
    if (error?.response?.status !== 401) throw error
    return authClient.post('/auth/login', { usuario, senha })
  }
}
