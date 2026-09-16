import { computed } from 'vue'
import { api } from '@/services/httpClient'
import { usePersistedFilters } from './usePersistedFilters'
import { normalizeSector } from '@/utils/domain'

export function useDashboard(options = {}) {
  const fetchSummary = options.fetchSummary || (() => api.get('/dashboard/summary').then((response) => response?.data || {}))
  const unitCode = options.unitCode || (() => options.authStore?.user?.unit?.code || 'default')
  const persisted = usePersistedFilters('dashboard', { sector: 'TODOS', topUnit: 'M²' }, unitCode)
  const selectedSector = computed({
    get: () => normalizeSector(persisted.filters.value.sector),
    set: (value) => { persisted.filters.value.sector = normalizeSector(value) },
  })
  const selectedTopUnit = computed({
    get: () => persisted.filters.value.topUnit || 'M²',
    set: (value) => { persisted.filters.value.topUnit = value },
  })

  function resetFilters() {
    persisted.resetFilters()
  }

  return {
    selectedSector,
    selectedTopUnit,
    fetchSummary,
    resetFilters,
  }
}

export default useDashboard
