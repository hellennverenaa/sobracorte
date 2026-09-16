import { computed, onMounted, ref } from 'vue'
import { api as defaultApi } from '@/services/httpClient'
import { usePersistedFilters } from './usePersistedFilters'
import { normalizeSector } from '@/utils/domain'

export const REPORT_DEFAULT_FILTERS = {
  sector: 'TODOS', tipoMovimento: 'TODOS', status: 'TODOS', periodo: 'last_30_days',
  dataInicio: '', dataFim: '', origin: 'TODOS', search: '',
}

export function getDatesFromPeriod(period, filters = {}, now = new Date()) {
  let start = new Date(now)
  let end = new Date(now)
  if (period === 'last_30_days') {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
  } else if (period === 'hoje') { start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
  } else if (period === 'semana') { const day = now.getDay(); start.setDate(now.getDate() - day + (day === 0 ? -6 : 1)); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
  } else if (period === 'mes_atual') { start = new Date(now.getFullYear(), now.getMonth(), 1); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
  } else if (period === 'ano_atual') { start = new Date(now.getFullYear(), 0, 1); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
  } else if (period === 'all') return { start: null, end: null }
  else if (period === 'custom') { if (!filters.dataInicio || !filters.dataFim) return null; start = new Date(`${filters.dataInicio}T00:00:00`); end = new Date(`${filters.dataFim}T23:59:59`) }
  return { start: start.toISOString(), end: end.toISOString() }
}

export function useReports(options = {}) {
  const requestApi = options.api || defaultApi
  const persisted = usePersistedFilters('reports', REPORT_DEFAULT_FILTERS, options.unitCode || (() => options.authStore?.user?.unit?.code || 'default'))
  const filters = persisted.filters
  const reportType = ref('movements')
  const loading = ref(false)
  const error = ref(null)
  const reportData = ref([])
  const currentPage = ref(1)
  const pageSize = options.pageSize || 50
  const pagination = ref({ page: 1, limit: pageSize, total: 0, totalPages: 1 })
  const totals = ref({})
  const hasSearched = ref(false)
  const isEmpty = computed(() => hasSearched.value && !loading.value && !error.value && reportData.value.length === 0)

  async function generateReport(page = 1) {
    loading.value = true; error.value = null; hasSearched.value = true; currentPage.value = page
    try {
      const dates = getDatesFromPeriod(filters.value.periodo, filters.value)
      if (filters.value.periodo === 'custom' && !dates) throw new Error('Selecione as datas de início e fim para o período personalizado.')
      const endpoint = reportType.value === 'requisitions' ? '/reports/requisitions' : '/reports/movements'
      const params = new URLSearchParams({
        sector: normalizeSector(filters.value.sector), page: String(page), limit: String(pageSize),
        ...(reportType.value === 'requisitions' ? { status: filters.value.status } : { tipoMovimento: filters.value.tipoMovimento, origin: filters.value.origin }),
      })
      if (dates?.start && dates?.end) { params.set('dataInicio', dates.start); params.set('dataFim', dates.end) }
      if (filters.value.search) params.set('search', filters.value.search)
      const response = await requestApi.get(`${endpoint}?${params}`)
      const data = response.data || {}
      reportData.value = data.items || []
      pagination.value = { ...pagination.value, ...(data.pagination || {}), page, limit: pageSize }
      totals.value = data.totals || data
      return data
    } catch (cause) {
      error.value = cause
      reportData.value = []
      throw cause
    } finally { loading.value = false }
  }

  function resetFilters() { persisted.resetFilters() }
  function setReportType(type) { reportType.value = type; return generateReport(1) }
  onMounted(() => { if (options.autoLoad !== false) generateReport(1).catch(() => {}) })
  return { filters, resetFilters, reportType, loading, error, reportData, currentPage, pageSize, pagination, totals, reportTotals: totals, hasSearched, isEmpty, totalPages: computed(() => pagination.value.totalPages || 1), generateReport, retry: () => generateReport(currentPage.value), setReportType }
}

export default useReports
