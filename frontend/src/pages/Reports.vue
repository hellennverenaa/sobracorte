<script setup>
import { ref, computed, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useReports } from '@/composables/useReports'
import ReportStatus from '@/components/ReportStatus.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import { requestErrorMessage } from '@/utils/domain'
import { normalizeSector, SECTOR_OPTIONS } from '@/utils/domain'
import { formatNumber, formatDate } from '@/utils/format'
import {
  FileSpreadsheet,
  Printer,
  Search,
  Calendar,
  Filter,
  FileBarChart,
  CheckCircle,
  XCircle,
  Layers,
  Repeat,
  Footprints,
  Trash2,
  ArrowDownRight,
  ArrowUpRight,
  MapPin,
  UserCheck,
  RotateCcw,
  ClipboardList,
  Clock,
  Ban,
  RefreshCw
} from 'lucide-vue-next'
import { exportToCSV } from '@/utils/export'
import { api } from '@/services/httpClient'

const authStore = useAuthStore()
const reportDomain = useReports({
  authStore,
  autoLoad: false,
  api,
  unitCode: () => authStore.user?.unit?.code || 'default',
})

// --- TIPO DE RELATÓRIO ATIVO ---
const { reportType, filters, loading, reportData, currentPage, pagination, hasSearched } = reportDomain
const isRequisitionsEnabled = computed(() => authStore.user?.unit?.enableRequisitions !== false)

// --- ESTADOS REATIVOS ---
const loadError = ref('')
const reportTotals = ref({
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
})

// --- HELPERS DE VOLUME & UNIDADES ---
const currentUnitSuffix = computed(() => {
  const sec = filters.value.sector
  if (sec === 'CORTE') return 'm²'
  if (sec === 'MONTAGEM' || sec === 'PRE_FABRICADO') return 'pares/pés'
  if (sec === 'APOIO' || sec === 'DISTRIBUICAO' || sec === 'CONSUMO') return 'un'
  return 'un'
})

function formatVolume(val) {
  if (val === null || val === undefined) return '—'
  const num = Number(val)
  if (isNaN(num)) return '0'
  return num.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

// --- PERMISSÕES RBAC ---
const canExport = computed(() => {
  const role = authStore.user?.role
  return role === 'admin' || role === 'admin_setor' || role === 'lider'
})

// --- NOTIFICAÇÕES TOAST ---
const { notification, showNotification } = useToast(3500)

// --- OPÇÕES DOS SELECTS ---
const sectors = computed(() => SECTOR_OPTIONS.filter(sector =>
  authStore.user?.role === 'admin' || authStore.user?.isGlobalAdmin || sector.id === normalizeSector(authStore.user?.assignedSector)
).map((sector) => ({
  value: sector.id,
  label: sector.id === 'TODOS' ? 'Todos os Setores (Geral)' : sector.label,
})))

const operationTypes = [
  { value: 'TODOS', label: 'Todas as Operações' },
  { value: 'ENTRADA', label: 'Entradas de Sobras' },
  { value: 'SAIDA', label: 'Saídas (Inclui Casamentos e Requisições)' },
  { value: 'TRANSFERENCIA', label: 'Transferências entre Prateleiras' },
  { value: 'CASAMENTO_PAR', label: 'Casamento de Pares (Multi-Setor)' },
  { value: 'SAIDA_REQUISICAO', label: 'Saídas por Requisição' },
  { value: 'REFUGO', label: 'Refugos / Descartes' },
]

const requisitionStatuses = [
  { value: 'TODOS', label: 'Todos os Status' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'ATENDIDA_TOTAL', label: 'Atendida Total' },
  { value: 'ATENDIDA_PARCIAL', label: 'Atendida Parcial' },
  { value: 'CANCELADA', label: 'Cancelada' },
]

const periods = [
  { value: 'last_30_days', label: 'Últimos 30 Dias (Padrão)' },
  { value: 'mes_atual', label: 'Este Mês' },
  { value: 'semana', label: 'Esta Semana' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'ano_atual', label: 'Este Ano' },
  { value: 'all', label: 'Todos os Registros' },
  { value: 'custom', label: 'Período Personalizado' }
]

const originsList = ref([
  { value: 'TODOS', label: 'Todas as Origens / Motivos' }
])

async function fetchOrigins() {
  try {
    loadError.value = ''
    const res = await api.get('/settings/origins')
    if (Array.isArray(res.data)) {
      originsList.value = [
        { value: 'TODOS', label: 'Todas as Origens / Motivos' },
        ...res.data.map(o => ({
          value: o.name,
          label: o.name
        }))
      ]
    }
  } catch (err) {
    console.error("Erro ao carregar origens para o relatório:", err)
  }
}

onMounted(() => {
  fetchOrigins()
  generateReport(1)
})

// --- CÁLCULO DE DATAS ISO PARA BACKEND ---
function getDatesFromPeriod(period) {
  const now = new Date()
  let start = new Date()
  let end = new Date()

  if (period === 'last_30_days') {
    start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else if (period === 'hoje') {
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else if (period === 'semana') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    start = new Date(now.setDate(diff))
    start.setHours(0, 0, 0, 0)
    end = new Date()
    end.setHours(23, 59, 59, 999)
  } else if (period === 'mes_atual') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end = new Date()
    end.setHours(23, 59, 59, 999)
  } else if (period === 'ano_atual') {
    start.setMonth(0, 1)
    start.setHours(0, 0, 0, 0)
    end = new Date()
    end.setHours(23, 59, 59, 999)
  } else if (period === 'all') {
    return {
      start: null,
      end: null
    }
  } else if (period === 'custom') {
    if (!filters.value.dataInicio || !filters.value.dataFim) return null
    start = new Date(filters.value.dataInicio + 'T00:00:00')
    end = new Date(filters.value.dataFim + 'T23:59:59')
  }

  return {
    start: start ? start.toISOString() : null,
    end: end ? end.toISOString() : null
  }
}

// --- CONSULTA ANALÍTICA AO BACKEND ---
async function generateReport(page = 1) {
  try {
    const dates = getDatesFromPeriod(filters.value.periodo)
    if (filters.value.periodo === 'custom' && !dates) {
      showNotification('error', 'Selecione as datas de início e fim para o período personalizado.')
      return
    }
    const data = await reportDomain.generateReport(page)
    const totals = data?.totals || data || {}
    if (reportType.value === 'requisitions') {
      reportTotals.value = {
        ...reportTotals.value,
        totalRegistros: totals.totalRegistros || 0,
        totalAtendidas: totals.totalAtendidas || 0,
        totalPendentes: totals.totalPendentes || 0,
        totalCanceladas: totals.totalCanceladas || 0,
        taxaAtendimento: totals.taxaAtendimento || 0,
      }
    } else {
      reportTotals.value = {
        ...reportTotals.value,
        totalRegistros: totals.totalRegistros || 0,
        qtdOperacoesEntrada: totals.qtdOperacoesEntrada || 0,
        qtdOperacoesSaida: totals.qtdOperacoesSaida || 0,
        qtdOperacoesRefugo: totals.qtdOperacoesRefugo || 0,
        volumeTotalEntrada: totals.volumeTotalEntrada ?? totals.volumeEntradas ?? 0,
        volumeTotalSaida: totals.volumeTotalSaida ?? totals.volumeSaidas ?? 0,
        volumeEntradas: totals.volumeTotalEntrada ?? totals.volumeEntradas ?? 0,
        volumeSaidas: totals.volumeTotalSaida ?? totals.volumeSaidas ?? 0,
        totalRefugos: totals.totalRefugos || 0,
        totalCasamentosPares: totals.totalCasamentosPares || 0,
        totalTransferencias: totals.totalTransferencias || 0,
        volumeEntradaCorte: totals.volumeEntradaCorte || 0,
        volumeEntradaOutros: totals.volumeEntradaOutros || 0,
        volumeSaidaCorte: totals.volumeSaidaCorte || 0,
        volumeSaidaOutros: totals.volumeSaidaOutros || 0,
        volumePorUnidade: totals.volumePorUnidade || {},
      }
    }
  } catch (error) {
    console.error("Erro ao gerar relatório:", error)
    loadError.value = requestErrorMessage(error, 'Erro ao conectar com a base de dados de relatórios.')
    showNotification('error', loadError.value)
  }
}

function switchReportType(type) {
  reportType.value = type
  reportData.value = []
  generateReport(1)
}

function resetFilters() {
  reportDomain.resetFilters()
  generateReport(1)
}

const isExporting = ref(false)

// --- EXPORTAÇÃO CSV VIA STREAMING HTTP CONTÍNUO ---
async function downloadExcel() {
  if (isExporting.value) return
  isExporting.value = true

  try {
    const dates = getDatesFromPeriod(filters.value.periodo)
    if (filters.value.periodo === 'custom' && !dates) {
      showNotification('error', "Selecione as datas de início e fim para o período personalizado.")
      isExporting.value = false
      return
    }

    let endpoint = ''
    let defaultFilename = ''

    if (reportType.value === 'requisitions') {
      const params = new URLSearchParams({
        sector: filters.value.sector,
        status: filters.value.status,
      })
      if (dates?.start && dates?.end) {
        params.append('dataInicio', dates.start)
        params.append('dataFim', dates.end)
      }
      if (filters.value.search) params.append('search', filters.value.search)

      endpoint = `/reports/requisitions/export?${params.toString()}`
      const secName = filters.value.sector !== 'TODOS' ? `_${filters.value.sector}` : ''
      defaultFilename = `SobrasDASS_Requisicoes${secName}_${new Date().toISOString().split('T')[0]}.csv`
    } else {
      const params = new URLSearchParams({
        sector: filters.value.sector,
        tipoMovimento: filters.value.tipoMovimento,
        origin: filters.value.origin,
      })
      if (dates?.start && dates?.end) {
        params.append('dataInicio', dates.start)
        params.append('dataFim', dates.end)
      }
      if (filters.value.search) params.append('search', filters.value.search)

      endpoint = `/reports/movements/export?${params.toString()}`
      const secName = filters.value.sector !== 'TODOS' ? `_${filters.value.sector}` : ''
      defaultFilename = `SobrasDASS_Movimentacoes${secName}_${new Date().toISOString().split('T')[0]}.csv`
    }

    showNotification('success', 'Iniciando download contínuo do relatório completo...')

    const res = await api.get(endpoint, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = window.URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', defaultFilename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    showNotification('success', 'Relatório completo baixado com sucesso!')
  } catch (error) {
    console.error('Erro ao exportar relatório por streaming:', error)
    showNotification('error', 'Falha ao processar exportação contínua do relatório.')
  } finally {
    isExporting.value = false
  }
}

function printPDF() {
  window.print()
}

// --- PAGINAÇÃO NO SERVIDOR ---
const totalPages = computed(() => {
  return pagination.value.totalPages || 1
})

function setCurrentPage(page) {
  if (loading.value || page < 1 || page > totalPages.value || page === currentPage.value) return
  generateReport(page)
}

// --- FORMATADORES DE RÓTULOS ---
function getSectorLabel(val) {
  const found = sectors.value.find(s => s.value === val)
  return found ? found.label : val
}

function getSectorShort(sec) {
  const map = {
    CORTE: 'CORTE',
    APOIO: 'APOIO',
    PRE_FABRICADO: 'PRÉ-FAB.',
    DISTRIBUICAO: 'DISTRIB.',
    EXPEDICAO: 'DISTRIB.',
    MONTAGEM: 'MONTAGEM',
    CONSUMO: 'CONSUMO'
  }
  return map[sec] || sec || 'CORTE'
}

function getOperationLabel(val) {
  const found = operationTypes.find(o => o.value === val)
  return found ? found.label : val
}

function getTypeShort(tipo) {
  const map = {
    ENTRADA: 'ENTRADA',
    SAIDA: 'SAÍDA',
    SAIDA_REQUISICAO: 'SAÍDA REQ.',
    TRANSFERENCIA: 'TRANSF.',
    CASAMENTO_PAR: 'CASAM. PAR',
    REFUGO: 'REFUGO'
  }
  return map[tipo] || tipo
}

function getPeriodLabel() {
  if (filters.value.periodo === 'custom') {
    if (filters.value.dataInicio && filters.value.dataFim) {
      const d1 = new Date(filters.value.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')
      const d2 = new Date(filters.value.dataFim + 'T23:59:59').toLocaleDateString('pt-BR')
      return `${d1} a ${d2}`
    }
    return 'Período Personalizado'
  }
  const found = periods.find(p => p.value === filters.value.periodo)
  return found ? found.label : filters.value.periodo
}

// --- CORES DE BADGES ---
function getSectorBadge(sector) {
  const map = {
    CORTE: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    APOIO: 'bg-sky-100 text-sky-800 border-sky-300',
    PRE_FABRICADO: 'bg-amber-100 text-amber-800 border-amber-300',
    DISTRIBUICAO: 'bg-purple-100 text-purple-800 border-purple-300',
    EXPEDICAO: 'bg-purple-100 text-purple-800 border-purple-300',
    MONTAGEM: 'bg-pink-100 text-pink-800 border-pink-300',
    CONSUMO: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  }
  return map[sector] || 'bg-slate-100 text-slate-800 border-slate-300'
}

function getTypeBadge(type) {
  const map = {
    ENTRADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    SAIDA: 'bg-blue-50 text-blue-700 border-blue-200',
    SAIDA_REQUISICAO: 'bg-blue-50 text-blue-700 border-blue-200',
    TRANSFERENCIA: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    CASAMENTO_PAR: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    REFUGO: 'bg-red-50 text-red-700 border-red-200',
  }
  return map[type] || 'bg-slate-50 text-slate-700 border-slate-200'
}

function getStatusBadge(status) {
  const map = {
    PENDENTE: 'bg-amber-50 text-amber-700 border-amber-300',
    ATENDIDA_TOTAL: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    ATENDIDA_PARCIAL: 'bg-blue-50 text-blue-700 border-blue-300',
    CANCELADA: 'bg-gray-100 text-gray-600 border-gray-300',
  }
  return map[status] || 'bg-slate-100 text-slate-700 border-slate-300'
}
</script>

<template>
  <Layout>
    <ToastNotification :notification="notification" />
    <ReportStatus :loading="loading && !reportData.length" :error="loadError" :empty="false" @retry="() => generateReport(currentPage)" />

    <div id="printable-report" class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 print:p-0 print:m-0 print:max-w-none print:space-y-0 report-container">

      <!-- CABEÇALHO CORPORATIVO FORMAL DASS (IMPRESSÃO / PDF) -->
      <div class="hidden print:block mb-2 pb-1.5 border-b-2 border-slate-900">
        <div class="flex justify-between items-start">
          <div>
            <div class="text-[10px] font-black tracking-widest text-slate-800 uppercase">
              GRUPO DASS — UNIDADE {{ authStore.user?.unit?.code || 'SEST' }} ({{ authStore.user?.unit?.name || 'SANTO ESTÊVÃO/BA' }})
            </div>
            <h1 class="text-sm font-black text-slate-900 uppercase tracking-tight mt-0.5">
              {{ reportType === 'requisitions' ? 'Relatório Gerencial de Requisições de Reposição Fabril' : 'Relatório Gerencial de Gestão de Sobras e Movimentações' }}
            </h1>
          </div>
          <div class="text-right text-[9px] text-slate-700 font-semibold leading-tight">
            <div><strong>Emissão:</strong> {{ new Date().toLocaleDateString('pt-BR') }} às {{ new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}</div>
            <div><strong>Emissor:</strong> {{ authStore.user?.nome }} <span v-if="authStore.user?.matriculaDass || authStore.user?.usuario">(Mat: {{ authStore.user?.matriculaDass || authStore.user?.usuario }})</span></div>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2 mt-1.5 pt-1.5 border-t border-slate-300 text-[9px] text-slate-800">
          <div><span class="font-bold text-slate-900">Setor:</span> {{ getSectorLabel(filters.sector) }}</div>
          <div><span class="font-bold text-slate-900">{{ reportType === 'requisitions' ? 'Status:' : 'Operação:' }}</span> {{ reportType === 'requisitions' ? filters.status : getOperationLabel(filters.tipoMovimento) }}</div>
          <div><span class="font-bold text-slate-900">Período:</span> {{ getPeriodLabel() }}</div>
          <div><span class="font-bold text-slate-900">Filtro:</span> {{ filters.search || 'Geral' }}</div>
        </div>

        <!-- Síntese Executiva de Movimentações (Visão Dupla: Operações vs Volume Físico) -->
        <div v-if="reportType === 'movements' && reportData.length > 0" class="mt-1.5 pt-1.5 border-t border-slate-300 grid grid-cols-4 gap-2 text-[9px] bg-slate-50 p-1.5 rounded">
          <div>
            <strong>Entradas Realizadas:</strong> {{ reportTotals.qtdOperacoesEntrada }} op
            <span class="text-slate-600 block">Vol: {{ formatVolume(reportTotals.volumeTotalEntrada) }} {{ currentUnitSuffix }}</span>
          </div>
          <div>
            <strong>Saídas Realizadas:</strong> {{ reportTotals.qtdOperacoesSaida }} op
            <span class="text-slate-600 block">Vol: {{ formatVolume(reportTotals.volumeTotalSaida) }} {{ currentUnitSuffix }}</span>
          </div>
          <div>
            <strong>Casamento Pares:</strong> {{ reportTotals.totalCasamentosPares }} pares
            <span class="text-slate-600 block">({{ reportTotals.totalCasamentosPares * 2 }} pés baixados)</span>
          </div>
          <div>
            <strong>Refugos / Perdas:</strong> {{ reportTotals.qtdOperacoesRefugo || 0 }} op
            <span class="text-slate-600 block">Vol: {{ formatVolume(reportTotals.totalRefugos) }} {{ currentUnitSuffix }}</span>
          </div>
        </div>
      </div>

      <!-- CABEÇALHO PRINCIPAL EM TELA -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 class="text-2xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
            <FileBarChart class="w-7 h-7 text-indigo-600" /> Central de Relatórios Analíticos
          </h1>
          <p class="text-slate-500 text-xs mt-0.5">
            Consulte, audite e exporte métricas de estoque, movimentações e requisições fabris.
          </p>
        </div>

        <div class="flex items-center gap-2" v-if="reportData.length > 0">
          <button
            type="button"
            @click="printPDF"
            aria-label="Imprimir ou salvar o relatório em PDF"
            class="px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl shadow hover:bg-slate-900 transition-all flex items-center gap-1.5"
          >
            <Printer class="w-4 h-4" /> Imprimir / PDF
          </button>
          <button
            v-if="canExport"
            type="button"
            @click="downloadExcel"
            aria-label="Exportar relatório CSV"
            :disabled="isExporting"
            class="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
          >
            <RefreshCw v-if="isExporting" class="w-4 h-4 animate-spin" />
            <FileSpreadsheet v-else class="w-4 h-4" />
            <span>{{ isExporting ? 'Exportando...' : 'Exportar CSV' }}</span>
          </button>
        </div>
      </div>

      <!-- SELETOR DE TIPO DE RELATÓRIO (TABS) -->
      <div class="flex gap-2 bg-slate-200/70 p-1.5 rounded-2xl w-fit print:hidden">
        <button
          type="button"
          @click="switchReportType('movements')"
          role="tab"
          :aria-selected="reportType === 'movements'"
          class="px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2"
          :class="reportType === 'movements' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
        >
          <FileBarChart class="w-4 h-4" /> Movimentações & Estoque
        </button>
        <button
          v-if="isRequisitionsEnabled"
          type="button"
          @click="switchReportType('requisitions')"
          role="tab"
          :aria-selected="reportType === 'requisitions'"
          class="px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2"
          :class="reportType === 'requisitions' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
        >
          <ClipboardList class="w-4 h-4" /> Requisições de Reposição Fabril
        </button>
      </div>

      <!-- PAINEL DE FILTROS AVANÇADOS -->
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 print:hidden space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <!-- 1. Filtro de Setor -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Setor Industrial
            </label>
            <div class="relative">
              <Layers class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                v-model="filters.sector"
                aria-label="Setor industrial"
                class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option v-for="s in sectors" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
          </div>

          <!-- 2. Filtro de Operação / Status -->
          <div v-if="reportType === 'movements'">
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Tipo de Operação
            </label>
            <div class="relative">
              <Repeat class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                v-model="filters.tipoMovimento"
                aria-label="Tipo de operação"
                class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option v-for="op in operationTypes" :key="op.value" :value="op.value">{{ op.label }}</option>
              </select>
            </div>
          </div>
          <div v-else>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Status da Requisição
            </label>
            <div class="relative">
              <CheckCircle class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                v-model="filters.status"
                aria-label="Status da requisição"
                class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option v-for="st in requisitionStatuses" :key="st.value" :value="st.value">{{ st.label }}</option>
              </select>
            </div>
          </div>

          <!-- 3. Filtro de Período -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Período de Tempo
            </label>
            <div class="relative">
              <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                v-model="filters.periodo"
                aria-label="Período de tempo"
                class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option v-for="p in periods" :key="p.value" :value="p.value">{{ p.label }}</option>
              </select>
            </div>
          </div>

          <!-- 4. Busca por Texto Livre -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Buscar Código / SKU / Material
            </label>
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                v-model="filters.search"
                aria-label="Buscar código, SKU ou material"
                type="text"
                placeholder="Ex: SKU, Código, Modelo..."
                class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                @keyup.enter="generateReport(1)"
              />
            </div>
          </div>
        </div>

        <!-- Campos de Data Customizada -->
        <div v-if="filters.periodo === 'custom'" class="pt-3 border-t border-slate-100 flex flex-wrap gap-4 items-center">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-500">De:</span>
            <input
              type="date"
              v-model="filters.dataInicio"
              class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-500">Até:</span>
            <input
              type="date"
              v-model="filters.dataFim"
              class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            @click="resetFilters"
            aria-label="Limpar filtros"
            class="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <RotateCcw class="w-3.5 h-3.5" /> Limpar Filtros
          </button>
          <button
            type="button"
            @click="generateReport(1)"
            aria-label="Aplicar filtros"
            :disabled="loading"
            class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Search class="w-3.5 h-3.5" /> {{ loading ? 'Consultando...' : 'Aplicar Filtros' }}
          </button>
        </div>
      </div>

      <!-- KPI METRIC CARDS INTEGRADOS (RELATÓRIO DE MOVIMENTAÇÕES) -->
      <div v-if="reportType === 'movements' && reportData.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 print:hidden">
        
        <!-- 1. Total Registros / Auditoria -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Histórico</span>
              <span class="p-1 bg-slate-100 rounded-lg text-slate-500"><Layers class="w-3.5 h-3.5" /></span>
            </div>
            <p class="text-[11px] font-bold text-slate-600 uppercase mt-0.5">Total Registros</p>
            <p class="text-2xl font-black text-slate-900 mt-1">{{ reportTotals.totalRegistros.toLocaleString('pt-BR') }}</p>
          </div>
          <p class="text-[10px] font-semibold text-slate-400 mt-2 border-t border-slate-100 pt-1.5 truncate">
            Auditoria de Linha
          </p>
        </div>

        <!-- 2. Card Duplo: Entradas de Sobras -->
        <div class="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs flex flex-col justify-between bg-gradient-to-br from-white to-emerald-50/30">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Lançamentos</span>
              <span class="p-1 bg-emerald-100 rounded-lg text-emerald-600"><ArrowDownRight class="w-3.5 h-3.5" /></span>
            </div>
            <p class="text-[11px] font-bold text-emerald-700 uppercase mt-0.5">Entradas Realizadas</p>
            <div class="flex items-baseline gap-1 mt-1">
              <span class="text-2xl font-black text-emerald-800">{{ reportTotals.qtdOperacoesEntrada.toLocaleString('pt-BR') }}</span>
              <span class="text-xs font-bold text-emerald-600 uppercase">operações</span>
            </div>
          </div>
          <div class="mt-2 border-t border-emerald-100 pt-1.5">
            <span class="text-[10px] font-bold text-slate-500 uppercase">Volume Total:</span>
            <span v-if="filters.sector === 'TODOS'" class="block text-[11px] font-black text-emerald-700 leading-tight">
              <template v-for="([unit, values], index) in Object.entries(reportTotals.volumePorUnidade)" :key="unit">
                <span v-if="index > 0" class="font-normal text-slate-400"> | </span>{{ formatVolume(values.entrada) }} {{ unit }}
              </template>
            </span>
            <span v-else class="block text-xs font-black text-emerald-700 leading-tight">
              <template v-if="reportTotals.volumeTotalEntrada !== null">{{ formatVolume(reportTotals.volumeTotalEntrada) }} <span class="text-[10px] font-bold text-emerald-600 uppercase">{{ currentUnitSuffix }}</span></template>
              <span v-else>múltiplas unidades</span>
            </span>
          </div>
        </div>

        <!-- 3. Card Duplo: Saídas / Baixas -->
        <div class="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs flex flex-col justify-between bg-gradient-to-br from-white to-blue-50/30">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-blue-600 uppercase tracking-wider">Baixas</span>
              <span class="p-1 bg-blue-100 rounded-lg text-blue-600"><ArrowUpRight class="w-3.5 h-3.5" /></span>
            </div>
            <p class="text-[11px] font-bold text-blue-700 uppercase mt-0.5">Saídas / Utilizações</p>
            <div class="flex items-baseline gap-1 mt-1">
              <span class="text-2xl font-black text-blue-800">{{ reportTotals.qtdOperacoesSaida.toLocaleString('pt-BR') }}</span>
              <span class="text-xs font-bold text-blue-600 uppercase">operações</span>
            </div>
          </div>
          <div class="mt-2 border-t border-blue-100 pt-1.5">
            <span class="text-[10px] font-bold text-slate-500 uppercase">Volume Total:</span>
            <span v-if="filters.sector === 'TODOS'" class="block text-[11px] font-black text-blue-700 leading-tight">
              <template v-for="([unit, values], index) in Object.entries(reportTotals.volumePorUnidade)" :key="unit">
                <span v-if="index > 0" class="font-normal text-slate-400"> | </span>{{ formatVolume(values.saida) }} {{ unit }}
              </template>
            </span>
            <span v-else class="block text-xs font-black text-blue-700 leading-tight">
              <template v-if="reportTotals.volumeTotalSaida !== null">{{ formatVolume(reportTotals.volumeTotalSaida) }} <span class="text-[10px] font-bold text-blue-600 uppercase">{{ currentUnitSuffix }}</span></template>
              <span v-else>múltiplas unidades</span>
            </span>
          </div>
        </div>

        <!-- 4. Pares Casados (Multi-Setor) -->
        <div class="bg-white p-4 rounded-2xl border border-fuchsia-200 shadow-xs flex flex-col justify-between bg-gradient-to-br from-white to-fuchsia-50/30">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-fuchsia-600 uppercase tracking-wider">Montagem & Solas</span>
              <span class="p-1 bg-fuchsia-100 rounded-lg text-fuchsia-600"><Footprints class="w-3.5 h-3.5" /></span>
            </div>
            <p class="text-[11px] font-bold text-fuchsia-700 uppercase mt-0.5">Pares Formados</p>
            <div class="flex items-baseline gap-1 mt-1">
              <span class="text-2xl font-black text-fuchsia-800">{{ reportTotals.totalCasamentosPares.toLocaleString('pt-BR') }}</span>
              <span class="text-xs font-bold text-fuchsia-600 uppercase">pares</span>
            </div>
          </div>
          <p class="text-[10px] font-bold text-fuchsia-600 mt-2 border-t border-fuchsia-100 pt-1.5 truncate">
            {{ (reportTotals.totalCasamentosPares * 2).toLocaleString('pt-BR') }} pés baixados
          </p>
        </div>

        <!-- 5. Refugos / Perdas -->
        <div class="bg-white p-4 rounded-2xl border border-red-200 shadow-xs flex flex-col justify-between bg-gradient-to-br from-white to-red-50/30">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-red-600 uppercase tracking-wider">Descartes</span>
              <span class="p-1 bg-red-100 rounded-lg text-red-600"><Trash2 class="w-3.5 h-3.5" /></span>
            </div>
            <p class="text-[11px] font-bold text-red-700 uppercase mt-0.5">Refugos / Perdas</p>
            <div class="flex items-baseline gap-1 mt-1">
              <span class="text-2xl font-black text-red-800">{{ reportTotals.qtdOperacoesRefugo ? reportTotals.qtdOperacoesRefugo.toLocaleString('pt-BR') : reportTotals.totalRefugos.toLocaleString('pt-BR') }}</span>
              <span class="text-xs font-bold text-red-600 uppercase">{{ reportTotals.qtdOperacoesRefugo ? 'lançamentos' : currentUnitSuffix }}</span>
            </div>
          </div>
          <div class="mt-2 border-t border-red-100 pt-1.5">
            <span class="text-[10px] font-bold text-slate-500 uppercase">Volume Físico:</span>
            <span class="block text-xs font-black text-red-700 leading-tight">
              {{ formatVolume(reportTotals.totalRefugos) }} <span class="text-[10px] font-bold text-red-600 uppercase">{{ currentUnitSuffix }}</span>
            </span>
          </div>
        </div>

      </div>

      <!-- KPI METRIC CARDS (RELATÓRIO DE REQUISIÇÕES) -->
      <div v-if="reportType === 'requisitions' && reportData.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p class="text-[11px] font-bold text-slate-500 uppercase">Total Requisições</p>
          <p class="text-2xl font-black text-slate-900 mt-1">{{ reportTotals.totalRegistros.toLocaleString('pt-BR') }}</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs">
          <p class="text-[11px] font-bold text-emerald-600 uppercase">Atendidas</p>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-black text-emerald-700">{{ reportTotals.totalAtendidas.toLocaleString('pt-BR') }}</span>
            <span class="text-xs font-bold text-emerald-600">({{ reportTotals.taxaAtendimento }}%)</span>
          </div>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs">
          <p class="text-[11px] font-bold text-amber-600 uppercase">Pendentes</p>
          <p class="text-2xl font-black text-amber-700 mt-1">{{ reportTotals.totalPendentes.toLocaleString('pt-BR') }}</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <p class="text-[11px] font-bold text-gray-500 uppercase">Canceladas</p>
          <p class="text-2xl font-black text-gray-700 mt-1">{{ reportTotals.totalCanceladas.toLocaleString('pt-BR') }}</p>
        </div>
      </div>

      <!-- TABELA DE RESULTADOS (MOVIMENTAÇÕES) -->
      <div v-if="reportType === 'movements'" class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs report-table report-table-movements">
            <thead class="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">Data / Hora</th>
                <th class="py-3 px-2 text-center">Setor</th>
                <th class="py-3 px-2 text-center">Operação</th>
                <th class="py-3 px-3">Código / SKU</th>
                <th class="py-3 px-3">Descrição do Material</th>
                <th class="py-3 px-2 text-right">Qtd</th>
                <th class="py-3 px-2 text-center">Localização</th>
                <th class="py-3 px-3">Motivo / Origem</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="item in reportData"
                :key="item.id"
                class="hover:bg-slate-50/80 transition-colors"
              >
                <td class="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono">
                  {{ new Date(item.data).toLocaleDateString('pt-BR') }} {{ new Date(item.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
                </td>
                <td class="py-2.5 px-2 text-center">
                  <span class="report-print-badge px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="getSectorBadge(item.sector || item.setor)">
                    {{ getSectorShort(item.sector || item.setor) }}
                  </span>
                </td>
                <td class="py-2.5 px-2 text-center">
                  <span class="report-print-badge px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="getTypeBadge(item.tipo)">
                    {{ getTypeShort(item.tipo) }}
                  </span>
                </td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-800">{{ item.codigo || '-' }}</td>
                <td class="report-cell-description py-2.5 px-3 text-slate-700 font-medium max-w-xs truncate">{{ item.descricao || '-' }}</td>
                <td class="py-2.5 px-2 text-right font-bold text-slate-900 whitespace-nowrap">
                  {{ Number(item.quantidade).toLocaleString('pt-BR') }} <span class="text-[10px] font-normal text-slate-500">{{ item.unidade }}</span>
                </td>
                <td class="py-2.5 px-2 text-center text-slate-600 font-mono text-[11px]">{{ item.prateleira || '-' }}</td>
                <td class="report-cell-origin py-2.5 px-3 text-slate-600 text-[11px] truncate max-w-xs">{{ item.motivo || item.origem || '-' }}</td>
              </tr>
              <tr v-if="reportData.length === 0">
                <td colspan="8" class="py-12 text-center text-slate-400 font-medium">
                  {{ loading ? 'Carregando dados...' : 'Nenhum registro encontrado para os filtros selecionados.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginação -->
        <div v-if="pagination.total > 0" class="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600 print:hidden">
          <span>Total: <strong>{{ pagination.total }}</strong> registros</span>
          <div v-if="totalPages > 1" class="flex items-center gap-2">
            <button type="button" aria-label="Página anterior" @click="setCurrentPage(currentPage - 1)" :disabled="loading || currentPage === 1" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40">&lt;</button>
            <span class="font-bold">{{ currentPage }} de {{ totalPages }}</span>
            <button type="button" aria-label="Próxima página" @click="setCurrentPage(currentPage + 1)" :disabled="loading || currentPage === totalPages" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40">&gt;</button>
          </div>
        </div>
      </div>

      <!-- TABELA DE RESULTADOS (REQUISIÇÕES FABRIS) -->
      <div v-else class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs report-table report-table-requisitions">
            <thead class="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th class="py-3 px-3">Código</th>
                <th class="py-3 px-3">Data / Hora</th>
                <th class="py-3 px-2 text-center">Setor</th>
                <th class="py-3 px-3">SKU / Modelo</th>
                <th class="py-3 px-3">Material / Peça</th>
                <th class="py-3 px-2 text-center">Grade / Lado</th>
                <th class="py-3 px-2 text-right">Qtd Solicitada</th>
                <th class="py-3 px-2 text-right">Qtd Atendida</th>
                <th class="py-3 px-2 text-center">Status</th>
                <th class="py-3 px-3">Solicitante</th>
                <th class="py-3 px-3">Motivo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="req in reportData"
                :key="req.id"
                class="hover:bg-slate-50/80 transition-colors"
              >
                <td class="py-2.5 px-3 font-mono font-black text-indigo-700">{{ req.code }}</td>
                <td class="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono">
                  {{ new Date(req.data).toLocaleDateString('pt-BR') }} {{ new Date(req.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
                </td>
                <td class="py-2.5 px-2 text-center">
                  <span class="report-print-badge px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="getSectorBadge(req.setorSolicitante)">
                    {{ getSectorShort(req.setorSolicitante) }}
                  </span>
                </td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-800">{{ req.sku }}</td>
                <td class="py-2.5 px-3 text-slate-700 font-medium max-w-xs truncate">{{ req.descricao }}</td>
                <td class="py-2.5 px-2 text-center text-slate-700 font-mono">
                  {{ req.gradeTamanho }} <span v-if="req.ladoPe && req.ladoPe !== '-'">({{ req.ladoPe }})</span>
                </td>
                <td class="py-2.5 px-2 text-right font-black text-slate-900">
                  {{ Number(req.quantidadeSolicitada).toLocaleString('pt-BR') }}
                </td>
                <td class="py-2.5 px-2 text-right font-black" :class="req.quantidadeAtendida > 0 ? 'text-emerald-700' : 'text-slate-400'">
                  {{ Number(req.quantidadeAtendida).toLocaleString('pt-BR') }}
                </td>
                <td class="py-2.5 px-2 text-center">
                  <span class="report-print-badge px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="getStatusBadge(req.status)">
                    {{ req.status?.replace('_', ' ') }}
                  </span>
                </td>
                <td class="py-2.5 px-3 text-slate-700 whitespace-nowrap">{{ req.solicitante }}</td>
                <td class="report-cell-origin py-2.5 px-3 text-slate-600 text-[11px] truncate max-w-xs">{{ req.motivo }}</td>
              </tr>
              <tr v-if="reportData.length === 0">
                <td colspan="11" class="py-12 text-center text-slate-400 font-medium">
                  {{ loading ? 'Carregando requisições...' : 'Nenhuma requisição encontrada para os filtros selecionados.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginação -->
        <div v-if="pagination.total > 0" class="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600 print:hidden">
          <span>Total: <strong>{{ pagination.total }}</strong> requisições</span>
          <div v-if="totalPages > 1" class="flex items-center gap-2">
            <button type="button" aria-label="Página anterior" @click="setCurrentPage(currentPage - 1)" :disabled="loading || currentPage === 1" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40">&lt;</button>
            <span class="font-bold">{{ currentPage }} de {{ totalPages }}</span>
            <button type="button" aria-label="Próxima página" @click="setCurrentPage(currentPage + 1)" :disabled="loading || currentPage === totalPages" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40">&gt;</button>
          </div>
        </div>
      </div>

    </div>
  </Layout>
</template>

<style>
@page {
  size: A4 portrait;
  margin: 0.7cm;
}

@media print {
  html, body, #app, .app-container, main, #printable-report, .report-container, .flex, .flex-1 {
    background: white !important;
    color: black !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
    box-shadow: none !important;
  }

  aside, header, footer, nav {
    display: none !important;
  }

  .print\:hidden {
    display: none !important;
  }

  .print\:block {
    display: block !important;
  }

  .print\:flex {
    display: flex !important;
  }

  * {
    overflow: visible !important;
    box-shadow: none !important;
    float: none !important;
  }

  table {
    width: 100% !important;
    border-collapse: collapse !important;
  }

  .report-table {
    font-size: 11.5px !important;
    line-height: 1.2 !important;
  }

  .report-table thead th {
    padding: 4px 3px !important;
    font-size: 10.5px !important;
    line-height: 1.15 !important;
  }

  .report-table tbody td {
    padding: 4px 3px !important;
    font-size: 11.5px !important;
    vertical-align: top !important;
  }

  .report-table-movements {
    table-layout: fixed !important;
  }

  .report-table-movements th:nth-child(1),
  .report-table-movements td:nth-child(1) { width: 12%; }
  .report-table-movements th:nth-child(2),
  .report-table-movements td:nth-child(2) { width: 8%; }
  .report-table-movements th:nth-child(3),
  .report-table-movements td:nth-child(3) { width: 8%; }
  .report-table-movements th:nth-child(4),
  .report-table-movements td:nth-child(4) { width: 13%; }
  .report-table-movements th:nth-child(5),
  .report-table-movements td:nth-child(5) { width: 21%; }
  .report-table-movements th:nth-child(6),
  .report-table-movements td:nth-child(6) { width: 8%; }
  .report-table-movements th:nth-child(7),
  .report-table-movements td:nth-child(7) { width: 12%; }
  .report-table-movements th:nth-child(8),
  .report-table-movements td:nth-child(8) { width: 18%; }

  .report-print-badge {
    display: inline !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: #000 !important;
    font-size: inherit !important;
    font-weight: 600 !important;
    white-space: normal !important;
  }

  .report-cell-description,
  .report-cell-origin {
    max-width: none !important;
    overflow: visible !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  thead {
    display: table-header-group !important;
  }

  tfoot {
    display: table-footer-group !important;
  }

  tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
</style>
