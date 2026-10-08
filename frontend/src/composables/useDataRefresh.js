import { onMounted, onUnmounted } from 'vue'
import { DATA_UPDATE_EVENT, DATA_UPDATE_KEY } from '../services/dataUpdates'

// Atualiza dados de leitura sem remontar a tela nem apagar formulários/filtros.
export function useDataRefresh(refresh, { paths = [], local = false } = {}) {
  let timer
  let disposed = false
  const currentUnit = () => {
    try { return JSON.parse(localStorage.getItem('user') || 'null')?.unit?.code || '' }
    catch { return '' }
  }
  function schedule() {
    if (disposed || document.visibilityState === 'hidden') return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!disposed) Promise.resolve().then(refresh).catch(error => console.error('Erro ao atualizar dados:', error))
    }, 150)
  }
  function changed(update) {
    if (!update || update.unit !== currentUnit()) return
    if (paths.length && !paths.some(path => update.path?.startsWith(path))) return
    schedule()
  }
  function storage(event) {
    if (event.key !== DATA_UPDATE_KEY || !event.newValue) return
    try { changed(JSON.parse(event.newValue)) } catch { /* Ignora eventos inválidos. */ }
  }
  function localChange(event) { changed(event.detail) }
  function visible() { if (document.visibilityState === 'visible') schedule() }
  onMounted(() => {
    window.addEventListener('focus', schedule)
    window.addEventListener('storage', storage)
    document.addEventListener('visibilitychange', visible)
    if (local) window.addEventListener(DATA_UPDATE_EVENT, localChange)
  })
  onUnmounted(() => {
    disposed = true
    clearTimeout(timer)
    window.removeEventListener('focus', schedule)
    window.removeEventListener('storage', storage)
    document.removeEventListener('visibilitychange', visible)
    window.removeEventListener(DATA_UPDATE_EVENT, localChange)
  })
}
