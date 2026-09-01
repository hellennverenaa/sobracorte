<script setup>
import { ref, computed, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { useAuthStore } from '@/stores/auth'
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
  Ban
} from 'lucide-vue-next'
import { exportToCSV } from '@/utils/export'
import { api } from '@/services/httpClient'

const authStore = useAuthStore()

// --- TIPO DE RELATÓRIO ATIVO ---
const reportType = ref('movements') // 'movements' | 'requisitions'

// --- ESTADOS REATIVOS ---
const loading = ref(false)
const reportData = ref([])
const reportTotals = ref({
  totalRegistros: 0,
  volumeEntradas: 0,
  volumeSaidas: 0,
  totalRefugos: 0,
  totalCasamentosPares: 0,
  totalTransferencias: 0,
  totalAtendidas: 0,
  totalPendentes: 0,
  totalCanceladas: 0,
  taxaAtendimento: 0,
})
const hasSearched = ref(false)

// --- PERMISSÕES RBAC ---
const canExport = computed(() => {
  const role = authStore.user?.role
  return role === 'admin' || role === 'admin_setor' || role === 'lider'
})

// --- NOTIFICAÇÕES TOAST ---
const notification = ref({ show: false, type: 'success', message: '' })
function showNotification(type, message) {
  notification.value = { show: true, type, message }
  setTimeout(() => { notification.value.show = false }, 3500)
}

// --- FILTROS DE CONSULTA ---
const filters = ref({
  sector: 'TODOS',
  tipoMovimento: 'TODOS',
  status: 'TODOS',
  periodo: 'last_30_days', // 'last_30_days' como padrão
  dataInicio: '',
  dataFim: '',
  origin: 'TODOS',
  search: ''
})

// --- OPÇÕES DOS SELECTS ---
const sectors = [
  { value: 'TODOS', label: 'Todos os Setores (Geral)' },
  { value: 'CORTE', label: 'Corte (Matéria-Prima)' },
  { value: 'APOIO', label: 'Apoio (Moldes/Peças)' },
  { value: 'PRE_FABRICADO', label: 'Pré-Fabricado (Solas)' },
  { value: 'EXPEDICAO', label: 'Cabedais' },
  { value: 'MONTAGEM', label: 'Montagem (Pés Órfãos)' },
  { value: 'CONSUMO', label: 'Consumo (Insumos)' },
]

const operationTypes = [
  { value: 'TODOS', label: 'Todas as Operações' },
  { value: 'ENTRADA', label: 'Entradas de Sobras' },
  { value: 'SAIDA', label: 'Saídas / Reaproveitamento (Inclui Casamentos)' },
  { value: 'TRANSFERENCIA', label: 'Transferências entre Prateleiras' },
  { value: 'CASAMENTO_PAR', label: 'Casamento de Pares (Multi-Setor)' },
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
  generateReport()
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
async function generateReport() {
  loading.value = true
  hasSearched.value = true
  reportData.value = []
  currentPage.value = 1

  try {
    const dates = getDatesFromPeriod(filters.value.periodo)
    if (filters.value.periodo === 'custom' && !dates) {
      showNotification('error', "Selecione as datas de início e fim para o período personalizado.")
      loading.value = false
      return
    }

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

      const res = await api.get(`/reports/requisitions?${params.toString()}`)
      reportData.value = res.data.items || []
      reportTotals.value = {
        ...reportTotals.value,
        totalRegistros: res.data.totals?.totalRegistros || 0,
        totalAtendidas: res.data.totals?.totalAtendidas || 0,
        totalPendentes: res.data.totals?.totalPendentes || 0,
        totalCanceladas: res.data.totals?.totalCanceladas || 0,
        taxaAtendimento: res.data.totals?.taxaAtendimento || 0,
      }
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

      const res = await api.get(`/reports/movements?${params.toString()}`)
      reportData.value = res.data.items || []
      reportTotals.value = {
        ...reportTotals.value,
        totalRegistros: res.data.totalRegistros || 0,
        volumeEntradas: res.data.volumeEntradas || 0,
        volumeSaidas: res.data.volumeSaidas || 0,
        totalRefugos: res.data.totalRefugos || 0,
        totalCasamentosPares: res.data.totalCasamentosPares || 0,
        totalTransferencias: res.data.totals?.totalTransferencias || 0,
      }
    }

  } catch (error) {
    console.error("Erro ao gerar relatório:", error)
    showNotification('error', "Erro ao conectar com a base de dados de relatórios.")
  } finally {
    loading.value = false
  }
}

function switchReportType(type) {
  reportType.value = type
  reportData.value = []
  generateReport()
}

function resetFilters() {
  filters.value = {
    sector: 'TODOS',
    tipoMovimento: 'TODOS',
    status: 'TODOS',
    periodo: 'mes_atual',
    dataInicio: '',
    dataFim: '',
    origin: 'TODOS',
    search: ''
  }
  generateReport()
}

// --- EXPORTAÇÃO CSV ---
function downloadExcel() {
  if (reportData.value.length === 0) {
    showNotification('error', "Não existem dados para exportar.")
    return
  }

  if (reportType.value === 'requisitions') {
    const rows = reportData.value.map(req => ({
      CODIGO: req.code,
      DATA: new Date(req.data).toLocaleDateString('pt-BR'),
      HORA: new Date(req.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      SETOR_SOLICITANTE: req.setorSolicitante,
      SKU_MATERIAL: req.sku || '-',
      MODELO: req.nomeModelo || '-',
      DESCRICAO: req.descricao,
      GRADE: req.gradeTamanho || '-',
      LADO: req.ladoPe || '-',
      QTD_SOLICITADA: Number(req.quantidadeSolicitada || 0),
      QTD_ATENDIDA: Number(req.quantidadeAtendida || 0),
      MOTIVO: req.motivo || '-',
      STATUS: req.status,
      SOLICITANTE: req.solicitante || '-',
      MATRICULA: req.matriculaSolicitante || '-'
    }))
    const secName = filters.value.sector !== 'TODOS' ? `_${filters.value.sector}` : ''
    exportToCSV(`SobrasDASS_Requisicoes${secName}_${filters.value.periodo}`, rows)
    return
  }

  const rows = reportData.value.map(mov => ({
    DATA: new Date(mov.data).toLocaleDateString('pt-BR'),
    HORA: new Date(mov.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    SETOR: mov.sector || mov.setor,
    TIPO_OPERACAO: mov.tipo,
    CODIGO_ITEM: mov.codigo || '-',
    DESCRICAO_ITEM: mov.descricao || mov.material?.descricao || '-',
    TIPO_MATERIAL: mov.tipoMaterial || mov.material?.tipo || '-',
    GRADE: mov.gradeTamanho || '-',
    LADO: mov.ladoPe || '-',
    QUANTIDADE: Number(mov.quantidade || 0),
    UNIDADE: mov.unidade || mov.material?.unidade || 'UN',
    LOCALIZACAO: mov.prateleira || '-',
    ORIGEM_SOBRA: mov.origem || '-',
    MOTIVO_OPERACAO: mov.motivo || '-',
    RESPONSAVEL: mov.responsavel || mov.operador || 'Operador DASS',
    MATRICULA: mov.matricula || '-'
  }))

  const secName = filters.value.sector !== 'TODOS' ? `_${filters.value.sector}` : ''
  exportToCSV(`SobrasDASS_Relatorio${secName}_${filters.value.periodo}`, rows)
}

function printPDF() {
  window.print()
}

// --- PAGINAÇÃO EM TELA ---
const currentPage = ref(1)
const pageSize = ref(25)

const totalPages = computed(() => {
  if (reportData.value.length === 0) return 1
  return Math.ceil(reportData.value.length / pageSize.value)
})

function isRowVisible(index) {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return index >= start && index < end
}

// --- FORMATADORES DE RÓTULOS ---
function getSectorLabel(val) {
  const found = sectors.find(s => s.value === val)
  return found ? found.label : val
}

function getSectorShort(sec) {
  const map = {
    CORTE: 'CORTE',
    APOIO: 'APOIO',
    PRE_FABRICADO: 'PRÉ-FAB.',
    EXPEDICAO: 'EXPED.',
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
    <!-- Toast Notification -->
    <transition name="fade-down">
      <div v-if="notification.show"
        class="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl font-bold text-sm flex items-center gap-2 transition-all print:hidden"
        :class="notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'">
        <CheckCircle v-if="notification.type === 'success'" class="w-4 h-4" />
        <XCircle v-else class="w-4 h-4" />
        {{ notification.message }}
      </div>
    </transition>

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
            @click="printPDF"
            class="px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl shadow hover:bg-slate-900 transition-all flex items-center gap-1.5"
          >
            <Printer class="w-4 h-4" /> Imprimir / PDF
          </button>
          <button
            v-if="canExport"
            @click="downloadExcel"
            class="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow hover:bg-emerald-700 transition-all flex items-center gap-1.5"
          >
            <FileSpreadsheet class="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      <!-- SELETOR DE TIPO DE RELATÓRIO (TABS) -->
      <div class="flex gap-2 bg-slate-200/70 p-1.5 rounded-2xl w-fit print:hidden">
        <button
          @click="switchReportType('movements')"
          class="px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2"
          :class="reportType === 'movements' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
        >
          <FileBarChart class="w-4 h-4" /> Movimentações & Estoque
        </button>
        <button
          @click="switchReportType('requisitions')"
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
                type="text"
                placeholder="Ex: SKU, Código, Modelo..."
                class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                @keyup.enter="generateReport"
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
            @click="resetFilters"
            class="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <RotateCcw class="w-3.5 h-3.5" /> Limpar Filtros
          </button>
          <button
            @click="generateReport"
            :disabled="loading"
            class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Search class="w-3.5 h-3.5" /> {{ loading ? 'Consultando...' : 'Aplicar Filtros' }}
          </button>
        </div>
      </div>

      <!-- KPI METRIC CARDS (RELATÓRIO DE MOVIMENTAÇÕES) -->
      <div v-if="reportType === 'movements' && reportData.length > 0" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 print:hidden">
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p class="text-[11px] font-bold text-slate-500 uppercase">Total Registros</p>
          <p class="text-2xl font-black text-slate-900 mt-1">{{ reportTotals.totalRegistros.toLocaleString('pt-BR') }}</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs">
          <p class="text-[11px] font-bold text-emerald-600 uppercase">Volume Entradas</p>
          <p class="text-2xl font-black text-emerald-700 mt-1">{{ reportTotals.volumeEntradas.toLocaleString('pt-BR') }}</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs">
          <p class="text-[11px] font-bold text-blue-600 uppercase">Volume Saídas</p>
          <p class="text-2xl font-black text-blue-700 mt-1">{{ reportTotals.volumeSaidas.toLocaleString('pt-BR') }}</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-fuchsia-200 shadow-xs">
          <p class="text-[11px] font-bold text-fuchsia-600 uppercase">Pares Casados</p>
          <p class="text-2xl font-black text-fuchsia-700 mt-1">{{ reportTotals.totalCasamentosPares.toLocaleString('pt-BR') }}</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-red-200 shadow-xs">
          <p class="text-[11px] font-bold text-red-600 uppercase">Refugos / Perdas</p>
          <p class="text-2xl font-black text-red-700 mt-1">{{ reportTotals.totalRefugos.toLocaleString('pt-BR') }}</p>
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
          <table class="w-full text-left border-collapse text-xs">
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
                <th class="py-3 px-3">Responsável</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="(item, idx) in reportData"
                :key="item.id"
                v-show="isRowVisible(idx)"
                class="hover:bg-slate-50/80 transition-colors"
              >
                <td class="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono">
                  {{ new Date(item.data).toLocaleDateString('pt-BR') }} {{ new Date(item.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
                </td>
                <td class="py-2.5 px-2 text-center">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="getSectorBadge(item.sector || item.setor)">
                    {{ getSectorShort(item.sector || item.setor) }}
                  </span>
                </td>
                <td class="py-2.5 px-2 text-center">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="getTypeBadge(item.tipo)">
                    {{ getTypeShort(item.tipo) }}
                  </span>
                </td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-800">{{ item.codigo || '-' }}</td>
                <td class="py-2.5 px-3 text-slate-700 font-medium max-w-xs truncate">{{ item.descricao || '-' }}</td>
                <td class="py-2.5 px-2 text-right font-bold text-slate-900 whitespace-nowrap">
                  {{ Number(item.quantidade).toLocaleString('pt-BR') }} <span class="text-[10px] font-normal text-slate-500">{{ item.unidade }}</span>
                </td>
                <td class="py-2.5 px-2 text-center text-slate-600 font-mono text-[11px]">{{ item.prateleira || '-' }}</td>
                <td class="py-2.5 px-3 text-slate-600 text-[11px] truncate max-w-xs">{{ item.motivo || item.origem || '-' }}</td>
                <td class="py-2.5 px-3 text-slate-700 whitespace-nowrap">{{ item.responsavel || item.operador }}</td>
              </tr>
              <tr v-if="reportData.length === 0">
                <td colspan="9" class="py-12 text-center text-slate-400 font-medium">
                  {{ loading ? 'Carregando dados...' : 'Nenhum registro encontrado para os filtros selecionados.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginação -->
        <div v-if="reportData.length > 0" class="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600 print:hidden">
          <span>Total: <strong>{{ reportData.length }}</strong> registros</span>
          <div v-if="totalPages > 1" class="flex items-center gap-2">
            <button @click="currentPage--" :disabled="currentPage === 1" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40">&lt;</button>
            <span class="font-bold">{{ currentPage }} de {{ totalPages }}</span>
            <button @click="currentPage++" :disabled="currentPage === totalPages" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40">&gt;</button>
          </div>
        </div>
      </div>

      <!-- TABELA DE RESULTADOS (REQUISIÇÕES FABRIS) -->
      <div v-else class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
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
                v-for="(req, idx) in reportData"
                :key="req.id"
                v-show="isRowVisible(idx)"
                class="hover:bg-slate-50/80 transition-colors"
              >
                <td class="py-2.5 px-3 font-mono font-black text-indigo-700">{{ req.code }}</td>
                <td class="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono">
                  {{ new Date(req.data).toLocaleDateString('pt-BR') }} {{ new Date(req.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
                </td>
                <td class="py-2.5 px-2 text-center">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="getSectorBadge(req.setorSolicitante)">
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
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="getStatusBadge(req.status)">
                    {{ req.status?.replace('_', ' ') }}
                  </span>
                </td>
                <td class="py-2.5 px-3 text-slate-700 whitespace-nowrap">{{ req.solicitante }}</td>
                <td class="py-2.5 px-3 text-slate-600 text-[11px] truncate max-w-xs">{{ req.motivo }}</td>
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
        <div v-if="reportData.length > 0" class="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600 print:hidden">
          <span>Total: <strong>{{ reportData.length }}</strong> requisições</span>
          <div v-if="totalPages > 1" class="flex items-center gap-2">
            <button @click="currentPage--" :disabled="currentPage === 1" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40">&lt;</button>
            <span class="font-bold">{{ currentPage }} de {{ totalPages }}</span>
            <button @click="currentPage++" :disabled="currentPage === totalPages" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40">&gt;</button>
          </div>
        </div>
      </div>

    </div>
  </Layout>
</template>

<style>
@page {
  size: A4 portrait;
  margin: 0.8cm;
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
