import { computed, ref, watch } from 'vue'
import { api } from '../services/httpClient'
import { usePersistedFilters } from './usePersistedFilters'
import { normalizeSector, requestErrorMessage } from '../utils/domain'

/**
 * State and query behaviour for the requisitions inbox.
 * The page owns the creation/fulfilment workflows; this composable owns the
 * list query so loading, errors and retries behave consistently.
 */
export function useRequisitions({ route, authStore, notify = () => {} } = {}) {
  const initialStatus = route?.query?.status ? String(route.query.status) : ''
  const unitCode = () => authStore?.user?.unit?.code || 'default'
  const persisted = usePersistedFilters('requisitions', {
    status: initialStatus,
    sector: '',
    search: '',
    onlyPendingWithStock: false,
  }, unitCode)

  const filters = persisted.filters
  const filterStatus = computed({
    get: () => filters.value.status || '',
    set: value => { filters.value.status = value || '' },
  })
  const filterSector = computed({
    get: () => filters.value.sector || '',
    set: value => { filters.value.sector = value || '' },
  })
  const search = computed({
    get: () => filters.value.search || '',
    set: value => { filters.value.search = value || '' },
  })
  const appliedSearch = ref(search.value)
  const onlyPendingWithStock = computed({
    get: () => Boolean(filters.value.onlyPendingWithStock),
    set: value => { filters.value.onlyPendingWithStock = Boolean(value) },
  })

  const requisitions = ref([])
  const loading = ref(false)
  const error = ref('')
  const totalCount = ref(0)
  const currentPage = ref(1)
  const totalPages = ref(1)

  async function loadRequisitions(page = currentPage.value) {
    loading.value = true
    error.value = ''
    currentPage.value = page
    try {
      const params = { page, limit: 20 }
      if (filterStatus.value) params.status = filterStatus.value
      if (filterSector.value) params.requestSector = filterSector.value
      if (appliedSearch.value) params.search = appliedSearch.value
      const response = await api.get('/requisitions', { params })
      const data = response.data || {}
      requisitions.value = data.data || []
      totalCount.value = data.total || 0
      totalPages.value = data.totalPages || 1
      return data
    } catch (requestError) {
      console.error('Erro ao carregar requisições:', requestError)
      error.value = requestErrorMessage(requestError, 'Erro ao carregar requisições de reposição.')
      notify(error.value, 'error')
      return null
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    appliedSearch.value = search.value.trim()
    return loadRequisitions(1)
  }

  function clearSearch() {
    search.value = ''
    appliedSearch.value = ''
    return loadRequisitions(1)
  }

  const displayedRequisitions = computed(() => {
    if (!onlyPendingWithStock.value) return requisitions.value
    return requisitions.value.filter(item =>
      (item.status === 'PENDENTE' || item.status === 'ATENDIDA_PARCIAL') && item.stockAvailable > 0
    )
  })

  const stats = computed(() => ({
    total: totalCount.value,
    pendingWithStock: requisitions.value.filter(item =>
      (item.status === 'PENDENTE' || item.status === 'ATENDIDA_PARCIAL') &&
      item.stockAvailable >= (item.quantityRequested - item.quantityFulfilled)
    ).length,
    pendingNoStock: requisitions.value.filter(item =>
      (item.status === 'PENDENTE' || item.status === 'ATENDIDA_PARCIAL') && item.stockAvailable === 0
    ).length,
    fulfilled: requisitions.value.filter(item => item.status === 'ATENDIDA_TOTAL').length,
  }))

  // Sector restrictions are derived from the current session and must win over
  // a stale filter saved for another role/unit.
  const assignedSector = computed(() => {
    const sector = authStore?.user?.assignedSector
    if (!sector || sector === 'TODOS') return null
    return normalizeSector(sector)
  })
  watch(assignedSector, sector => {
    if (authStore?.user?.role !== 'admin' && sector) filterSector.value = sector
  }, { immediate: true })

  if (route) {
    watch(() => route.query.status, status => {
      if (status) {
        filterStatus.value = String(status)
        loadRequisitions(1)
      }
    })
  }

  return {
    filters,
    resetFilters: persisted.resetFilters,
    requisitions,
    loading,
    error,
    totalCount,
    currentPage,
    totalPages,
    filterStatus,
    filterSector,
    search,
    appliedSearch,
    onlyPendingWithStock,
    displayedRequisitions,
    stats,
    userAssignedSector: assignedSector,
    loadRequisitions,
    handleSearch,
    clearSearch,
  }
}
