/**
 * Applies the common-session response to the locally cached user.
 * `assignedSector` is intentionally assigned even when the backend returns
 * null: a refresh must be able to remove a sector that was revoked locally.
 */
export function buildRefreshedSessionUser({ user, token, tokenPayload, synced }) {
  const syncedUser = synced?.user || {}
  return {
    ...user,
    token,
    id: syncedUser.id,
    nome: tokenPayload.nome || tokenPayload.usuario,
    usuario: tokenPayload.usuario,
    email: tokenPayload.email || `${tokenPayload.usuario.toLowerCase()}@grupodass.com.br`,
    setor: tokenPayload.setor || 'NÃO DEFINIDO',
    funcao: tokenPayload.funcao || 'NÃO DEFINIDO',
    role: syncedUser.role,
    assignedSector: syncedUser.assignedSector,
    unit: synced?.unit,
    isGlobalAdmin: synced?.isGlobalAdmin,
  }
}
