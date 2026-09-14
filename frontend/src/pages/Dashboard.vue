<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from "../composables/useApi"
import { formatNumber, formatDate } from "@/utils/format"
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
  { id: 'DISTRIBUICAO',   label: 'Distribuição',            icon: Layers },
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
  totalParadosSemGiro: 0,
  totalParesFormaveis: 0,
  totalParesCasados: 0,
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
  corte:        { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalExitsVolume: 0, totalParadosSemGiro: 0 },
  apoio:        { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalExitsVolume: 0, totalParadosSemGiro: 0 },
  preFabricado: { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0, paresFormaveis: 0 },
  expedicao:    { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0, paresFormaveis: 0 },
  distribuicao: { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0, paresFormaveis: 0 },
  montagem:     { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0, paresFormaveis: 0 },
})

const volumePorSetor       = ref([])
const pieChartData         = ref([])
const origemChartData      = ref([])
const origensPorSetorData  = ref({})
const topSobrasEntrada     = ref([])
const topMateriaisPorUnidade = ref({})
const topMateriaisPorSetorEUnidade = ref({})
const unidadesDisponiveis   = ref([])
const unidadesPorSetor      = ref({})
const selectedTopUnit       = ref('M²')

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

// 1. Volume Adaptável & Desmembramento de Unidades de Medida
const currentFilteredVolume = computed(() => {
  if (selectedSector.value === 'TODOS') {
    const corteQty = Number(setoresData.value.corte?.totalQuantity || 0)
    const apoioQty = Number(setoresData.value.apoio?.totalQuantity || 0)
    const preFabQty = Number(setoresData.value.preFabricado?.totalQuantity || 0)
    const expedicaoQty = Number(setoresData.value.expedicao?.totalQuantity || 0)
    const montagemQty = Number(setoresData.value.montagem?.totalQuantity || 0)
    const calcadosQty = apoioQty + preFabQty + expedicaoQty + montagemQty

    return {
      isAllSectors: true,
      label: 'Cadastros Ativos em Estoque',
      mainCount: realStats.value.totalItems,
      mainUnit: 'cadastros',
      corteVolume: corteQty,
      componentesVolume: calcadosQty,
    }
  }
  if (selectedSector.value === 'CORTE') {
    return {
      isAllSectors: false,
      label: 'Estoque de Matéria-Prima (Corte)',
      mainCount: Number(setoresData.value.corte?.totalQuantity || 0),
      mainUnit: 'm²',
      itemsCount: setoresData.value.corte?.itemsCount || 0
    }
  }
  if (selectedSector.value === 'APOIO') {
    return {
      isAllSectors: false,
      label: 'Estoque de Peças (Apoio)',
      mainCount: Number(setoresData.value.apoio?.totalQuantity || 0),
      mainUnit: 'peças',
      itemsCount: setoresData.value.apoio?.itemsCount || 0
    }
  }
  if (selectedSector.value === 'PRE_FABRICADO') {
    return {
      isAllSectors: false,
      label: 'Estoque de Solas (Pré-Fabricado)',
      mainCount: Number(setoresData.value.preFabricado?.totalQuantity || 0),
      mainUnit: 'pares de solas',
      itemsCount: setoresData.value.preFabricado?.itemsCount || 0
    }
  }
  if (selectedSector.value === 'DISTRIBUICAO' || selectedSector.value === 'EXPEDICAO') {
    return {
      isAllSectors: false,
      label: 'Estoque de Distribuição (Cabedais/Solas)',
      mainCount: Number(setoresData.value.distribuicao?.totalQuantity || setoresData.value.expedicao?.totalQuantity || 0),
      mainUnit: 'unidades',
      itemsCount: setoresData.value.distribuicao?.itemsCount || setoresData.value.expedicao?.itemsCount || 0
    }
  }
  if (selectedSector.value === 'MONTAGEM') {
    return {
      isAllSectors: false,
      label: 'Estoque de Pés Órfãos (Montagem)',
      mainCount: Number(setoresData.value.montagem?.totalQuantity || 0),
      mainUnit: 'pés avulsos',
      itemsCount: setoresData.value.montagem?.itemsCount || 0
    }
  }
  return { isAllSectors: false, label: 'Estoque', mainCount: 0, mainUnit: 'un', itemsCount: 0 }
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

// 4. Card 4 Dinâmico: Pares Casados e Formáveis por Setor / Métricas Específicas
const currentFilteredPairsCard = computed(() => {
  if (selectedSector.value === 'TODOS') {
    const totalFormaveis = Number(realStats.value.totalParesFormaveis) || (
      (Number(setoresData.value.montagem?.paresFormaveis) || 0) +
      (Number(setoresData.value.preFabricado?.paresFormaveis) || 0) +
      (Number(setoresData.value.distribuicao?.paresFormaveis) || Number(setoresData.value.expedicao?.paresFormaveis) || 0)
    );
    const montagemForm = Number(setoresData.value.montagem?.paresFormaveis) || 0;
    const preFabForm = Number(setoresData.value.preFabricado?.paresFormaveis) || 0;
    const distrForm = Number(setoresData.value.distribuicao?.paresFormaveis) || Number(setoresData.value.expedicao?.paresFormaveis) || 0;

    return {
      type: 'PARES_GLOBAL',
      title: 'Pares Formáveis Fabris',
      badge: 'Multi-Setor',
      badgeColor: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
      mainCount: totalFormaveis,
      mainUnit: 'prs',
      subtext: 'Pares completos disponíveis para montagem',
      icon: Footprints,
      iconBg: 'bg-fuchsia-50 text-fuchsia-600',
      borderClass: 'border-b-fuchsia-500',
      breakdown: [
        { label: 'Montagem', value: montagemForm, color: 'text-fuchsia-600' },
        { label: 'Solas (Pré-Fab)', value: preFabForm, color: 'text-amber-600' },
        { label: 'Distribuição', value: distrForm, color: 'text-indigo-600' },
      ],
    };
  }

  if (selectedSector.value === 'MONTAGEM') {
    const formaveis = Number(setoresData.value.montagem?.paresFormaveis) || 0;
    const casados = Number(setoresData.value.montagem?.paresCasados) || 0;
    const peEsq = Number(setoresData.value.montagem?.peEsq) || 0;
    const peDir = Number(setoresData.value.montagem?.peDir) || 0;

    return {
      type: 'MONTAGEM',
      title: 'Pares Formáveis (Montagem)',
      badge: 'Pés Órfãos',
      badgeColor: 'bg-pink-50 text-pink-700 border-pink-200',
      mainCount: formaveis,
      mainUnit: 'prs',
      icon: Footprints,
      iconBg: 'bg-pink-50 text-pink-600',
      borderClass: 'border-b-pink-500',
      primaryStat: { label: 'Casados', value: casados, color: 'text-fuchsia-700' },
      secondaryStat: { label: 'Formáveis', value: formaveis, color: 'text-emerald-700' },
      feet: { esq: peEsq, dir: peDir },
    };
  }

  if (selectedSector.value === 'PRE_FABRICADO') {
    const formaveis = Number(setoresData.value.preFabricado?.paresFormaveis) || 0;
    const peEsq = Number(setoresData.value.preFabricado?.peEsq) || 0;
    const peDir = Number(setoresData.value.preFabricado?.peDir) || 0;

    return {
      type: 'PRE_FABRICADO',
      title: 'Pares de Solas (Pré-Fabricado)',
      badge: 'Borracha & EVA',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      mainCount: formaveis,
      mainUnit: 'prs',
      icon: Package,
      iconBg: 'bg-amber-50 text-amber-600',
      borderClass: 'border-b-amber-500',
      primaryStat: { label: 'Pares Formáveis', value: formaveis, color: 'text-amber-700' },
      feet: { esq: peEsq, dir: peDir, labelEsq: 'Sola Esq', labelDir: 'Sola Dir' },
    };
  }

  if (selectedSector.value === 'DISTRIBUICAO' || selectedSector.value === 'EXPEDICAO') {
    const d = setoresData.value.distribuicao || setoresData.value.expedicao;
    const formaveis = Number(d?.paresFormaveis) || 0;
    const peEsq = Number(d?.peEsq) || 0;
    const peDir = Number(d?.peDir) || 0;

    return {
      type: 'DISTRIBUICAO',
      title: 'Pares de Componentes (Distribuição)',
      badge: 'Cabedais & Solas Processadas',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      mainCount: formaveis,
      mainUnit: 'prs',
      icon: Layers,
      iconBg: 'bg-indigo-50 text-indigo-600',
      borderClass: 'border-b-indigo-500',
      primaryStat: { label: 'Pares Formáveis', value: formaveis, color: 'text-indigo-700' },
      feet: { esq: peEsq, dir: peDir, labelEsq: 'Comp. Esq', labelDir: 'Comp. Dir' },
    };
  }

  if (selectedSector.value === 'CORTE') {
    const totalExitsVolume = Number(setoresData.value.corte?.totalExitsVolume) || 0;
    const totalExits = Number(setoresData.value.corte?.totalExits) || 0;

    return {
      type: 'CORTE',
      title: 'Sobras Reaproveitadas (Corte)',
      badge: 'Eliminação de Sobras',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      mainCount: totalExitsVolume,
      mainUnit: 'm² eliminados',
      icon: Scissors,
      iconBg: 'bg-emerald-50 text-emerald-600',
      borderClass: 'border-b-emerald-600',
      corteInfo: { totalExitsVolume, totalExits },
    };
  }

  // APOIO
  const totalExitsVolume = Number(setoresData.value.apoio?.totalExitsVolume) || 0;
  const totalExits = Number(setoresData.value.apoio?.totalExits) || 0;
  return {
    type: 'APOIO',
    title: 'Peças Reaproveitadas (Apoio)',
    badge: 'Eliminação de Sobras',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    mainCount: totalExitsVolume,
    mainUnit: 'un reaproveitadas',
    icon: Box,
    iconBg: 'bg-sky-50 text-sky-600',
    borderClass: 'border-b-sky-500',
    apoioInfo: { totalExitsVolume, totalExits },
  };
});

// 5. Unidades de Medida Disponíveis para o Top 5 Reativas ao Setor
const availableUnitsForTop = computed(() => {
  const currentSector = selectedSector.value || 'TODOS'
  const fromSector = unidadesPorSetor.value[currentSector]
  if (fromSector && fromSector.length > 0) return fromSector

  // Fallback para unidades do setor extraídas de topMateriaisPorSetorEUnidade
  const sectorData = topMateriaisPorSetorEUnidade.value[currentSector]
  if (sectorData) {
    const keys = Object.keys(sectorData)
    if (keys.length > 0) return keys
  }

  // Fallback para unidades globais
  if (unidadesDisponiveis.value && unidadesDisponiveis.value.length > 0) {
    if (currentSector === 'CORTE') {
      const corteUnits = unidadesDisponiveis.value.filter(u => u === 'M²' || u === 'M2' || u === 'KG' || u === 'M')
      return corteUnits.length > 0 ? corteUnits : ['M²']
    }
    if (currentSector !== 'TODOS') {
      const discreteUnits = unidadesDisponiveis.value.filter(u => u !== 'M²' && u !== 'M2')
      return discreteUnits.length > 0 ? discreteUnits : ['UND', 'PAR']
    }
    return unidadesDisponiveis.value
  }

  return currentSector === 'CORTE' ? ['M²'] : currentSector === 'TODOS' ? ['M²', 'KG', 'UND', 'PAR'] : ['UND', 'PAR']
})

// Sincroniza a unidade de medida do Top 5 automaticamente ao alternar de setor
watch(selectedSector, (newSec) => {
  const validUnits = availableUnitsForTop.value || []
  if (validUnits.length > 0) {
    if (!validUnits.includes(selectedTopUnit.value)) {
      selectedTopUnit.value = validUnits[0]
    }
  } else {
    selectedTopUnit.value = newSec === 'CORTE' || newSec === 'TODOS' ? 'M²' : 'UND'
  }
})

// 6. Top 5 Materiais Particionados por Setor e por Unidade (Window Functions)
const currentTopMateriais = computed(() => {
  const currentSector = selectedSector.value || 'TODOS'
  const unit = String(selectedTopUnit.value || '').toUpperCase().trim()

  // 1. Tenta buscar direto do mapa estruturado por setor e unidade
  const sectorMap = topMateriaisPorSetorEUnidade.value[currentSector]
  if (sectorMap) {
    // Correspondência exata
    if (sectorMap[unit] && sectorMap[unit].length > 0) {
      return sectorMap[unit].slice(0, 5)
    }
    // Correspondência case-insensitive
    for (const [uKey, items] of Object.entries(sectorMap)) {
      if (uKey.toUpperCase().trim() === unit && items?.length > 0) {
        return items.slice(0, 5)
      }
    }
  }

  // 2. Se for 'TODOS' ou fallback, busca no topMateriaisPorUnidade global
  if (currentSector === 'TODOS') {
    const globalUnitData = topMateriaisPorUnidade.value[unit]
    if (globalUnitData && globalUnitData.length > 0) {
      return globalUnitData.slice(0, 5)
    }
    for (const [uKey, items] of Object.entries(topMateriaisPorUnidade.value || {})) {
      if (uKey.toUpperCase().trim() === unit && items?.length > 0) {
        return items.slice(0, 5)
      }
    }
  }

  // 3. Fallback para topSobrasEntrada
  if (topSobrasEntrada.value && topSobrasEntrada.value.length > 0) {
    const filtered = topSobrasEntrada.value.filter(item => {
      const matchSector = currentSector === 'TODOS' || item.sector === currentSector || (currentSector === 'CORTE' && !item.sector)
      const itemUnit = String(item.unit || '').toUpperCase().trim()
      const matchUnit = itemUnit === unit || (unit === 'M²' && (itemUnit === 'M2' || item.sector === 'CORTE'))
      return matchSector && matchUnit
    })
    if (filtered.length > 0) return filtered.slice(0, 5)

    const sectorFiltered = topSobrasEntrada.value.filter(item => currentSector === 'TODOS' || item.sector === currentSector)
    if (sectorFiltered.length > 0) return sectorFiltered.slice(0, 5)
  }

  return []
})

// 7. Top 5 Entradas de Sobras Filtradas pelo Setor Selecionado (Compatibilidade)
const filteredTopSobras = computed(() => {
  if (currentTopMateriais.value && currentTopMateriais.value.length > 0) {
    return currentTopMateriais.value
  }
  if (selectedSector.value === 'TODOS') {
    return topSobrasEntrada.value.slice(0, 5)
  }
  const filtered = topSobrasEntrada.value.filter(item => item.sector === selectedSector.value)
  return filtered.length > 0 ? filtered.slice(0, 5) : []
})

// 8. Origem das Entradas Reativa ao Setor Selecionado
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
      totalParadosSemGiro:  statsData.totalParadosSemGiro || 0,
      totalParesFormaveis:  statsData.totalParesFormaveis || 0,
      totalParesCasados:    statsData.totalParesCasados || 0
    }

    // 2. Dados Setorizados
    setoresData.value = {
      corte:        setoresRaw.corte || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalExitsVolume: 0, totalParadosSemGiro: 0 },
      apoio:        setoresRaw.apoio || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalExitsVolume: 0, totalParadosSemGiro: 0 },
      preFabricado: setoresRaw.preFabricado || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0, paresFormaveis: 0 },
      expedicao:    setoresRaw.expedicao || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0, paresFormaveis: 0 },
      distribuicao: setoresRaw.distribuicao || setoresRaw.expedicao || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0, paresFormaveis: 0 },
      montagem:     setoresRaw.montagem || { itemsCount: 0, totalQuantity: 0, totalEntries: 0, totalExits: 0, totalParadosSemGiro: 0, peEsq: 0, peDir: 0, paresCasados: 0, paresFormaveis: 0 },
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

    // 6. Top Sobras Entrada & Top Materiais Particionados por Setor e Unidade
    topSobrasEntrada.value = topSobrasRaw || []
    topMateriaisPorUnidade.value = summary?.topMateriaisPorUnidade || {}
    topMateriaisPorSetorEUnidade.value = summary?.topMateriaisPorSetorEUnidade || {}
    unidadesDisponiveis.value = summary?.unidadesDisponiveis || []
    unidadesPorSetor.value = summary?.unidadesPorSetor || {}

    // Ajusta a unidade padrão reativa ao setor selecionado
    const validUnits = availableUnitsForTop.value || []
    if (validUnits.length > 0 && !validUnits.includes(selectedTopUnit.value)) {
      selectedTopUnit.value = validUnits[0]
    }

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
    <div class="min-h-screen bg-slate-100 p-3 sm:p-4 md:p-6 transition-colors duration-500">
      <div class="max-w-7xl mx-auto space-y-4 sm:space-y-5">

        <!-- CABEÇALHO DO PAINEL ANALÍTICO -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 gap-3 sm:gap-4">
          <div class="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div class="w-10 h-10 sm:w-11 sm:h-11 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
              <Activity class="w-5 h-5 animate-pulse" />
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-base sm:text-lg md:text-xl font-black text-slate-800 tracking-tight uppercase leading-snug">
                  Painel de Controle Multi-Setor
                </h1>
                <span class="bg-indigo-50 text-indigo-700 text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full font-bold border border-indigo-100 uppercase whitespace-nowrap inline-flex items-center shrink-0">
                  5 Setores Fabris
                </span>
              </div>
              <div class="flex items-center gap-2 mt-1">
                <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                <span class="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">
                  Rastreabilidade em Tempo Real
                </span>
                <RefreshCw v-if="isUpdating" class="w-3 h-3 text-indigo-600 animate-spin shrink-0 ml-1" />
              </div>
            </div>
          </div>

          <div class="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 flex items-center gap-3 shadow-inner w-full sm:w-auto self-stretch sm:self-auto justify-between sm:justify-end shrink-0">
            <div class="text-left sm:text-right">
              <div class="text-lg sm:text-xl font-black text-slate-700 leading-none tabular-nums">
                {{ currentTime.toLocaleTimeString('pt-BR') }}
              </div>
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                {{ currentTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) }}
              </div>
            </div>
            <Clock class="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 shrink-0" />
          </div>
        </div>

        <!-- SELETOR / FILTRO RÁPIDO POR SETOR -->
        <div class="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto scroll-smooth overscroll-x-contain">
          <div class="flex items-center gap-1.5 sm:gap-2 min-w-max">
            <button
              v-for="sec in sectorFilterOptions"
              :key="sec.id"
              @click="selectedSector = sec.id"
              class="px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
              :class="selectedSector === sec.id
                ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
            >
              <component :is="sec.icon" class="w-3.5 h-3.5 shrink-0" />
              <span>{{ sec.label }}</span>
            </button>
          </div>
        </div>

        <!-- CARDS PRINCIPAIS DE KPIS OPERACIONAIS (4 INDICADORES CENTRAIS) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">

          <!-- 1. Volume de Sobras (Dinâmico conforme setor filtrado) -->
          <div class="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 border-b-4 border-b-indigo-600 relative group overflow-hidden h-full flex flex-col justify-between">
            <div class="flex justify-between items-start gap-2">
              <div class="w-full min-w-0">
                <p class="text-slate-500 text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">
                  {{ currentFilteredVolume.label }}
                </p>

                <!-- Visão "Todos os Setores": Destaque no total de cadastros e desmembramento de grandezas -->
                <template v-if="currentFilteredVolume.isAllSectors">
                  <h3 class="text-2xl sm:text-3xl font-black text-slate-800 mt-1 tracking-tight leading-none">
                    {{ formatNumber(currentFilteredVolume.mainCount) }}
                    <span class="text-xs font-bold text-slate-400 ml-0.5">{{ currentFilteredVolume.mainUnit }}</span>
                  </h3>
                  <div class="flex items-center gap-1.5 flex-wrap mt-2.5 pt-2 border-t border-slate-100">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] sm:text-[11px] font-bold border border-emerald-100 whitespace-nowrap">
                      <Scissors class="w-3 h-3 text-emerald-600 shrink-0" />
                      Tecido/Couro: {{ formatNumber(currentFilteredVolume.corteVolume) }} m²
                    </span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 text-[10px] sm:text-[11px] font-bold border border-blue-100 whitespace-nowrap">
                      <Package class="w-3 h-3 text-blue-600 shrink-0" />
                      Peças/Calçados: {{ formatNumber(currentFilteredVolume.componentesVolume) }} un
                    </span>
                  </div>
                </template>

                <!-- Visão Setorial: Saldo numérico na unidade estrita do setor ativo -->
                <template v-else>
                  <h3 class="text-2xl sm:text-3xl font-black text-slate-800 mt-1 tracking-tight leading-none">
                    {{ formatNumber(currentFilteredVolume.mainCount) }}
                    <span class="text-xs font-bold text-slate-400 ml-0.5">{{ currentFilteredVolume.mainUnit }}</span>
                  </h3>
                  <p class="text-[11px] sm:text-xs text-indigo-600 font-bold mt-2 pt-1 border-t border-slate-100">
                    {{ formatNumber(currentFilteredVolume.itemsCount) }} cadastros ativos no setor
                  </p>
                </template>
              </div>

              <div class="bg-indigo-50 p-2 sm:p-2.5 rounded-xl text-indigo-600 shadow-inner shrink-0 ml-1">
                <Box class="w-5 h-5" />
              </div>
            </div>
          </div>

          <!-- 2. Taxa de Reaproveitamento Fabril (%) Adaptável -->
          <div class="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 border-b-4 border-b-emerald-500 relative group overflow-hidden h-full flex flex-col justify-between">
            <div class="flex justify-between items-start gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1">
                  <p class="text-slate-500 text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">
                    {{ currentFilteredEfficiency.label }}
                  </p>
                  <Sparkles class="w-3 h-3 text-emerald-500 shrink-0" />
                </div>
                <h3 class="text-2xl sm:text-3xl font-black text-emerald-600 mt-1 tracking-tight leading-none">
                  {{ currentFilteredEfficiency.taxa }}%
                </h3>
                <div class="flex items-center gap-1 mt-1.5 text-[11px] sm:text-xs font-bold text-emerald-700">
                  <ArrowUpRight class="w-3.5 h-3.5 shrink-0" />
                  <span class="truncate">{{ formatNumber(currentFilteredEfficiency.exits) }} saídas realizadas</span>
                </div>
              </div>
              <div class="bg-emerald-50 p-2 sm:p-2.5 rounded-xl text-emerald-600 shadow-inner shrink-0 ml-1">
                <CheckCircle2 class="w-5 h-5" />
              </div>
            </div>
            <div class="w-full bg-slate-100 h-1.5 mt-3 rounded-full overflow-hidden">
              <div class="bg-emerald-500 h-full transition-all duration-700" :style="{ width: `${Math.min(100, currentFilteredEfficiency.taxa)}%` }"></div>
            </div>
          </div>

          <!-- 3. Itens Parados Sem Giro (>30 Dias) Adaptável -->
          <div class="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 border-b-4 border-b-amber-500 relative group overflow-hidden h-full flex flex-col justify-between">
            <div class="flex justify-between items-start gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1">
                  <p class="text-slate-500 text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">Parados Sem Giro (>30d)</p>
                  <AlertTriangle class="w-3 h-3 text-amber-500 shrink-0" />
                </div>
                <h3 class="text-2xl sm:text-3xl font-black text-amber-600 mt-1 tracking-tight leading-none">
                  {{ formatNumber(currentFilteredStagnant) }}
                </h3>
                <p class="text-[10px] sm:text-[11px] text-amber-700 font-bold mt-1.5 bg-amber-50 inline-block px-1.5 py-0.5 rounded">
                  Atenção Operacional
                </p>
              </div>
              <div class="bg-amber-50 p-2 sm:p-2.5 rounded-xl text-amber-600 shadow-inner shrink-0 ml-1">
                <Clock class="w-5 h-5" />
              </div>
            </div>
          </div>

          <!-- 4. Casamento de Pares & Montagem / Detalhes de Giro (Dinâmico por Setor) -->
          <div
            :class="currentFilteredPairsCard.borderClass"
            class="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 border-b-4 relative group overflow-hidden h-full flex flex-col justify-between"
          >
            <div class="flex justify-between items-start gap-2">
              <div class="w-full min-w-0">
                <div class="flex items-center justify-between gap-1 mb-1">
                  <p class="text-slate-500 text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">
                    {{ currentFilteredPairsCard.title }}
                  </p>
                  <span
                    class="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 whitespace-nowrap"
                    :class="currentFilteredPairsCard.badgeColor"
                  >
                    {{ currentFilteredPairsCard.badge }}
                  </span>
                </div>

                <!-- Caso 1: Visão Geral TODOS (Soma de Pares Formáveis Fabris com Breakdown) -->
                <template v-if="currentFilteredPairsCard.type === 'PARES_GLOBAL'">
                  <h3 class="text-2xl sm:text-3xl font-black text-fuchsia-700 tracking-tight leading-none mt-1">
                    {{ formatNumber(currentFilteredPairsCard.mainCount) }}
                    <span class="text-xs font-bold text-slate-400 ml-0.5">pares formáveis</span>
                  </h3>
                  <div class="flex items-center gap-2 flex-wrap mt-2.5 pt-2 border-t border-slate-100 text-[10px] sm:text-[11px] font-bold">
                    <span
                      v-for="b in currentFilteredPairsCard.breakdown"
                      :key="b.label"
                      class="inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span class="text-slate-500">{{ b.label }}:</span>
                      <strong :class="b.color">{{ formatNumber(b.value) }}</strong>
                    </span>
                  </div>
                </template>

                <!-- Caso 2: Montagem (Casados + Formáveis + Pés E/D) -->
                <template v-else-if="currentFilteredPairsCard.type === 'MONTAGEM'">
                  <div class="flex items-baseline gap-3 mt-1">
                    <div>
                      <span class="text-[10px] font-bold text-fuchsia-600 block uppercase">Casados</span>
                      <h3 class="text-xl sm:text-2xl font-black text-fuchsia-700 tracking-tight leading-none">
                        {{ formatNumber(currentFilteredPairsCard.primaryStat.value) }} <span class="text-[10px] sm:text-[11px] font-medium text-slate-400">prs</span>
                      </h3>
                    </div>
                    <div class="border-l border-slate-200 pl-3">
                      <span class="text-[10px] font-bold text-emerald-600 block uppercase">Formáveis</span>
                      <h3 class="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight leading-none">
                        {{ formatNumber(currentFilteredPairsCard.secondaryStat.value) }} <span class="text-[10px] sm:text-[11px] font-medium text-slate-400">prs</span>
                      </h3>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 mt-2 pt-1 border-t border-slate-100 text-[10px] sm:text-[11px] font-bold text-slate-500 flex-wrap">
                    <span class="text-indigo-600">Pé Esq: {{ formatNumber(currentFilteredPairsCard.feet.esq) }}</span>
                    <span>·</span>
                    <span class="text-purple-600">Pé Dir: {{ formatNumber(currentFilteredPairsCard.feet.dir) }}</span>
                  </div>
                </template>

                <!-- Caso 3: Pré-Fabricado / Distribuição (Pares Formáveis + Pés E/D) -->
                <template v-else-if="currentFilteredPairsCard.type === 'PRE_FABRICADO' || currentFilteredPairsCard.type === 'DISTRIBUICAO'">
                  <h3 class="text-2xl sm:text-3xl font-black tracking-tight leading-none mt-1" :class="currentFilteredPairsCard.type === 'PRE_FABRICADO' ? 'text-amber-700' : 'text-indigo-700'">
                    {{ formatNumber(currentFilteredPairsCard.mainCount) }}
                    <span class="text-xs font-bold text-slate-400 ml-0.5">pares formáveis</span>
                  </h3>
                  <div class="flex items-center gap-2 mt-2 pt-1 border-t border-slate-100 text-[10px] sm:text-[11px] font-bold text-slate-500 flex-wrap">
                    <span class="text-indigo-600">{{ currentFilteredPairsCard.feet.labelEsq || 'Esq' }}: {{ formatNumber(currentFilteredPairsCard.feet.esq) }}</span>
                    <span>·</span>
                    <span class="text-purple-600">{{ currentFilteredPairsCard.feet.labelDir || 'Dir' }}: {{ formatNumber(currentFilteredPairsCard.feet.dir) }}</span>
                  </div>
                </template>

                <!-- Caso 4: Corte (Sobras Reaproveitadas na Produção) -->
                <template v-else-if="currentFilteredPairsCard.type === 'CORTE'">
                  <h3 class="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight leading-none mt-1">
                    {{ formatNumber(currentFilteredPairsCard.mainCount) }}
                    <span class="text-xs font-bold text-slate-400 ml-0.5">{{ currentFilteredPairsCard.mainUnit }}</span>
                  </h3>
                  <div class="flex items-center gap-1.5 mt-2 pt-1 border-t border-slate-100 text-[11px] sm:text-xs font-bold text-emerald-700">
                    <TrendingUp class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span class="truncate">{{ formatNumber(currentFilteredPairsCard.corteInfo.totalExits) }} saídas para a produção</span>
                  </div>
                </template>

                <!-- Caso 5: Apoio (Peças Reaproveitadas na Produção) -->
                <template v-else-if="currentFilteredPairsCard.type === 'APOIO'">
                  <h3 class="text-2xl sm:text-3xl font-black text-sky-700 tracking-tight leading-none mt-1">
                    {{ formatNumber(currentFilteredPairsCard.mainCount) }}
                    <span class="text-xs font-bold text-slate-400 ml-0.5">{{ currentFilteredPairsCard.mainUnit }}</span>
                  </h3>
                  <div class="flex items-center gap-1.5 mt-2 pt-1 border-t border-slate-100 text-[11px] sm:text-xs font-bold text-sky-700">
                    <TrendingUp class="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span class="truncate">{{ formatNumber(currentFilteredPairsCard.apoioInfo.totalExits) }} baixas para a produção</span>
                  </div>
                </template>
              </div>

              <div
                class="p-2 sm:p-2.5 rounded-xl shadow-inner shrink-0 ml-1"
                :class="currentFilteredPairsCard.iconBg"
              >
                <component :is="currentFilteredPairsCard.icon" class="w-5 h-5" />
              </div>
            </div>
          </div>

        </div>

        <!-- GRÁFICOS ANALÍTICOS & TOP SOBRAS (3 COLUNAS ENXUTAS) -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-stretch">

          <!-- 1. Distribuição de Volume por Setor -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 flex flex-col items-center justify-between relative overflow-hidden h-full">
            <h3 class="font-bold text-slate-800 w-full text-left mb-3 flex items-center gap-2 text-xs uppercase tracking-wider">
              <PieChart class="w-4 h-4 text-indigo-500" /> Distribuição de Volume
            </h3>

            <div class="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto rounded-full shadow-sm my-2 border-4 border-slate-50 transition-transform hover:scale-105 shrink-0"
              :style="sectorChartStyle">
              <div class="absolute inset-0 m-auto w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-full flex flex-col items-center justify-center shadow-inner overflow-hidden">
                <div v-if="hoveredSector" class="flex flex-col items-center justify-center w-full h-full text-center px-0.5">
                  <span class="text-xs sm:text-sm font-black leading-none" :style="{ color: hoveredSector.color }">
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

            <div class="w-full space-y-1 mt-3 text-xs flex-1 flex flex-col justify-end">
              <div
                v-for="sec in volumePorSetor"
                :key="sec.sector"
                @mouseenter="hoveredSector = sec"
                @mouseleave="hoveredSector = null"
                class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span class="w-2 h-2 rounded-sm shrink-0" :style="{ backgroundColor: sec.color }"></span>
                  <span class="font-bold text-slate-700 uppercase text-[10px] truncate">{{ sec.label }}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 ml-2">
                  <span class="text-slate-400 text-[9px] font-bold bg-slate-200 px-1 py-0.5 rounded">{{ sec.percent.toFixed(1) }}%</span>
                  <span class="font-bold text-slate-800 text-[11px]">{{ formatNumber(sec.quantity) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Origem das Entradas de Sobra Reativa ao Setor -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 flex flex-col items-center justify-between relative overflow-hidden h-full">
            <h3 class="font-bold text-slate-800 w-full text-left mb-3 flex items-center gap-2 text-xs uppercase tracking-wider">
              <MapPin class="w-4 h-4 text-violet-500" /> Origem das Entradas
            </h3>

            <div class="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto rounded-full shadow-sm my-2 border-4 border-slate-50 transition-transform hover:scale-105 shrink-0"
              :style="origemChartStyle">
              <div class="absolute inset-0 m-auto w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-full flex flex-col items-center justify-center shadow-inner overflow-hidden">
                <div v-if="hoveredOrigem" class="flex flex-col items-center justify-center w-full h-full text-center px-0.5">
                  <span class="text-xs sm:text-sm font-black leading-none" :style="{ color: hoveredOrigem.color }">
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

            <div class="w-full space-y-1 mt-3 text-xs flex-1 flex flex-col justify-end">
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
                <div class="flex items-center gap-2 min-w-0">
                  <span class="w-2 h-2 rounded-sm shrink-0" :style="{ backgroundColor: slice.color }"></span>
                  <span class="font-bold text-slate-700 uppercase text-[10px] truncate">{{ slice.label }}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 ml-2">
                  <span class="text-slate-400 text-[9px] font-bold bg-slate-200 px-1 py-0.5 rounded">{{ slice.percent.toFixed(1) }}%</span>
                  <span class="font-bold text-slate-800 text-[11px]">{{ formatNumber(slice.value) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. TOP 5 MATERIAIS COM MAIS SOBRAS (CAUSA RAIZ / ACÚMULO) -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden h-full md:col-span-2 lg:col-span-1">
            <div class="w-full flex justify-between items-center mb-3">
              <h3 class="font-bold text-slate-800 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <AlertOctagon class="w-4 h-4 text-red-500" /> Top 5 com Mais Sobras
              </h3>
              <span class="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 uppercase tracking-widest">
                ACÚMULO
              </span>
            </div>

            <!-- Seletor de Unidade de Medida Segregada -->
            <div v-if="availableUnitsForTop.length > 1" class="flex flex-wrap gap-1.5 mb-3">
              <button
                v-for="u in availableUnitsForTop"
                :key="u"
                @click="selectedTopUnit = u"
                class="px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border"
                :class="selectedTopUnit === u 
                  ? 'bg-red-500 text-white border-red-500 shadow-sm' 
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'"
              >
                {{ u }}
              </button>
            </div>

            <div class="w-full flex-1 flex flex-col justify-between">
              <div class="space-y-1.5">
                <div
                  v-for="(item, index) in currentTopMateriais"
                  :key="item.id || index"
                  class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors text-xs"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="w-5 h-5 rounded-md flex items-center justify-center font-black text-[10px] shrink-0"
                      :class="index === 0 ? 'bg-red-100 text-red-700' : index === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'"
                    >
                      {{ item.position || (index + 1) }}
                    </span>
                    <div class="min-w-0">
                      <p class="font-bold text-slate-800 truncate text-[11px]">{{ item.name }}</p>
                      <p class="text-[9px] text-slate-400 font-mono">Cód: {{ item.code }}{{ item.type ? ` · ${item.type}` : (item.sector ? ` · ${item.sector}` : '') }}</p>
                    </div>
                  </div>
                  <div class="text-right shrink-0 ml-2">
                    <span class="font-black text-red-700 text-xs">{{ formatNumber(item.quantity ?? item.totalQuantity) }}</span>
                    <span class="text-[9px] text-slate-400 ml-0.5 uppercase">{{ item.unit || selectedTopUnit }}</span>
                  </div>
                </div>

                <div v-if="currentTopMateriais.length === 0" class="p-6 text-center text-slate-400 text-xs italic">
                  Nenhum material registrado para a unidade {{ selectedTopUnit }}.
                </div>
              </div>

              <div class="w-full text-center border-t border-slate-100 pt-2.5 mt-3">
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Estoque Acumulado por Unidade
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  </Layout>
</template>