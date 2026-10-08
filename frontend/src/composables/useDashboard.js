import { computed } from 'vue'
import { api } from '@/services/httpClient'
import { usePersistedFilters } from './usePersistedFilters'
import { normalizeSector } from '@/utils/domain'

export function useDashboard(options = {}) {
  const fetchSummary = options.fetchSummary || (() => api.get('/dashboard/summary').then((response) => response?.data || {}))
  const unitCode = options.unitCode || (() => options.authStore?.user?.unit?.code || 'default')
  const persisted = usePersistedFilters('dashboard_read_all', { sector: 'TODOS', topUnit: 'M²' }, unitCode)
  const assignedSector = computed(() => {
    const user = options.authStore?.user
    if (!user || user.role === 'admin' || user.isGlobalAdmin) return null
    const sector = normalizeSector(user.assignedSector)
    return sector && sector !== 'TODOS' ? sector : null
  })
  const selectedSector = computed({
    get: () => {
      return assignedSector.value || normalizeSector(persisted.filters.value.sector) || 'TODOS';
    },
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
    assignedSector,
    selectedSector,
    selectedTopUnit,
    fetchSummary,
    resetFilters,
  }
}
