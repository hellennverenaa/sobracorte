export const DATA_UPDATE_KEY = 'sobracorte:data-update'
export const DATA_UPDATE_EVENT = 'sobracorte:data-update'

export function publishDataUpdate(path, unit) {
  if (typeof window === 'undefined') return
  const update = { path, unit: unit || '', nonce: `${Date.now()}-${Math.random()}` }
  window.dispatchEvent(new window.CustomEvent(DATA_UPDATE_EVENT, { detail: update }))
  try {
    localStorage.setItem(DATA_UPDATE_KEY, JSON.stringify(update))
  } catch {
    // Atualização local continua disponível quando o armazenamento está bloqueado.
  }
}
