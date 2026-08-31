<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from "../composables/useApi"
import {
  Activity, Clock, RefreshCw, Layers, Scissors, Box,
  Footprints, Package, CheckCircle2, AlertTriangle,
  PieChart, MapPin, Trophy, TrendingUp, HelpCircle,
  ArrowUpRight, ArrowDownRight, Sparkles, AlertOctagon
} from 'lucide-vue-next'

const { fetchDashboardSummary } = useApi()

// --- ESTADO DO FILTRO RÁPIDO ---
const selectedSector = ref('TODOS')
const sectorFilterOptions = [
  { id: 'TODOS',          label: 'Todos os Setores',        icon: Layers },
  { id: 'CORTE',          label: 'Corte (Matéria-Prima)',   icon: Scissors },
  { id: 'APOIO',          label: 'Apoio (Moldes/Peças)',    icon: Box },
  { id: 'PRE_FABRICADO',  label: 'Pré-Fabricado (Solas)',   icon: Package },
  { id: 'EXPEDICAO',      label: 'Cabedais',                icon: Layers },
  { id: 'MONTAGEM',       label: 'Montagem (Pés Órfãos)',   icon: Footprints },
]

// --- ESTADOS DE DADOS (CARREGADOS EM 1 ÚNICA REQUISIÇÃO) ---
const realStats = ref({
  totalMaterials: 0,
  totalMultiSetorItems: 0,
  totalItems: 0,
  lowStock: 0,
  totalMovements: 0,
  totalEntries: 0,
  totalExits: 0,
  taxaReaproveitamento: 0,
  totalParadosSemGiro: 0
})

const displayStats = ref({
  totalItems: 0,
  lowStock: 0,
  totalMovements: 0,
  totalEntries: 0,
  totalExits: 0,
  taxaReaproveitamento: 0,
  totalParadosSemGiro: 0
})

const setoresData = ref({
  corte:        { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0 },
  apoio:        { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0 },
  preFabricado: { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0 },
  expedicao:    { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0 },
  montagem:     { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0 },
})

const volumePorSetor       = ref([])
const pieChartData         = ref([])
const origemChartData      = ref([])
const origensPorSetorData  = ref({})
const topSobrasEntrada     = ref([])

const isLoading         = ref(true)
const hoveredSector     = ref(null)
const hoveredCategory   = ref(null)
const hoveredOrigem     = ref(null)
const isUpdating        = ref(false)
const currentTime       = ref(new Date())
let refreshInterval     = null
let clockInterval       = null
let isFetchingData      = false

// --- ANIMAÇÃO SUAVE DE NÚMEROS ---
function animateValue(key, start, end, duration = 600) {
  if (start === end) return
  let startTimestamp = null
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp
    const progress = Math.min((timestamp - startTimestamp) / duration, 1)
    displayStats.value[key] = Math.floor(progress * (end - start) + start)
    if (progress < 1) window.requestAnimationFrame(step)
    else displayStats.value[key] = end
  }
  window.requestAnimationFrame(step)
}

watch(() => realStats.value.totalItems,           (n, o) => animateValue('totalItems',           o || 0, n))
watch(() => realStats.value.lowStock,             (n, o) => animateValue('lowStock',             o || 0, n))
watch(() => realStats.value.totalMovements,       (n, o) => animateValue('totalMovements',       o || 0, n))
watch(() => realStats.value.totalEntries,         (n, o) => animateValue('totalEntries',         o || 0, n))
watch(() => realStats.value.totalExits,           (n, o) => animateValue('totalExits',           o || 0, n))
watch(() => realStats.value.taxaReaproveitamento, (n, o) => animateValue('taxaReaproveitamento', o || 0, n))
watch(() => realStats.value.totalParadosSemGiro,  (n, o) => animateValue('totalParadosSemGiro',  o || 0, n))

function formatNumber(value) {
  if (!value && value !== 0) return '0'
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// --- CORES PADRONIZADAS POR SETOR ---
const sectorColors = {
  CORTE:         '#047857',
  APOIO:         '#0284c7',
  PRE_FABRICADO: '#f59e0b',
  EXPEDICAO:     '#8b5cf6',
  MONTAGEM:      '#ec4899',
}

function getColorForCategory(cat) {
  const catLower = String(cat).toLowerCase().trim()
  const colors = {
    'sintetico': '#1d4ed8',
    'couro':     '#854d0e',
    'tecido':    '#047857',
    'solado':    '#334155',
    'quimico':   '#b91c1c',
    'filme':     '#4f46e5',
    'forro':     '#0ea5e9',
    'linha':     '#d946ef',
    'elastico':  '#f59e0b',
    'aviamento': '#ec4899',
    'outro':     '#94a3b8'
  }
  return colors[catLower] || '#64748b'
}

const origemColors = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#0ea5e9', '#ec4899', '#14b8a6', '#f97316', '#64748b'
]

// --- CÁLCULOS REATIVOS ADAPTÁVEIS AO FILTRO DE SETOR ---

// 1. Volume Adaptável
const currentFilteredVolume = computed(() => {
  if (selectedSector.value === 'TODOS') {
    return {
      label: 'Volume Total em Estoque',
      itemsCount: realStats.value.totalItems,
      quantity: volumePorSetor.value.reduce((acc, v) => acc + (v.quantity || 0), 0),
      unit: 'unidades / m²'
    }
  }
  if (selectedSector.value === 'CORTE') {
    return {
      label: 'Estoque de Matéria-Prima (Corte)',
      itemsCount: setoresData.value.corte.itemsCount,
      quantity: setoresData.value.corte.totalQuantity,
      unit: 'm² / m / un'
    }
  }
  if (selectedSector.value === 'APOIO') {
    return {
      label: 'Estoque de Peças / Apoio',
      itemsCount: setoresData.value.apoio.itemsCount,
      quantity: setoresData.value.apoio.totalQuantity,
      unit: 'peças'
    }
  }
  if (selectedSector.value === 'PRE_FABRICADO') {
    return {
      label: 'Estoque de Solas (Pré-Fabricado)',
      itemsCount: setoresData.value.preFabricado.itemsCount,
      quantity: setoresData.value.preFabricado.totalQuantity,
      unit: 'pares de solas'
    }
  }
  if (selectedSector.value === 'EXPEDICAO') {
    return {
      label: 'Estoque de Cabedais (Expedição)',
      itemsCount: setoresData.value.expedicao.itemsCount,
      quantity: setoresData.value.expedicao.totalQuantity,
      unit: 'cabedais'
    }
  }
  if (selectedSector.value === 'MONTAGEM') {
    return {
      label: 'Estoque de Pés Órfãos (Montagem)',
      itemsCount: setoresData.value.montagem.itemsCount,
      quantity: setoresData.value.montagem.totalQuantity,
      unit: 'pés avulsos'
    }
  }
  return { label: 'Estoque', itemsCount: 0, quantity: 0, unit: 'un' }
})

// 2. Entradas & Taxa de Reaproveitamento Adaptáveis
const currentFilteredEfficiency = computed(() => {
  if (selectedSector.value === 'TODOS') {
    return {
      taxa: realStats.value.taxaReaproveitamento,
      entries: realStats.value.totalEntries,
      exits: realStats.value.totalExits,
      label: 'Reaproveitamento Fabril'
    }
  }
  const secMap = {
    CORTE: setoresData.value.corte,
    APOIO: setoresData.value.apoio,
    PRE_FABRICADO: setoresData.value.preFabricado,
    EXPEDICAO: setoresData.value.expedicao,
    MONTAGEM: setoresData.value.montagem,
  }
  const s = secMap[selectedSector.value] || { totalEntries: 0, totalExits: 0 }
  const taxa = s.totalEntries > 0 ? Math.min(100, Math.round((s.totalExits / s.totalEntries) * 100)) : 0
  return {
    taxa,
    entries: s.totalEntries || 0,
    exits: s.totalExits || 0,
    label: `Giro no Setor ${selectedSector.value}`
  }
})

// 3. Itens Parados sem Giro Adaptáveis
const currentFilteredStagnant = computed(() => {
  if (selectedSector.value === 'TODOS') {
    return realStats.value.totalParadosSemGiro
  }
  const secMap = {
    CORTE: setoresData.value.corte?.totalParadosSemGiro,
    APOIO: setoresData.value.apoio?.totalParadosSemGiro,
    PRE_FABRICADO: setoresData.value.preFabricado?.totalParadosSemGiro,
    EXPEDICAO: setoresData.value.expedicao?.totalParadosSemGiro,
    MONTAGEM: setoresData.value.montagem?.totalParadosSemGiro,
  }
  return secMap[selectedSector.value] || 0
})

// 4. Top 5 Entradas de Sobras Filtradas pelo Setor Selecionado
const filteredTopSobras = computed(() => {
  if (selectedSector.value === 'TODOS') {
    return topSobrasEntrada.value.slice(0, 5)
  }
  const filtered = topSobrasEntrada.value.filter(item => item.sector === selectedSector.value)
  return filtered.length > 0 ? filtered.slice(0, 5) : []
})

// 5. Origem das Entradas Reativa ao Setor Selecionado
const filteredOrigemChartData = computed(() => {
  let list = []
  if (selectedSector.value === 'TODOS') {
    list = origemChartData.value
  } else {
    list = origensPorSetorData.value[selectedSector.value] || []
  }

  const total = list.reduce((acc, item) => acc + (Number(item.value ?? item._sum?.quantity) || 0), 0)
  return list.map((item, i) => {
    const value = Number(item.value ?? item._sum?.quantity) || 0
    return {
      origem: item.origem || item.name || 'Outros',
      label: item.origem || item.name || 'Outros',
      name: item.origem || item.name || 'Outros',
      value,
      count: item.count || 1,
      percent: total > 0 ? (value / total) * 100 : (item.percentage || 0),
      percentage: total > 0 ? (value / total) * 100 : (item.percentage || 0),
      color: origemColors[i % origemColors.length]
    }
  }).slice(0, 5)
})

// Gráfico de Volume por Setor
const sectorChartStyle = computed(() => {
  const total = volumePorSetor.value.reduce((acc, s) => acc + s.quantity, 0)
  if (total === 0) return { background: '#e2e8f0' }
  let gradientStr = ''
  let currentDeg = 0
  volumePorSetor.value.forEach((sec, index) => {
    const pct = (sec.quantity / total) * 100
    const deg = (pct / 100) * 360
    gradientStr += `${sec.color} ${currentDeg}deg ${currentDeg + deg}deg`
    if (index < volumePorSetor.value.length - 1) gradientStr += ', '
    currentDeg += deg
  })
  return { background: `conic-gradient(${gradientStr})` }
})

// Gráfico de Origem das Sobras Reativo ao Setor
const origemChartStyle = computed(() => {
  if (filteredOrigemChartData.value.length === 0) return { background: '#e2e8f0' }
  let gradientStr = ''
  let currentDeg = 0
  filteredOrigemChartData.value.forEach((slice, index) => {
    const deg = (slice.percent / 100) * 360
    gradientStr += `${slice.color} ${currentDeg}deg ${currentDeg + deg}deg`
    if (index < filteredOrigemChartData.value.length - 1) gradientStr += ', '
    currentDeg += deg
  })
  return { background: `conic-gradient(${gradientStr})` }
})

// --- CARREGAMENTO ÚNICO CONSOLIDADO (SINGLE ROUND-TRIP) ---
async function loadData() {
  if (isFetchingData) return
  isFetchingData = true
  isUpdating.value = true

  try {
    const summary = await fetchDashboardSummary()
    const statsData = summary?.stats || {}
    const setoresRaw = summary?.setores || {}
    const volRaw = summary?.volumePorSetor || []
    const catDistRaw = summary?.distribuicao || []
    const origemRaw = summary?.origemSobras || []
    const origensPorSetorRaw = summary?.origensPorSetor || {}
    const topSobrasRaw = summary?.topSobrasEntrada || []

    // 1. Estatísticas Globais
    realStats.value = {
      totalMaterials:       statsData.totalMaterials || 0,
      totalMultiSetorItems: statsData.totalMultiSetorItems || 0,
      totalItems:           statsData.totalItems || (statsData.totalMaterials || 0) + (statsData.totalMultiSetorItems || 0),
      lowStock:             statsData.lowStock || 0,
      totalMovements:       statsData.totalMovements || 0,
      totalEntries:         statsData.totalEntries || 0,
      totalExits:           statsData.totalExits || 0,
      taxaReaproveitamento: statsData.taxaReaproveitamento || 0,
      totalParadosSemGiro:  statsData.totalParadosSemGiro || 0
    }

    // 2. Dados Setorizados
    setoresData.value = {
      corte:        setoresRaw.corte || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0 },
      apoio:        setoresRaw.apoio || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0 },
      preFabricado: setoresRaw.preFabricado || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0 },
      expedicao:    setoresRaw.expedicao || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0 },
      montagem:     setoresRaw.montagem || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0 },
    }

    // 3. Volume por Setor
    const totalVol = volRaw.reduce((acc, v) => acc + (Number(v.quantity) || 0), 0)
    volumePorSetor.value = volRaw.map(v => ({
      ...v,
      percent: totalVol > 0 ? ((Number(v.quantity) || 0) / totalVol) * 100 : 0
    }))

    // 4. Distribuição por Categoria
    const totalDist = catDistRaw.reduce((acc, item) => acc + (Number(item._sum?.quantity) || 0), 0)
    pieChartData.value = catDistRaw.map(item => {
      const label = String(item.type || 'outros')
      const value = Number(item._sum?.quantity) || 0
      return {
        label:   label.charAt(0).toUpperCase() + label.slice(1),
        value,
        percent: totalDist > 0 ? (value / totalDist) * 100 : 0,
        color:   getColorForCategory(label)
      }
    }).sort((a, b) => b.value - a.value).slice(0, 5)

    // 5. Origem das Sobras (Global e Setorizada)
    const totalOrigem = origemRaw.reduce((acc, item) => acc + (Number(item._sum?.quantity) || 0), 0)
    origemChartData.value = origemRaw.map((item, i) => {
      const value = Number(item._sum?.quantity) || 0
      return {
        origem:  item.origem || item.name || 'Outros',
        label:   item.origem || item.name || 'Outros',
        name:    item.origem || item.name || 'Outros',
        value,
        count:   item.count || 1,
        percent: totalOrigem > 0 ? (value / totalOrigem) * 100 : 0,
        color:   origemColors[i % origemColors.length]
      }
    }).slice(0, 5)

    origensPorSetorData.value = origensPorSetorRaw

    // 6. Top Sobras Entrada
    topSobrasEntrada.value = topSobrasRaw

  } catch (error) {
    console.error('Erro ao carregar métricas analíticas do dashboard:', error)
  } finally {
    isLoading.value = false
    isFetchingData = false
    setTimeout(() => { isUpdating.value = false }, 500)
  }
}

onMounted(() => {
  loadData()
  clockInterval = setInterval(() => { currentTime.value = new Date() }, 1000)
  refreshInterval = setInterval(loadData, 60000)
})

onUnmounted(() => {
  clearInterval(refreshInterval)
  clearInterval(clockInterval)
})
</script>

<template>
  <Layout>
    <div class="min-h-screen bg-slate-100 p-4 md:p-6 transition-colors duration-500">
      <div class="max-w-7xl mx-auto space-y-5">

        <!-- CABEÇALHO DO PAINEL ANALÍTICO -->
        <div class="flex flex-col md:flex-row justify-between items-center bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-200 gap-4">
          <div class="flex items-center gap-3.5 w-full md:w-auto">
            <div class="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Activity class="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-xl font-black text-slate-800 tracking-tight uppercase">
                  Painel de Controle Multi-Setor
                </h1>
                <span class="bg-indigo-50 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold border border-indigo-100 uppercase">
                  5 Setores Fabris
                </span>
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Rastreabilidade em Tempo Real</span>
                <RefreshCw v-if="isUpdating" class="w-3 h-3 text-indigo-600 animate-spin ml-1" />
              </div>
            </div>
          </div>

          <div class="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 flex items-center gap-3 shadow-inner w-full md:w-auto justify-between md:justify-end">
            <div class="text-right">
              <div class="text-xl font-black text-slate-700 leading-none tabular-nums">
                {{ currentTime.toLocaleTimeString('pt-BR') }}
              </div>
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                {{ currentTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) }}
              </div>
            </div>
            <Clock class="w-6 h-6 text-slate-300" />
          </div>
        </div>

        <!-- SELETOR / FILTRO RÁPIDO POR SETOR -->
        <div class="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-1.5 overflow-x-auto">
          <button
            v-for="sec in sectorFilterOptions"
            :key="sec.id"
            @click="selectedSector = sec.id"
            class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
            :class="selectedSector === sec.id
              ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
          >
            <component :is="sec.icon" class="w-3.5 h-3.5" />
            <span>{{ sec.label }}</span>
          </button>
        </div>

        <!-- CARDS PRINCIPAIS DE KPIS OPERACIONAIS (4 INDICADORES CENTRAIS) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <!-- 1. Volume de Sobras (Dinâmico conforme setor filtrado) -->
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 border-b-4 border-b-indigo-600 relative group overflow-hidden">
            <div class="flex justify-between items-start">
              <div>
                <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  {{ currentFilteredVolume.label }}
                </p>
                <h3 class="text-2xl font-black text-slate-800 mt-1 tracking-tight">
                  {{ formatNumber(currentFilteredVolume.quantity) }}
                  <span class="text-xs font-bold text-slate-400 ml-0.5">{{ currentFilteredVolume.unit }}</span>
                </h3>
                <p class="text-[11px] text-indigo-600 font-bold mt-0.5">
                  {{ formatNumber(currentFilteredVolume.itemsCount) }} cadastros ativos
                </p>
              </div>
              <div class="bg-indigo-50 p-2.5 rounded-xl text-indigo-600 shadow-inner">
                <Box class="w-5 h-5" />
              </div>
            </div>
          </div>

          <!-- 2. Taxa de Reaproveitamento Fabril (%) Adaptável -->
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 border-b-4 border-b-emerald-500 relative group overflow-hidden">
            <div class="flex justify-between items-start">
              <div>
                <div class="flex items-center gap-1">
                  <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    {{ currentFilteredEfficiency.label }}
                  </p>
                  <Sparkles class="w-3 h-3 text-emerald-500" />
                </div>
                <h3 class="text-2xl font-black text-emerald-600 mt-1 tracking-tight">
                  {{ currentFilteredEfficiency.taxa }}%
                </h3>
                <div class="flex items-center gap-1 mt-0.5 text-[11px] font-bold text-emerald-700">
                  <ArrowUpRight class="w-3.5 h-3.5" />
                  <span>{{ formatNumber(currentFilteredEfficiency.exits) }} saídas realizadas</span>
                </div>
              </div>
              <div class="bg-emerald-50 p-2.5 rounded-xl text-emerald-600 shadow-inner">
                <CheckCircle2 class="w-5 h-5" />
              </div>
            </div>
            <div class="w-full bg-slate-100 h-1.5 mt-2.5 rounded-full overflow-hidden">
              <div class="bg-emerald-500 h-full transition-all duration-700" :style="{ width: `${Math.min(100, currentFilteredEfficiency.taxa)}%` }"></div>
            </div>
          </div>

          <!-- 3. Itens Parados Sem Giro (>30 Dias) Adaptável -->
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 border-b-4 border-b-amber-500 relative group overflow-hidden">
            <div class="flex justify-between items-start">
              <div>
                <div class="flex items-center gap-1">
                  <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Parados Sem Giro (>30d)</p>
                  <AlertTriangle class="w-3 h-3 text-amber-500" />
                </div>
                <h3 class="text-2xl font-black text-amber-600 mt-1 tracking-tight">
                  {{ formatNumber(currentFilteredStagnant) }}
                </h3>
                <p class="text-[10px] text-amber-700 font-bold mt-0.5 bg-amber-50 inline-block px-1.5 py-0.5 rounded">
                  Atenção Operacional ⚠️
                </p>
              </div>
              <div class="bg-amber-50 p-2.5 rounded-xl text-amber-600 shadow-inner">
                <Clock class="w-5 h-5" />
              </div>
            </div>
          </div>

          <!-- 4. Casamento de Pares & Montagem / Detalhes de Giro -->
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 border-b-4 border-b-fuchsia-500 relative group overflow-hidden">
            <div class="flex justify-between items-start">
              <div>
                <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Montagem & Pares Órfãos</p>
                <div class="flex items-baseline gap-2 mt-1">
                  <h3 class="text-2xl font-black text-fuchsia-700 tracking-tight">
                    {{ formatNumber(setoresData.montagem.paresCasados) }}
                  </h3>
                  <span class="text-xs font-bold text-fuchsia-600">pares casados</span>
                </div>
                <div class="flex items-center gap-2 mt-0.5 text-[11px] font-bold text-slate-500">
                  <span class="text-indigo-600">Esq: {{ formatNumber(setoresData.montagem.peEsq) }}</span>
                  <span>·</span>
                  <span class="text-purple-600">Dir: {{ formatNumber(setoresData.montagem.peDir) }}</span>
                </div>
              </div>
              <div class="bg-fuchsia-50 p-2.5 rounded-xl text-fuchsia-600 shadow-inner">
                <Footprints class="w-5 h-5" />
              </div>
            </div>
          </div>

        </div>

        <!-- GRÁFICOS ANALÍTICOS & TOP SOBRAS (3 COLUNAS ENXUTAS) -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          <!-- 1. Distribuição de Volume por Setor -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col items-center relative overflow-hidden">
            <h3 class="font-bold text-slate-800 w-full text-left mb-3 flex items-center gap-2 text-xs uppercase tracking-wider">
              <PieChart class="w-4 h-4 text-indigo-500" /> Distribuição de Volume
            </h3>

            <div class="relative w-32 h-32 mx-auto rounded-full shadow-sm my-2 border-4 border-slate-50 transition-transform hover:scale-105"
              :style="sectorChartStyle">
              <div class="absolute inset-0 m-auto w-16 h-16 bg-white rounded-full flex flex-col items-center justify-center shadow-inner overflow-hidden">
                <div v-if="hoveredSector" class="flex flex-col items-center justify-center w-full h-full text-center px-0.5">
                  <span class="text-sm font-black leading-none" :style="{ color: hoveredSector.color }">
                    {{ hoveredSector.percent.toFixed(0) }}%
                  </span>
                  <span class="text-[7px] font-bold text-slate-500 uppercase mt-0.5 truncate max-w-[50px]">
                    {{ hoveredSector.sector }}
                  </span>
                </div>
                <div v-else class="flex flex-col items-center justify-center w-full h-full text-center">
                  <span class="text-base font-black text-slate-800">5</span>
                  <span class="text-[7px] font-bold text-slate-400 uppercase">Setores</span>
                </div>
              </div>
            </div>

            <div class="w-full space-y-1 mt-3 text-xs">
              <div
                v-for="sec in volumePorSetor"
                :key="sec.sector"
                @mouseenter="hoveredSector = sec"
                @mouseleave="hoveredSector = null"
                class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors"
              >
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-sm" :style="{ backgroundColor: sec.color }"></span>
                  <span class="font-bold text-slate-700 uppercase text-[10px]">{{ sec.label }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-slate-400 text-[9px] font-bold bg-slate-200 px-1 py-0.5 rounded">{{ sec.percent.toFixed(1) }}%</span>
                  <span class="font-bold text-slate-800 text-[11px]">{{ formatNumber(sec.quantity) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Origem das Entradas de Sobra Reativa ao Setor -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col items-center relative overflow-hidden">
            <h3 class="font-bold text-slate-800 w-full text-left mb-3 flex items-center gap-2 text-xs uppercase tracking-wider">
              <MapPin class="w-4 h-4 text-violet-500" /> Origem das Entradas
            </h3>

            <div class="relative w-32 h-32 mx-auto rounded-full shadow-sm my-2 border-4 border-slate-50 transition-transform hover:scale-105"
              :style="origemChartStyle">
              <div class="absolute inset-0 m-auto w-16 h-16 bg-white rounded-full flex flex-col items-center justify-center shadow-inner overflow-hidden">
                <div v-if="hoveredOrigem" class="flex flex-col items-center justify-center w-full h-full text-center px-0.5">
                  <span class="text-sm font-black leading-none" :style="{ color: hoveredOrigem.color }">
                    {{ hoveredOrigem.percent.toFixed(0) }}%
                  </span>
                  <span class="text-[7px] font-bold text-slate-500 uppercase mt-0.5 truncate max-w-[50px]">
                    {{ hoveredOrigem.label }}
                  </span>
                </div>
                <div v-else class="flex flex-col items-center justify-center w-full h-full text-center">
                  <span class="text-base font-black text-slate-800">{{ filteredOrigemChartData.length }}</span>
                  <span class="text-[7px] font-bold text-slate-400 uppercase">Fontes</span>
                </div>
              </div>
            </div>

            <div class="w-full space-y-1 mt-3 text-xs">
              <div v-if="filteredOrigemChartData.length === 0" class="p-3 text-center text-slate-400 text-xs italic">
                Nenhuma entrada registrada neste setor.
              </div>
              <div
                v-else
                v-for="slice in filteredOrigemChartData"
                :key="slice.label"
                @mouseenter="hoveredOrigem = slice"
                @mouseleave="hoveredOrigem = null"
                class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors"
              >
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-sm" :style="{ backgroundColor: slice.color }"></span>
                  <span class="font-bold text-slate-700 uppercase text-[10px] truncate max-w-[130px]">{{ slice.label }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-slate-400 text-[9px] font-bold bg-slate-200 px-1 py-0.5 rounded">{{ slice.percent.toFixed(1) }}%</span>
                  <span class="font-bold text-slate-800 text-[11px]">{{ formatNumber(slice.value) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. TOP 5 MATERIAIS COM MAIS SOBRAS (CAUSA RAIZ / ACÚMULO) -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col relative overflow-hidden">
            <div class="w-full flex justify-between items-center mb-3">
              <h3 class="font-bold text-slate-800 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <AlertOctagon class="w-4 h-4 text-red-500" /> Top 5 com Mais Sobras
              </h3>
              <span class="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 uppercase tracking-widest">
                ACÚMULO
              </span>
            </div>

            <div class="w-full flex-1 flex flex-col justify-between">
              <div class="space-y-1.5">
                <div
                  v-for="(item, index) in filteredTopSobras"
                  :key="item.id"
                  class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors text-xs"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="w-5 h-5 rounded-md flex items-center justify-center font-black text-[10px] shrink-0"
                      :class="index === 0 ? 'bg-red-100 text-red-700' : index === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'"
                    >
                      {{ index + 1 }}
                    </span>
                    <div class="min-w-0">
                      <p class="font-bold text-slate-800 truncate text-[11px]">{{ item.name }}</p>
                      <p class="text-[9px] text-slate-400 font-mono">Cód: {{ item.code }} · {{ item.sector }}</p>
                    </div>
                  </div>
                  <div class="text-right shrink-0 ml-2">
                    <span class="font-black text-red-700 text-xs">{{ formatNumber(item.totalQuantity) }}</span>
                    <span class="text-[9px] text-slate-400 ml-0.5 uppercase">{{ item.unit }}</span>
                  </div>
                </div>

                <div v-if="filteredTopSobras.length === 0" class="p-6 text-center text-slate-400 text-xs italic">
                  Nenhuma entrada de sobra registrada para este setor.
                </div>
              </div>

              <div class="w-full text-center border-t border-slate-100 pt-2.5 mt-3">
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Entradas Acumuladas no Sistema
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  </Layout>
</template>