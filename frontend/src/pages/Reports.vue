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
  { value: 'EXPEDICAO', label: 'Expedição (Cabedais)' },
  { value: 'MONTAGEM', label: 'Montagem (Pés Órfãos)' },
]

const operationTypes = [
  { value: 'TODOS', label: 'Todas as Operações' },
  { value: 'ENTRADA', label: 'Entradas de Sobras' },
  { value: 'SAIDA', label: 'Saídas / Reaproveitamento' },
  { value: 'TRANSFERENCIA', label: 'Transferências entre Prateleiras' },
  { value: 'CASAMENTO_PAR', label: 'Casamento de Pares' },
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
        class="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl font-bold text-sm flex items-center gap-2 transition-all"
        :class="notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'">
        <CheckCircle v-if="notification.type === 'success'" class="w-4 h-4" />
        <XCircle v-else class="w-4 h-4" />
        {{ notification.message }}
      </div>
    </transition>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

      <!-- CABEÇALHO PRINCIPAL -->
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

      <!-- CARDS DE FECHAMENTO E TOTAIS DO PERÍODO -->
      <div v-if="hasSearched" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
      <div v-if="hasSearched" class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-0">

        <!-- Cabeçalho Impressão (Visível apenas ao imprimir) -->
        <div class="hidden print:block p-6 text-center border-b border-slate-200">
          <h1 class="text-2xl font-black text-slate-900">Grupo DASS — Relatório de Gestão de Sobras</h1>
          <p class="text-xs text-slate-500 mt-1">
            Fábrica: {{ authStore.user?.unit?.name || 'Unidade DASS' }} | Gerado por: {{ authStore.user?.nome }} em {{ new Date().toLocaleString('pt-BR') }}
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-wider border-b border-slate-200 print:bg-slate-100">
              <tr>
                <th class="py-3 px-4">Data / Hora</th>
                <th class="py-3 px-3 text-center">Setor</th>
                <th class="py-3 px-3 text-center">Operação</th>
                <th class="py-3 px-4">Código / Descrição</th>
                <th class="py-3 px-2 text-center">Grade / Pé</th>
                <th class="py-3 px-3 text-right">Qtd / Un</th>
                <th class="py-3 px-3">Prateleira</th>
                <th class="py-3 px-3">Origem / Motivo</th>
                <th class="py-3 px-4">Operador</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="row in reportData"
                :key="row.id"
                class="hover:bg-slate-50/80 transition-colors"
              >
                <!-- 1. Data e Hora -->
                <td class="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                  <div class="font-bold text-slate-800">{{ new Date(row.data).toLocaleDateString('pt-BR') }}</div>
                  <div class="text-[10px] text-slate-400">{{ new Date(row.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}</div>
                </td>

                <!-- 2. Setor -->
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                  <span class="text-[9px] font-black px-2 py-0.5 rounded-md border uppercase" :class="getSectorBadge(row.setor || row.sector)">
                    {{ row.setor || row.sector || 'CORTE' }}
                  </span>
                </td>

                <!-- 3. Operação -->
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                  <span class="text-[9px] font-black px-2 py-0.5 rounded-md border uppercase" :class="getTypeBadge(row.tipo)">
                    {{ row.tipo }}
                  </span>
                </td>

                <!-- 4. Código e Descrição -->
                <td class="py-2.5 px-4">
                  <div class="font-bold text-slate-900">{{ row.descricao || row.nomeMaterial }}</div>
                  <div class="text-[10px] font-mono text-slate-400">{{ row.codigo }}</div>
                </td>

                <!-- 5. Grade / Pé -->
                <td class="py-2.5 px-2 text-center whitespace-nowrap text-slate-600">
                  <span v-if="row.gradeTamanho && row.gradeTamanho !== '-'" class="font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                    Tam {{ row.gradeTamanho }}
                  </span>
                  <span v-if="row.ladoPe && row.ladoPe !== '-'" class="ml-1 text-[10px] font-black" :class="row.ladoPe === 'E' ? 'text-indigo-600' : 'text-purple-600'">
                    ({{ row.ladoPe }})
                  </span>
                  <span v-if="(!row.gradeTamanho || row.gradeTamanho === '-') && (!row.ladoPe || row.ladoPe === '-')" class="text-slate-300">-</span>
                </td>

                <!-- 6. Quantidade -->
                <td class="py-2.5 px-3 text-right whitespace-nowrap">
                  <span class="font-black text-slate-900 text-sm">{{ Number(row.quantidade).toLocaleString('pt-BR') }}</span>
                  <span class="text-[10px] font-bold text-slate-400 ml-1">{{ row.unidade }}</span>
                </td>

                <!-- 7. Prateleira -->
                <td class="py-2.5 px-3 text-slate-600 whitespace-nowrap font-medium text-[11px]">
                  {{ row.prateleira || '-' }}
                </td>

                <!-- 8. Origem / Motivo -->
                <td class="py-2.5 px-3 text-slate-600 text-[11px]">
                  <div class="font-semibold text-slate-800">{{ row.origem || '-' }}</div>
                  <div v-if="row.motivo && row.motivo !== '-' && row.motivo !== row.origem" class="text-[10px] text-slate-400 italic">
                    {{ row.motivo }}
                  </div>
                </td>

                <!-- 9. Operador DASS -->
                <td class="py-2.5 px-4 text-slate-600 whitespace-nowrap text-[11px]">
                  <div class="font-bold text-slate-700">{{ row.operador || row.responsavel }}</div>
                  <div v-if="row.matricula" class="text-[9px] text-slate-400 font-mono">Mat: {{ row.matricula }}</div>
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
          </table>
        </div>

        <!-- Rodapé com Fechamento Total -->
        <div v-if="reportData.length > 0" class="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-600 gap-2 print:bg-slate-100">
          <div>
            Total de <strong>{{ reportData.length }}</strong> registros no período filtrado.
          </div>
          <div class="flex items-center gap-4 font-bold">
            <span class="text-emerald-700">Entradas: {{ reportTotals.volumeEntradas.toLocaleString('pt-BR') }}</span>
            <span>·</span>
            <span class="text-blue-700">Saídas: {{ reportTotals.volumeSaidas.toLocaleString('pt-BR') }}</span>
          </div>
        </div>

      </div>

    </div>
  </Layout>
</template>

<style>
@page {
  margin: 0.8cm;
}

@media print {
  body { background: white !important; }
  aside, header, footer, nav { display: none !important; }
  .print\:hidden { display: none !important; }
  .print\:block { display: block !important; }

  * {
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    min-height: auto !important;
  }

  #app, main {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
  }

  table { width: 100% !important; }
  tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
</style>
