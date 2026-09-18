export function canSwitchFactoryUnit(user) {
  return Boolean(user?.isGlobalAdmin)
}

export function normalizeFactoryUnitCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function hasPendingSectorAssignment(user) {
  if (!user || user.isGlobalAdmin || user.role === 'admin') return false
  const sector = String(user.assignedSector || '').trim().toUpperCase()
  const valid = ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'CABEDAIS', 'MONTAGEM']
  return user.accessStatus === 'pending_sector_assignment' || !user.assignedSector || !valid.includes(sector)
}
