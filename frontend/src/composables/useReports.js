import { computed, onMounted, ref } from 'vue'
import { api as defaultApi } from '@/services/httpClient'
import { usePersistedFilters } from './usePersistedFilters'
import { normalizeSector } from '@/utils/domain'

export const REPORT_DEFAULT_FILTERS = {
  sector: 'TODOS', tipoMovimento: 'TODOS', status: 'TODOS', periodo: 'last_30_days',
  dataInicio: '', dataFim: '', origin: 'TODOS', search: '', subsectorId: '',
}

const DEFAULT_REPORT_TOTALS = {
  totalRegistros: 0,
  qtdOperacoesEntrada: 0,
  qtdOperacoesSaida: 0,
  qtdOperacoesRefugo: 0,
  volumeTotalEntrada: 0,
  volumeTotalSaida: 0,
  volumeEntradas: 0,
  volumeSaidas: 0,
  totalRefugos: 0,
  totalCasamentosPares: 0,
  totalTransferencias: 0,
  volumeEntradaCorte: 0,
  volumeEntradaOutros: 0,
  volumeSaidaCorte: 0,
  volumeSaidaOutros: 0,
  volumePorUnidade: {},
  totalAtendidas: 0,
  totalPendentes: 0,
  totalCanceladas: 0,
  taxaAtendimento: 0,
}

function normalizeReportTotals(data, reportType) {
  const totals = data?.totals || data || {}
  if (reportType === 'requisitions') {
    return {
      ...DEFAULT_REPORT_TOTALS,
      totalRegistros: totals.totalRegistros ?? 0,
      totalAtendidas: totals.totalAtendidas ?? 0,
      totalPendentes: totals.totalPendentes ?? 0,
      totalCanceladas: totals.totalCanceladas ?? 0,
      taxaAtendimento: totals.taxaAtendimento ?? 0,
    }
  }
  return {
    ...DEFAULT_REPORT_TOTALS,
    totalRegistros: totals.totalRegistros ?? 0,
    qtdOperacoesEntrada: totals.qtdOperacoesEntrada ?? 0,
    qtdOperacoesSaida: totals.qtdOperacoesSaida ?? 0,
    qtdOperacoesRefugo: totals.qtdOperacoesRefugo ?? 0,
    volumeTotalEntrada: totals.volumeTotalEntrada !== undefined ? totals.volumeTotalEntrada : totals.volumeEntradas ?? 0,
    volumeTotalSaida: totals.volumeTotalSaida !== undefined ? totals.volumeTotalSaida : totals.volumeSaidas ?? 0,
    volumeEntradas: totals.volumeTotalEntrada !== undefined ? totals.volumeTotalEntrada : totals.volumeEntradas ?? 0,
    volumeSaidas: totals.volumeTotalSaida !== undefined ? totals.volumeTotalSaida : totals.volumeSaidas ?? 0,
    totalRefugos: totals.totalRefugos !== undefined ? totals.totalRefugos : 0,
    totalCasamentosPares: totals.totalCasamentosPares ?? 0,
    totalTransferencias: totals.totalTransferencias !== undefined ? totals.totalTransferencias : 0,
    volumeEntradaCorte: totals.volumeEntradaCorte !== undefined ? totals.volumeEntradaCorte : 0,
    volumeEntradaOutros: totals.volumeEntradaOutros !== undefined ? totals.volumeEntradaOutros : 0,
    volumeSaidaCorte: totals.volumeSaidaCorte !== undefined ? totals.volumeSaidaCorte : 0,
    volumeSaidaOutros: totals.volumeSaidaOutros !== undefined ? totals.volumeSaidaOutros : 0,
    volumePorUnidade: totals.volumePorUnidade || {},
  }
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
  function restrictSector() {
    const user = options.authStore?.user;
    if (user && user.role !== 'admin' && !user.isGlobalAdmin) filters.value.sector = normalizeSector(user.assignedSector);
  }
  restrictSector()
  const reportType = ref('movements')
  const loading = ref(false)
  const error = ref(null)
  const reportData = ref([])
  const currentPage = ref(1)
  const pageSize = options.pageSize || 50
  const pagination = ref({ page: 1, limit: pageSize, total: 0, totalPages: 1 })
  const reportTotals = ref({ ...DEFAULT_REPORT_TOTALS })
  const appliedFilters = ref(null)
  const appliedQuery = ref('')
  const appliedType = ref(null)
  let requestVersion = 0
  const filtersDirty = computed(() => !appliedFilters.value || appliedType.value !== reportType.value || JSON.stringify(appliedFilters.value) !== JSON.stringify(filters.value))

  async function generateReport(page = 1) {
    restrictSector();
    const version = ++requestVersion
    const requestedFilters = { ...filters.value }
    const requestedType = reportType.value
    loading.value = true; error.value = null
    try {
      const dates = getDatesFromPeriod(requestedFilters.periodo, requestedFilters)
      if (requestedFilters.periodo === 'custom' && !dates) throw new Error('Selecione as datas de início e fim para o período personalizado.')
      const endpoint = requestedType === 'requisitions' ? '/reports/requisitions' : '/reports/movements'
      const params = new URLSearchParams({
        sector: normalizeSector(requestedFilters.sector), page: String(page), limit: String(pageSize),
        ...(requestedType === 'requisitions' ? { status: requestedFilters.status } : { tipoMovimento: requestedFilters.tipoMovimento, origin: requestedFilters.origin }),
      })
      if (requestedType === 'movements' && requestedFilters.subsectorId) params.set('subsectorId', String(requestedFilters.subsectorId))
      if (dates?.start && dates?.end) { params.set('dataInicio', dates.start); params.set('dataFim', dates.end) }
      if (requestedFilters.search) params.set('search', requestedFilters.search)
      const response = await requestApi.get(`${endpoint}?${params}`)
      if (version !== requestVersion) return
      const data = response.data || {}
      appliedFilters.value = requestedFilters
      appliedType.value = requestedType
      appliedQuery.value = `${endpoint}?${params}`
      currentPage.value = page
      reportData.value = data.items || []
      pagination.value = { ...pagination.value, ...(data.pagination || {}), page, limit: pageSize }
      reportTotals.value = normalizeReportTotals(data, requestedType)
      return data
    } catch (cause) {
      if (version !== requestVersion) return
      error.value = cause
      reportData.value = []
      throw cause
    } finally { if (version === requestVersion) loading.value = false }
  }

  async function completeReport() {
    if (filtersDirty.value || loading.value) throw new Error('Aplique os filtros antes de imprimir o relatório.')
    const [endpoint, query] = appliedQuery.value.split('?')
    const params = new URLSearchParams(query)
    params.set('limit', '200')
    params.set('page', '1')
    const first = (await requestApi.get(`${endpoint}?${params}`)).data
    if (first.pagination.total > 10000) throw new Error('A impressão completa permite até 10.000 registros. Reduza o período ou exporte o CSV completo.')
    const items = [...first.items]
    for (let page = 2; page <= first.pagination.totalPages; page++) {
      params.set('page', String(page))
      const data = (await requestApi.get(`${endpoint}?${params}`)).data
      if (data.pagination.total !== first.pagination.total) throw new Error('Os registros mudaram durante a preparação. Gere o relatório novamente.')
      items.push(...data.items)
    }
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Os registros mudaram durante a preparação. Gere o relatório novamente.')
    if (items.length !== first.pagination.total) throw new Error('Não foi possível carregar todos os registros. Gere o relatório novamente.')
    return { items, totals: normalizeReportTotals(first, appliedType.value), pagination: first.pagination }
  }

  function resetFilters() { persisted.resetFilters(); restrictSector() }
  function setReportType(type) { reportType.value = type; return generateReport(1) }
  onMounted(() => { if (options.autoLoad !== false) generateReport(1).catch(() => {}) })
  return { filters, resetFilters, reportType, loading, error, reportData, currentPage, pagination, reportTotals, generateReport, setReportType, appliedFilters, appliedQuery, filtersDirty, completeReport }
}
