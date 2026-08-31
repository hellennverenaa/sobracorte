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
  RotateCcw
} from 'lucide-vue-next'
import { exportToCSV } from '@/utils/export'
import { api } from '@/services/httpClient'

const authStore = useAuthStore()

// --- ESTADOS REATIVOS ---
const loading = ref(false)
const reportData = ref([])
const reportTotals = ref({
  totalRegistros: 0,
  volumeEntradas: 0,
  volumeSaidas: 0,
  totalRefugos: 0,
  totalCasamentosPares: 0,
  totalTransferencias: 0
})
const hasSearched = ref(false)

// --- PERMISSÕES RBAC ---
const canExport = computed(() => {
  const role = authStore.user?.role
  return role === 'admin' || role === 'lider'
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
  periodo: 'mes_atual', // hoje, semana, mes_atual, ano_atual, custom
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
]

const operationTypes = [
  { value: 'TODOS', label: 'Todas as Operações' },
  { value: 'ENTRADA', label: 'Entradas de Sobras' },
  { value: 'SAIDA', label: 'Saídas / Reaproveitamento (Inclui Casamentos)' },
  { value: 'TRANSFERENCIA', label: 'Transferências entre Prateleiras' },
  { value: 'CASAMENTO_PAR', label: 'Casamento de Pares (Multi-Setor)' },
  { value: 'REFUGO', label: 'Refugos / Descartes' },
]

const periods = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Esta Semana' },
  { value: 'mes_atual', label: 'Este Mês' },
  { value: 'ano_atual', label: 'Este Ano' },
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
  // Carregar relatório inicial do mês
  generateReport()
})

// --- CÁLCULO DE DATAS ISO PARA BACKEND ---
function getDatesFromPeriod(period) {
  const now = new Date()
  let start = new Date()
  let end = new Date()

  if (period === 'hoje') {
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
  } else if (period === 'custom') {
    if (!filters.value.dataInicio || !filters.value.dataFim) return null
    start = new Date(filters.value.dataInicio + 'T00:00:00')
    end = new Date(filters.value.dataFim + 'T23:59:59')
  }

  return {
    start: start.toISOString(),
    end: end.toISOString()
  }
}

// --- CONSULTA ANALÍTICA AO BACKEND ---
async function generateReport() {
  loading.value = true
  hasSearched.value = true
  reportData.value = []

  try {
    const dates = getDatesFromPeriod(filters.value.periodo)
    if (!dates) {
      showNotification('error', "Selecione as datas de início e fim para o período personalizado.")
      loading.value = false
      return
    }

    const params = new URLSearchParams({
      dataInicio: dates.start,
      dataFim: dates.end,
      sector: filters.value.sector,
      tipoMovimento: filters.value.tipoMovimento,
    })

    if (filters.value.origin && filters.value.origin !== 'TODOS') {
      params.append('origin', filters.value.origin)
    }
    if (filters.value.search && filters.value.search.trim()) {
      params.append('search', filters.value.search.trim())
    }

    const res = await api.get(`/reports/movements?${params.toString()}`)
    const payload = res.data

    if (payload && Array.isArray(payload.items)) {
      reportData.value = payload.items
      reportTotals.value = payload.totals || {
        totalRegistros: payload.items.length,
        volumeEntradas: payload.volumeEntradas || 0,
        volumeSaidas: payload.volumeSaidas || 0,
        totalRefugos: payload.totalRefugos || 0,
        totalCasamentosPares: payload.totalCasamentosPares || 0,
        totalTransferencias: 0
      }
    } else if (Array.isArray(payload)) {
      reportData.value = payload
      reportTotals.value = {
        totalRegistros: payload.length,
        volumeEntradas: payload.filter(m => m.tipo === 'ENTRADA').reduce((a, c) => a + Number(c.quantidade), 0),
        volumeSaidas: payload.filter(m => m.tipo === 'SAIDA').reduce((a, c) => a + Number(c.quantidade), 0),
        totalRefugos: payload.filter(m => m.tipo === 'REFUGO').reduce((a, c) => a + Number(c.quantidade), 0),
        totalCasamentosPares: payload.filter(m => m.tipo === 'CASAMENTO_PAR').reduce((a, c) => a + Number(c.quantidade), 0),
        totalTransferencias: payload.filter(m => m.tipo === 'TRANSFERENCIA').reduce((a, c) => a + Number(c.quantidade), 0)
      }
    }
  } catch (err) {
    console.error("Erro ao gerar relatório analítico:", err)
    showNotification('error', "Erro ao gerar relatório. Verifique os filtros ou a conexão com o servidor.")
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.value = {
    sector: 'TODOS',
    tipoMovimento: 'TODOS',
    periodo: 'mes_atual',
    dataInicio: '',
    dataFim: '',
    origin: 'TODOS',
    search: ''
  }
  generateReport()
}

// --- EXPORTAÇÃO CSV / EXCEL FORMATADO ---
function downloadExcel() {
  if (reportData.value.length === 0 || !canExport.value) return

  const rows = reportData.value.map(mov => ({
    DATA: new Date(mov.data_hora).toLocaleDateString('pt-BR'),
    HORA: new Date(mov.data_hora).toLocaleTimeString('pt-BR'),
    SETOR: mov.setor || mov.sector || 'CORTE',
    TIPO_OPERACAO: mov.tipo,
    CODIGO: mov.codigo || '-',
    MODELO: mov.nomeModelo || '-',
    DESCRICAO: mov.descricao || mov.material?.descricao || '-',
    GRADE_TAMANHO: mov.gradeTamanho || '-',
    LADO_PE: mov.ladoPe || '-',
    QUANTIDADE: Number(mov.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
    UNIDADE: mov.unidade || mov.material?.unidade || 'un',
    PRATELEIRA: mov.prateleira || '-',
    ORIGEM_MOTIVO: mov.origem || mov.motivo || '-',
    OPERADOR: mov.operador || mov.responsavel || '-',
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

// --- FORMATADORES DE RÓTULOS (USO EM TELA E IMPRESSÃO) ---
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
    MONTAGEM: 'MONTAGEM'
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

// --- CORES DE SETOR & OPERAÇÃO ---
function getSectorBadge(sector) {
  const map = {
    CORTE: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    APOIO: 'bg-sky-100 text-sky-800 border-sky-300',
    PRE_FABRICADO: 'bg-amber-100 text-amber-800 border-amber-300',
    EXPEDICAO: 'bg-purple-100 text-purple-800 border-purple-300',
    MONTAGEM: 'bg-pink-100 text-pink-800 border-pink-300',
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

      <!-- CABEÇALHO CORPORATIVO FORMAL DASS (EXCLUSIVO PARA IMPRESSÃO / PDF) -->
      <div class="hidden print:block mb-2 pb-1.5 border-b-2 border-slate-900">
        <div class="flex justify-between items-start">
          <div>
            <div class="text-[10px] font-black tracking-widest text-slate-800 uppercase">
              GRUPO DASS — UNIDADE SEST (SANTO ESTÊVÃO/BA)
            </div>
            <h1 class="text-sm font-black text-slate-900 uppercase tracking-tight mt-0.5">
              Relatório Gerencial de Gestão de Sobras e Movimentações
            </h1>
          </div>
          <div class="text-right text-[9px] text-slate-700 font-semibold leading-tight">
            <div><strong>Emissão:</strong> {{ new Date().toLocaleDateString('pt-BR') }} às {{ new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}</div>
            <div><strong>Emissor:</strong> {{ authStore.user?.nome }} <span v-if="authStore.user?.matriculaDass || authStore.user?.usuario">(Mat: {{ authStore.user?.matriculaDass || authStore.user?.usuario }})</span></div>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2 mt-1.5 pt-1.5 border-t border-slate-300 text-[9px] text-slate-800">
          <div><span class="font-bold text-slate-900">Setor:</span> {{ getSectorLabel(filters.sector) }}</div>
          <div><span class="font-bold text-slate-900">Operação:</span> {{ getOperationLabel(filters.tipoMovimento) }}</div>
          <div><span class="font-bold text-slate-900">Período:</span> {{ getPeriodLabel() }}</div>
          <div><span class="font-bold text-slate-900">Origem:</span> {{ filters.origin === 'TODOS' ? 'Todas as Origens' : filters.origin }}</div>
        </div>
      </div>

      <!-- SUMÁRIO EXECUTIVO CONDENSADO EM LINHA ÚNICA (EXCLUSIVO PARA IMPRESSÃO) -->
      <div class="hidden print:flex justify-between items-center bg-slate-100 border border-slate-300 p-2 mb-2 text-[9px] font-bold text-slate-900">
        <div><strong>Movimentações:</strong> {{ reportTotals.totalRegistros.toLocaleString('pt-BR') }} registros</div>
        <div class="text-slate-300">|</div>
        <div><strong>Entradas:</strong> {{ reportTotals.volumeEntradas.toLocaleString('pt-BR') }}</div>
        <div class="text-slate-300">|</div>
        <div><strong>Saídas:</strong> {{ reportTotals.volumeSaidas.toLocaleString('pt-BR') }}</div>
        <div class="text-slate-300">|</div>
        <div><strong>Pares Casados:</strong> {{ reportTotals.totalCasamentosPares.toLocaleString('pt-BR') }}</div>
        <div class="text-slate-300">|</div>
        <div><strong>Refugos / Perdas:</strong> {{ reportTotals.totalRefugos.toLocaleString('pt-BR') }}</div>
      </div>

      <!-- CABEÇALHO PRINCIPAL EM TELA -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 class="text-2xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
            <FileBarChart class="w-7 h-7 text-indigo-600" /> Central de Relatórios Analíticos
          </h1>
          <p class="text-slate-500 text-xs mt-0.5">
            Consulte, audite e exporte movimentações multi-setor com fechamento operacional.
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
            <FileSpreadsheet class="w-4 h-4" /> Exportar Excel (.csv)
          </button>
          <div
            v-else
            class="px-3 py-1.5 bg-slate-100 text-slate-400 text-[11px] font-bold rounded-xl border border-slate-200 flex items-center gap-1 cursor-not-allowed"
            title="Exportação restrita a administradores e líderes."
          >
            <FileSpreadsheet class="w-3.5 h-3.5" /> Exportação Restrita
          </div>
        </div>
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

          <!-- 2. Tipo de Movimentação -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Tipo de Operação
            </label>
            <div class="relative">
              <Filter class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                v-model="filters.tipoMovimento"
                class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option v-for="t in operationTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
          </div>

          <!-- 3. Período -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Período de Análise
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

          <!-- 4. Origem / Motivo da Sobra -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Origem da Sobra
            </label>
            <div class="relative">
              <MapPin class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                v-model="filters.origin"
                class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option v-for="o in originsList" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
          </div>

        </div>

        <!-- LINHA 2: Busca Textual e Ações -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1 border-t border-slate-100 items-center">
          <div class="sm:col-span-8 relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              v-model="filters.search"
              @keyup.enter="generateReport"
              type="text"
              placeholder="Buscar por código, descrição, SKU, prateleira ou operador..."
              class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div class="sm:col-span-4 flex items-center gap-2">
            <button
              @click="generateReport"
              :disabled="loading"
              class="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-xl font-black text-xs shadow hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
            >
              <Search v-if="!loading" class="w-3.5 h-3.5" />
              {{ loading ? 'Consultando...' : 'Filtrar Dados' }}
            </button>

            <button
              @click="resetFilters"
              class="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
              title="Limpar Filtros"
            >
              <RotateCcw class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Intervalo Personalizado (Aparece somente em 'custom') -->
        <div v-if="filters.periodo === 'custom'" class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
          <div>
            <label class="block text-[10px] font-black text-indigo-900 uppercase mb-1">Data Inicial (De):</label>
            <input v-model="filters.dataInicio" type="date" class="w-full p-2 bg-white rounded-lg border border-indigo-200 text-xs font-bold" />
          </div>
          <div>
            <label class="block text-[10px] font-black text-indigo-900 uppercase mb-1">Data Final (Até):</label>
            <input v-model="filters.dataFim" type="date" class="w-full p-2 bg-white rounded-lg border border-indigo-200 text-xs font-bold" />
          </div>
        </div>
      </div>

      <!-- CARDS DE FECHAMENTO E TOTAIS DO PERÍODO (OCULTOS NA IMPRESSÃO) -->
      <div v-if="hasSearched" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 print:hidden">
        <!-- 1. Total de Registros -->
        <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-indigo-600">
          <p class="text-[9px] font-black uppercase text-slate-400 tracking-wider">Movimentações</p>
          <div class="text-xl font-black text-slate-800 mt-0.5">{{ reportTotals.totalRegistros.toLocaleString('pt-BR') }}</div>
          <span class="text-[10px] text-indigo-600 font-bold">registros auditados</span>
        </div>

        <!-- 2. Volume de Entradas -->
        <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <div class="flex items-center gap-1">
            <ArrowDownRight class="w-3 h-3 text-emerald-600" />
            <p class="text-[9px] font-black uppercase text-slate-400 tracking-wider">Entradas</p>
          </div>
          <div class="text-xl font-black text-emerald-600 mt-0.5">{{ reportTotals.volumeEntradas.toLocaleString('pt-BR') }}</div>
          <span class="text-[10px] text-emerald-700 font-bold">sobras recebidas</span>
        </div>

        <!-- 3. Volume de Saídas -->
        <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <div class="flex items-center gap-1">
            <ArrowUpRight class="w-3 h-3 text-blue-600" />
            <p class="text-[9px] font-black uppercase text-slate-400 tracking-wider">Saídas</p>
          </div>
          <div class="text-xl font-black text-blue-600 mt-0.5">{{ reportTotals.volumeSaidas.toLocaleString('pt-BR') }}</div>
          <span class="text-[10px] text-blue-700 font-bold">reaproveitadas</span>
        </div>

        <!-- 4. Casamento de Pares -->
        <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-fuchsia-500">
          <div class="flex items-center gap-1">
            <Footprints class="w-3 h-3 text-fuchsia-600" />
            <p class="text-[9px] font-black uppercase text-slate-400 tracking-wider">Casamentos</p>
          </div>
          <div class="text-xl font-black text-fuchsia-600 mt-0.5">{{ reportTotals.totalCasamentosPares.toLocaleString('pt-BR') }}</div>
          <span class="text-[10px] text-fuchsia-700 font-bold">pares formados</span>
        </div>

        <!-- 5. Total de Refugos -->
        <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-red-500 col-span-2 sm:col-span-1">
          <div class="flex items-center gap-1">
            <Trash2 class="w-3 h-3 text-red-600" />
            <p class="text-[9px] font-black uppercase text-slate-400 tracking-wider">Refugos</p>
          </div>
          <div class="text-xl font-black text-red-600 mt-0.5">{{ reportTotals.totalRefugos.toLocaleString('pt-BR') }}</div>
          <span class="text-[10px] text-red-700 font-bold">descartes / perdas</span>
        </div>
      </div>

      <!-- TABELA DE DADOS ANALÍTICOS -->
      <div v-if="hasSearched" class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border print:border-slate-300 print:rounded-none">

        <div class="overflow-x-auto print:overflow-visible">
          <table class="w-full text-left border-collapse text-xs print:text-[8px] print:table-auto">
            <thead class="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-wider border-b border-slate-200 print:bg-slate-200 print:text-slate-900 print:border-b-2 print:border-slate-400 print:text-[8.5px]">
              <tr>
                <th class="py-3 px-3 print:py-1 print:px-1.5 whitespace-nowrap text-left">Data / Hora</th>
                <th class="py-3 px-2 print:py-1 print:px-1 text-center whitespace-nowrap">Setor</th>
                <th class="py-3 px-2 print:py-1 print:px-1 text-center whitespace-nowrap">Operação</th>
                <th class="py-3 px-3 print:py-1 print:px-1.5 text-left">Código / Descrição</th>
                <th class="py-3 px-2 print:py-1 print:px-1 text-center whitespace-nowrap">Grade / Pé</th>
                <th class="py-3 px-2 print:py-1 print:px-1 text-right whitespace-nowrap">Qtd / Un</th>
                <th class="py-3 px-2 print:py-1 print:px-1 text-left">Prateleira</th>
                <th class="py-3 px-2 print:py-1 print:px-1 text-left">Origem / Motivo</th>
                <th class="py-3 px-3 print:py-1 print:px-1 text-left">Operador</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 print:divide-slate-200">
              <tr
                v-for="(row, idx) in reportData"
                :key="row.id"
                class="hover:bg-slate-50/80 transition-colors print:even:bg-slate-50/80"
                :class="isRowVisible(idx) ? 'table-row' : 'hidden print:table-row'"
              >
                <!-- 1. Data e Hora -->
                <td class="py-2.5 px-3 text-slate-600 whitespace-nowrap print:py-1 print:px-1.5">
                  <div class="font-bold text-slate-800 print:text-black">{{ new Date(row.data).toLocaleDateString('pt-BR') }}</div>
                  <div class="text-[10px] text-slate-400 print:text-[7.5px] print:text-slate-600">{{ new Date(row.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}</div>
                </td>

                <!-- 2. Setor -->
                <td class="py-2.5 px-2 text-center whitespace-nowrap print:py-1 print:px-1">
                  <span class="text-[9px] font-black px-1.5 py-0.5 rounded-md border uppercase print:border-0 print:bg-transparent print:p-0 print:text-slate-900 print:text-[8px] print:whitespace-nowrap" :class="getSectorBadge(row.setor || row.sector)">
                    {{ getSectorShort(row.setor || row.sector) }}
                  </span>
                </td>

                <!-- 3. Operação -->
                <td class="py-2.5 px-2 text-center whitespace-nowrap print:py-1 print:px-1">
                  <span class="text-[9px] font-black px-1.5 py-0.5 rounded-md border uppercase print:border-0 print:bg-transparent print:p-0 print:text-slate-900 print:text-[8px] print:whitespace-nowrap" :class="getTypeBadge(row.tipo)">
                    {{ getTypeShort(row.tipo) }}
                  </span>
                </td>

                <!-- 4. Código e Descrição -->
                <td class="py-2.5 px-3 print:py-1 print:px-1.5">
                  <div class="font-bold text-slate-900 break-words print:text-[8px] leading-tight">{{ row.descricao || row.nomeMaterial }}</div>
                  <div class="flex items-center gap-1.5 text-[10px] print:text-[7.5px] mt-0.5">
                    <span class="font-mono text-slate-500 font-bold">{{ row.codigo }}</span>
                    <span v-if="row.nomeModelo && row.nomeModelo !== row.codigo && row.nomeModelo !== row.descricao" class="text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 px-1 rounded text-[9px] print:bg-transparent print:border-0 print:p-0 print:text-black">
                      {{ row.nomeModelo }}
                    </span>
                  </div>
                </td>

                <!-- 5. Grade / Pé -->
                <td class="py-2.5 px-2 text-center whitespace-nowrap text-slate-600 print:py-1 print:px-1">
                  <span v-if="row.gradeTamanho && row.gradeTamanho !== '-'" class="font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[10px] print:bg-transparent print:p-0 print:text-black print:text-[8px]">
                    Tam {{ row.gradeTamanho }}
                  </span>
                  <span v-if="row.ladoPe && row.ladoPe !== '-'" class="ml-0.5 text-[10px] font-black print:text-black print:text-[8px]" :class="row.ladoPe === 'E' ? 'text-indigo-600' : 'text-purple-600'">
                    ({{ row.ladoPe }})
                  </span>
                  <span v-if="(!row.gradeTamanho || row.gradeTamanho === '-') && (!row.ladoPe || row.ladoPe === '-')" class="text-slate-300 print:text-slate-400">-</span>
                </td>

                <!-- 6. Quantidade -->
                <td class="py-2.5 px-2 text-right whitespace-nowrap print:py-1 print:px-1">
                  <span class="font-black text-slate-900 text-xs print:text-[8.5px]">{{ Number(row.quantidade).toLocaleString('pt-BR') }}</span>
                  <span class="text-[10px] font-bold text-slate-400 print:text-slate-600 ml-1 print:text-[7.5px]">{{ row.unidade }}</span>
                </td>

                <!-- 7. Prateleira -->
                <td class="py-2.5 px-2 text-slate-600 font-medium text-[11px] print:py-1 print:px-1 print:text-[8px] print:text-slate-800 break-words">
                  {{ row.prateleira || '-' }}
                </td>

                <!-- 8. Origem / Motivo -->
                <td class="py-2.5 px-2 text-slate-600 text-[11px] print:py-1 print:px-1 print:text-[8px] leading-tight break-words">
                  <div class="font-semibold text-slate-800 print:text-black">{{ row.origem || '-' }}</div>
                  <div v-if="row.motivo && row.motivo !== '-' && row.motivo !== row.origem" class="text-[10px] print:text-[7.5px] text-slate-400 print:text-slate-500 italic">
                    {{ row.motivo }}
                  </div>
                </td>

                <!-- 9. Operador DASS -->
                <td class="py-2.5 px-3 text-slate-600 text-[11px] print:py-1 print:px-1 print:text-[8px] leading-tight break-words">
                  <div class="font-bold text-slate-700 print:text-black">{{ row.operador || row.responsavel }}</div>
                  <div v-if="row.matricula" class="text-[9px] text-slate-400 print:text-slate-600 font-mono print:text-[7.5px]">Mat: {{ row.matricula }}</div>
                </td>
              </tr>

              <!-- Estado Vazio -->
              <tr v-if="reportData.length === 0">
                <td colspan="9" class="py-12 text-center text-slate-400 italic">
                  <FileBarChart class="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  Nenhum dado encontrado para os filtros selecionados.
                </td>
              </tr>
            </tbody>

            <!-- TFOOT CONSOLIDADO (RODAPÉ FORMAL DA TABELA) -->
            <tfoot v-if="reportData.length > 0" class="bg-slate-100 border-t-2 border-slate-400 font-bold text-slate-900 text-xs print:text-[8.5px] print:bg-slate-200">
              <tr class="break-inside-avoid print:break-inside-avoid">
                <td colspan="5" class="py-2.5 px-3 print:py-1 print:px-1.5 uppercase tracking-wide">
                  TOTAIS CONSOLIDADOS ({{ reportData.length }} registros)
                </td>
                <td class="py-2.5 px-2 text-right print:py-1 print:px-1 whitespace-nowrap font-black">
                  {{ Number(reportData.reduce((acc, curr) => acc + Number(curr.quantidade || 0), 0)).toLocaleString('pt-BR') }}
                </td>
                <td colspan="3" class="py-2.5 px-3 print:py-1 print:px-1.5 text-slate-600 print:text-slate-800 text-[11px] print:text-[7.5px]">
                  Entradas: {{ reportTotals.volumeEntradas.toLocaleString('pt-BR') }} | Saídas: {{ reportTotals.volumeSaidas.toLocaleString('pt-BR') }} | Casamentos: {{ reportTotals.totalCasamentosPares.toLocaleString('pt-BR') }} | Refugos: {{ reportTotals.totalRefugos.toLocaleString('pt-BR') }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Rodapé Visual na Tela com Paginação -->
        <div v-if="reportData.length > 0" class="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-600 gap-3 print:hidden">
          <div class="flex items-center gap-4">
            <div>
              Total de <strong>{{ reportData.length }}</strong> registros no período filtrado.
            </div>
            <div class="flex items-center gap-2 font-bold text-xs">
              <span class="text-emerald-700">Entradas: {{ reportTotals.volumeEntradas.toLocaleString('pt-BR') }}</span>
              <span>·</span>
              <span class="text-blue-700">Saídas: {{ reportTotals.volumeSaidas.toLocaleString('pt-BR') }}</span>
            </div>
          </div>

          <!-- Controles de Paginação em Tela (Ocultos na Impressão) -->
          <div v-if="totalPages > 1" class="flex items-center gap-2 print:hidden">
            <button
              @click="currentPage--"
              :disabled="currentPage === 1"
              class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              title="Página Anterior"
            >
              &lt;
            </button>
            <span class="text-xs font-bold text-slate-700 px-1">
              {{ currentPage }} de {{ totalPages }}
            </span>
            <button
              @click="currentPage++"
              :disabled="currentPage === totalPages"
              class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              title="Próxima Página"
            >
              &gt;
            </button>
          </div>
        </div>

      </div>

      <!-- RODAPÉ CORPORATIVO DASS (EXCLUSIVO PARA IMPRESSÃO) -->
      <div class="hidden print:flex justify-between items-center mt-2 pt-1.5 border-t border-slate-300 text-[8px] text-slate-600">
        <div>Grupo DASS — Sistema SobraCorte (Módulo de Controle e Gestão Operacional de Sobras)</div>
        <div>Documento para uso interno e operacional | Página gerada eletronicamente</div>
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

  .print\:table-row {
    display: table-row !important;
  }

  * {
    overflow: visible !important;
    box-shadow: none !important;
    float: none !important;
  }

  table {
    width: 100% !important;
    border-collapse: collapse !important;
    page-break-after: auto !important;
    break-after: auto !important;
  }

  thead {
    display: table-header-group !important; /* Repete o cabeçalho no topo de cada folha naturalmente */
  }

  tfoot {
    display: table-footer-group !important;
  }

  tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: auto !important;
    break-after: auto !important;
  }
}
</style>
