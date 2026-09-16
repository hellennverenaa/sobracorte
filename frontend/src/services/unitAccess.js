export function canSwitchFactoryUnit(user) {
  return Boolean(user?.isGlobalAdmin)
}

export function normalizeFactoryUnitCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

