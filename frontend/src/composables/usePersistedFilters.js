import { ref, watch } from 'vue'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Keeps a filter set scoped to the active factory unit.
 * Storage failures are intentionally ignored so private browsing does not
 * prevent a page from loading.
 */
export function usePersistedFilters(key, defaults, unitCode = () => 'default') {
  const base = clone(defaults)
  const currentUnit = ref(unitCode?.() || 'default')
  const storageKey = () => `sobracorte:filters:${key}:${currentUnit.value}`

  function read() {
    try {
      const saved = localStorage.getItem(storageKey())
      return saved ? { ...clone(base), ...JSON.parse(saved) } : clone(base)
    } catch (_) {
      return clone(base)
    }
  }

  const filters = ref(read())

  watch(filters, (value) => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(value))
    } catch (_) {}
  }, { deep: true, flush: 'sync' })

  watch(unitCode, (value) => {
    currentUnit.value = value || 'default'
    filters.value = read()
  }, { flush: 'sync' })

  function resetFilters() {
    filters.value = clone(base)
  }

  return { filters, resetFilters }
}

export default usePersistedFilters
