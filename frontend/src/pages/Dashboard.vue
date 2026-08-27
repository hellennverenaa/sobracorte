<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import Layout from '@/components/Layout.vue'

import { useApi } from "../composables/useApi"
import {
  TrendingUp, TrendingDown, Package, AlertOctagon,
  PieChart, Wallet, Box, RefreshCw, Activity, Clock, Trophy, MapPin, HelpCircle
} from 'lucide-vue-next'

const { fetchDashboardSummary } = useApi()

// --- ESTADOS ---
const realStats    = ref({ totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 })
const displayStats = ref({ totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 })

// Gráficos: alimentados em 1 única requisição consolidada (GET /dashboard/summary)
const pieChartData    = ref([])
const origemChartData = ref([])
const topMaterials    = ref([])

const isLoading       = ref(true)
const hoveredCategory = ref(null)
const hoveredOrigem   = ref(null)
const isUpdating      = ref(false)
const currentTime     = ref(new Date())
let refreshInterval   = null
let clockInterval     = null

// --- ANIMAÇÃO DE NÚMEROS ---
function animateValue(key, start, end, duration = 1000) {
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

watch(() => realStats.value.totalMaterials, (n, o) => animateValue('totalMaterials', o || 0, n))
watch(() => realStats.value.lowStock,       (n, o) => animateValue('lowStock',       o || 0, n))
watch(() => realStats.value.totalMovements, (n, o) => animateValue('totalMovements', o || 0, n))
watch(() => realStats.value.totalEntries,   (n, o) => animateValue('totalEntries',   o || 0, n))

// --- LÓGICA DE NEGÓCIO ---

function formatNumber(value) {
  if (!value && value !== 0) return '0'
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

// Barra de Progresso e Giro (lê de displayStats — custo zero)
const totalExitsDisplay = computed(() => {
  const mov = Number(displayStats.value.totalMovements) || 0
  const ent = Number(displayStats.value.totalEntries)   || 0
  return Math.max(0, mov - ent)
})

const efficiencyRateDisplay = computed(() => {
  const mov = Number(displayStats.value.totalMovements) || 0
  if (mov === 0) return 0
  return Math.round((totalExitsDisplay.value / mov) * 100)
})

// --- PALETA DE CORES (idêntica à lógica original) ---

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

// maxMaterialValue — leitura barata; banco já devolve ordenado
const maxMaterialValue = computed(() => {
  if (topMaterials.value.length === 0) return 1
  return Number(topMaterials.value[0].quantity) || 1
})

// Estilos conic-gradient — apenas leituras de refs simples (custo zero)
const pieChartStyle = computed(() => {
  if (pieChartData.value.length === 0) return { background: '#e2e8f0' }
  let gradientStr = ''
  let currentDeg  = 0
  pieChartData.value.forEach((slice, index) => {
    const degrees = (slice.percent / 100) * 360
    gradientStr += `${slice.color} ${currentDeg}deg ${currentDeg + degrees}deg`
    if (index < pieChartData.value.length - 1) gradientStr += ', '
    currentDeg += degrees
  })
  return { background: `conic-gradient(${gradientStr})` }
})

const origemChartStyle = computed(() => {
  if (origemChartData.value.length === 0) return { background: '#e2e8f0' }
  let gradientStr = ''
  let currentDeg  = 0
  origemChartData.value.forEach((slice, index) => {
    const degrees = (slice.percent / 100) * 360
    gradientStr += `${slice.color} ${currentDeg}deg ${currentDeg + degrees}deg`
    if (index < origemChartData.value.length - 1) gradientStr += ', '
    currentDeg += degrees
  })
  return { background: `conic-gradient(${gradientStr})` }
})

let isFetchingData = false

// --- CARREGAMENTO CONSOLIDADO SINGLE ROUND-TRIP (GET /dashboard/summary) ---
async function loadData() {
  if (isFetchingData) return
  isFetchingData = true
  isUpdating.value = true

  try {
    const summary = await fetchDashboardSummary()
    const statsData = summary?.stats || { totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 }
    const distribuicaoRaw = summary?.distribuicao || []
    const origemRaw = summary?.origemSobras || []
    const topRaw = summary?.topMateriais || []

    // 1. Cards de KPI
    realStats.value = {
      totalMaterials: statsData.totalMaterials || 0,
      lowStock:       statsData.lowStock       || 0,
      totalMovements: statsData.totalMovements || 0,
      totalEntries:   statsData.totalEntries   || 0
    }

    // 2. Gráfico de Distribuição por Categoria
    const totalDist = distribuicaoRaw.reduce((acc, item) => acc + (Number(item._sum?.quantity) || 0), 0)
    pieChartData.value = distribuicaoRaw
      .map(item => {
        const label = String(item.type || 'outros')
        const value = Number(item._sum?.quantity) || 0
        return {
          label:   label.charAt(0).toUpperCase() + label.slice(1),
          value,
          percent: totalDist > 0 ? (value / totalDist) * 100 : 0,
          color:   getColorForCategory(label)
        }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    // 3. Gráfico de Origem das Sobras
    const totalOrigem = origemRaw.reduce((acc, item) => acc + (Number(item._sum?.quantity) || 0), 0)
    origemChartData.value = origemRaw
      .map((item, i) => {
        const value = Number(item._sum?.quantity) || 0
        return {
          label:   item.origem || 'Outros',
          value,
          percent: totalOrigem > 0 ? (value / totalOrigem) * 100 : 0,
          color:   origemColors[i % origemColors.length]
        }
      })
      .slice(0, 5)

    // 4. Top 5 Materiais
    topMaterials.value = topRaw.map(m => ({
      ...m,
      codigo:     m.code,
      descricao:  m.name,
      quantidade: m.quantity,
      unidade:    m.unit
    }))

  } catch (error) {
    console.error('Erro inesperado no dashboard:', error)
  } finally {
    isLoading.value = false
    isFetchingData = false
    setTimeout(() => isUpdating.value = false, 800)
  }
}

onMounted(() => {
  loadData()
  clockInterval   = setInterval(() => { currentTime.value = new Date() }, 1000)
  refreshInterval = setInterval(loadData, 60000)
})

onUnmounted(() => {
  clearInterval(refreshInterval)
  clearInterval(clockInterval)
})
</script>

<template>
  <Layout>
    <div class="min-h-screen bg-slate-200 p-6 md:p-8 transition-colors duration-500">
      <div class="max-w-7xl mx-auto">

        <div
          class="flex flex-col md:flex-row justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-lg border border-slate-300 animate-fade-in-down">
          <div class="flex items-center gap-4 w-full md:w-auto">
            <div class="bg-blue-100 p-3 rounded-xl text-blue-700">
              <Activity class="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h1 class="text-2xl font-black text-slate-800 tracking-tight uppercase">
                Painel de Controle
              </h1>
              <div class="flex items-center gap-2 mt-1">
                <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Sistema Online</span>
                <RefreshCw v-if="isUpdating" class="w-3 h-3 text-slate-400 animate-spin ml-2" />
              </div>
            </div>
          </div>

          <div
            class="mt-4 md:mt-0 bg-slate-50 px-6 py-3 rounded-xl border border-slate-200 flex items-center gap-4 shadow-inner w-full md:w-auto justify-between md:justify-end">
            <div class="text-right">
              <div class="text-3xl font-black text-slate-700 leading-none tabular-nums">
                {{ currentTime.toLocaleTimeString('pt-BR') }}
              </div>
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {{ currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) }}
              </div>
            </div>
            <Clock class="w-8 h-8 text-slate-300" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 stagger-animation">

          <div
            class="card-hover bg-white rounded-2xl p-6 shadow-xl border-b-4 border-emerald-600 relative overflow-visible group">

            <div
              class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Total de materiais reutilizados ou vendidos. Indica economia gerada.
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
            </div>

            <div class="flex justify-between items-start z-10 relative">
              <div>
                <div class="flex items-center gap-1">
                  <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Saídas (Uso/Venda)</p>
                  <HelpCircle class="w-3 h-3 text-slate-300 cursor-help" />
                </div>
                <h3 class="text-4xl font-black text-emerald-700 mt-2 tracking-tight">{{ formatNumber(totalExitsDisplay)
                  }}</h3>
                <p class="text-[10px] text-emerald-600 font-bold mt-1 bg-emerald-50 inline-block px-2 py-0.5 rounded">
                  Meta: Aumentar 🚀</p>
              </div>
              <div class="bg-emerald-50 p-3 rounded-xl text-emerald-600 shadow-inner">
                <Wallet class="w-7 h-7" />
              </div>
            </div>
          </div>

          <div
            class="card-hover bg-white rounded-2xl p-6 shadow-xl border-b-4 border-red-500 relative overflow-visible group">

            <div
              class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Total de novas sobras geradas que entraram no estoque. Gera custo.
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
            </div>

            <div class="flex justify-between items-start z-10 relative">
              <div>
                <div class="flex items-center gap-1">
                  <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Entradas (Acúmulo)</p>
                  <HelpCircle class="w-3 h-3 text-slate-300 cursor-help" />
                </div>
                <h3 class="text-4xl font-black text-red-700 mt-2 tracking-tight">{{
                  formatNumber(displayStats.totalEntries) }}</h3>
                <p class="text-[10px] text-red-600 font-bold mt-1 bg-red-50 inline-block px-2 py-0.5 rounded">Meta:
                  Reduzir 📉</p>
              </div>
              <div class="bg-red-50 p-3 rounded-xl text-red-600 shadow-inner">
                <Package class="w-7 h-7" />
              </div>
            </div>
          </div>

          <div
            class="card-hover bg-slate-800 rounded-2xl p-6 shadow-2xl text-white border border-slate-600 relative overflow-visible group">

            <div
              class="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-slate-800 text-xs p-3 rounded-lg shadow-xl w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Quantidade de códigos/tipos de materiais diferentes cadastrados.
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45"></div>
            </div>

            <div class="flex justify-between items-start z-10 relative">
              <div>
                <div class="flex items-center gap-1">
                  <p class="text-slate-400 text-[10px] font-black uppercase tracking-widest">Tipos em Estoque</p>
                  <HelpCircle class="w-3 h-3 text-slate-600 cursor-help" />
                </div>
                <h3
                  class="text-4xl font-black mt-2 tracking-tight group-hover:scale-110 transition-transform origin-left">
                  {{ formatNumber(displayStats.totalMaterials) }}</h3>
                <p class="text-[10px] text-slate-400 font-bold mt-1">Cadastros Ativos</p>
              </div>
              <div class="bg-slate-700 p-3 rounded-xl shadow-inner">
                <Box class="w-7 h-7 text-white" />
              </div>
            </div>
            <div class="w-full bg-slate-900 h-2 mt-4 rounded-full overflow-hidden border border-slate-600">
              <div class="bg-blue-500 h-full transition-all duration-1000 ease-out"
                :style="{ width: `${100 - efficiencyRateDisplay}%` }"></div>
            </div>
          </div>

          <div
            class="card-hover bg-white rounded-2xl p-6 shadow-xl border-b-4 border-blue-500 relative overflow-visible group">

            <div
              class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Mede a eficiência: % do material que SAI em relação ao que ENTRA.
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
            </div>

            <div>
              <div class="flex items-center gap-1">
                <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Giro de Estoque</p>
                <HelpCircle class="w-3 h-3 text-slate-300 cursor-help" />
              </div>
              <div class="flex items-center gap-2 mt-2">
                <h3 class="text-5xl font-black tracking-tighter"
                  :class="efficiencyRateDisplay > 50 ? 'text-blue-700' : 'text-orange-600'">{{ efficiencyRateDisplay }}%
                </h3>
              </div>
              <p class="text-[10px] text-slate-400 font-bold mt-1">Ideal: Acima de 50%</p>
            </div>
            <div class="absolute -right-4 -bottom-4 opacity-10 rotate-12">
              <Activity class="w-32 h-32 text-slate-800" />
            </div>
          </div>
        </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up" style="animation-delay: 0.2s">

          <div class="bg-white rounded-2xl shadow-xl border border-slate-300 p-6 flex flex-col items-center relative overflow-hidden h-[450px]">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
            <h3 class="font-bold text-slate-800 w-full text-left mb-6 flex items-center gap-2">
              <PieChart class="w-5 h-5 text-slate-400" /> Distribuição
            </h3>
            
            <div class="relative w-48 h-48 mx-auto rounded-full shadow-lg mb-6 border-4 border-slate-50 transition-transform duration-700 hover:scale-105"
              :style="pieChartStyle">
              <div class="absolute inset-0 m-auto w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center shadow-inner overflow-hidden transition-all duration-300">
                <div v-if="hoveredCategory" class="flex flex-col items-center justify-center w-full h-full animate-fade-in">
                  <span class="text-2xl font-black leading-none" :style="{ color: hoveredCategory.color }">
                    {{ hoveredCategory.percent.toFixed(1) }}%
                  </span>
                  <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                    {{ hoveredCategory.label }}
                  </span>
                </div>
                <div v-else class="flex flex-col items-center justify-center w-full h-full animate-fade-in">
                  <span class="text-3xl font-black text-slate-800">{{ pieChartData.length }}</span>
                  <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Categorias</span>
                </div>
              </div>
            </div>

            <div class="w-full space-y-2 overflow-y-auto pr-1 max-h-[140px] mt-auto">
              <div v-for="slice in pieChartData" :key="slice.label"
                @mouseenter="hoveredCategory = slice" @mouseleave="hoveredCategory = null"
                class="group flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 transition-all hover:bg-slate-100 hover:shadow-md cursor-pointer">
                <div class="flex items-center gap-3">
                  <span class="w-3 h-3 rounded-sm shadow-sm transition-transform group-hover:scale-125" :style="{ backgroundColor: slice.color }"></span>
                  <span class="text-slate-700 font-bold uppercase group-hover:text-blue-600 transition-colors">{{ slice.label }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-slate-400 text-[10px] hidden group-hover:inline-block animate-fade-in bg-slate-200 px-1.5 py-0.5 rounded font-bold">{{ slice.percent.toFixed(1) }}%</span>
                  <span class="font-bold text-slate-900">{{ formatNumber(slice.value) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-xl border border-slate-300 p-6 flex flex-col items-center relative overflow-hidden h-[450px]">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 to-fuchsia-500"></div>
            <h3 class="font-bold text-slate-800 w-full text-left mb-6 flex items-center gap-2">
              <MapPin class="w-5 h-5 text-slate-400" /> Origem das Entradas
            </h3>
            
            <div class="relative w-48 h-48 mx-auto rounded-full shadow-lg mb-6 border-4 border-slate-50 transition-transform duration-700 hover:scale-105"
              :style="origemChartStyle">
              <div class="absolute inset-0 m-auto w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center shadow-inner overflow-hidden transition-all duration-300">
                <div v-if="hoveredOrigem" class="flex flex-col items-center justify-center w-full h-full animate-fade-in">
                  <span class="text-2xl font-black leading-none" :style="{ color: hoveredOrigem.color }">
                    {{ hoveredOrigem.percent.toFixed(1) }}%
                  </span>
                  <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1 text-center leading-tight">
                    {{ hoveredOrigem.label }}
                  </span>
                </div>
                <div v-else class="flex flex-col items-center justify-center w-full h-full animate-fade-in">
                  <span class="text-3xl font-black text-slate-800">{{ origemChartData.length }}</span>
                  <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Fontes</span>
                </div>
              </div>
            </div>

            <div class="w-full space-y-2 mt-auto">
              <div v-if="origemChartData.length === 0" class="flex flex-col items-center justify-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 w-full h-[120px]">
                <span class="text-xs font-bold">Nenhum dado registrado</span>
                <span class="text-[10px] mt-1 text-center px-4">Cadastre registros de entrada com origem para popular este gráfico.</span>
              </div>
              
              <div v-else v-for="slice in origemChartData" :key="slice.label"
                @mouseenter="hoveredOrigem = slice" @mouseleave="hoveredOrigem = null"
                class="group flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 transition-all hover:bg-slate-100 hover:shadow-md cursor-pointer">
                <div class="flex items-center gap-3">
                  <span class="w-3 h-3 rounded-sm shadow-sm transition-transform group-hover:scale-125" :style="{ backgroundColor: slice.color }"></span>
                  <span class="text-slate-700 font-bold uppercase group-hover:text-blue-600 transition-colors">{{ slice.label }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-slate-400 text-[10px] hidden group-hover:inline-block animate-fade-in bg-slate-200 px-1.5 py-0.5 rounded font-bold">{{ slice.percent.toFixed(1) }}%</span>
                  <span class="font-bold text-slate-900">{{ formatNumber(slice.value) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-xl border border-slate-300 p-6 flex flex-col relative overflow-hidden h-[450px]">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 to-orange-500"></div>
            
            <div class="w-full flex justify-between items-center mb-6">
              <h3 class="font-bold text-slate-800 flex items-center gap-2">
                <Trophy class="w-5 h-5 text-yellow-500" /> Maiores Acúmulos
              </h3>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                <span class="text-[10px] font-bold text-slate-400 uppercase">Top 5</span>
              </div>
            </div>

            <div class="w-full flex-1 flex flex-col justify-between">
              <table class="w-full text-left border-collapse">
                <tbody class="divide-y divide-slate-100">
                  <tr v-for="(item, index) in topMaterials" :key="item.id"
                    class="hover:bg-slate-50 transition-colors duration-200 group">
                    <td class="py-3.5 pr-3 w-10">
                      <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-sm"
                        :class="index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-slate-200 text-slate-600' : index === 2 ? 'bg-amber-100/50 text-amber-700' : 'bg-slate-50 text-slate-400'">
                        {{ index + 1 }}
                      </div>
                    </td>
                    <td class="p-3">
                      <div class="font-bold text-slate-800 text-sm truncate max-w-[150px] group-hover:text-blue-600 transition-colors"
                        :title="item.descricao || item.name">{{ item.descricao || item.name }}</div>
                      <div class="text-[10px] text-slate-400 font-mono mt-1">Cód: {{ item.codigo || item.code }}</div>
                    </td>
                    <td class="p-3 text-right">
                      <div class="text-base font-black text-slate-800 tracking-tight">{{ formatNumber(item.quantidade || item.quantity) }}</div>
                      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{{ item.unidade || item.unit }}</div>
                    </td>
                  </tr>
                  <tr v-if="topMaterials.length === 0">
                    <td colspan="3" class="p-10 text-center text-slate-400 text-sm font-medium italic">Nenhum material no estoque.</td>
                  </tr>
                </tbody>
              </table>
              
              <div class="w-full text-center border-t border-slate-100 pt-4 mt-auto">
                <span class="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Sincronizado com o Banco de Dados</span>
              </div>
            </div>
          </div>

        </div>


      </div>
    </div>
  </Layout>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-out forwards;
}

.animate-fade-in-down {
  animation: fadeInDown 0.8s ease-out forwards;
}

.animate-fade-in-up {
  opacity: 0;
  animation: fadeInUp 0.8s ease-out 0.3s forwards;
}

.card-hover {
  transition: all 0.3s ease;
}

.card-hover:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stagger-animation>div {
  opacity: 0;
  animation: fadeInUp 0.6s ease-out forwards;
}

.stagger-animation>div:nth-child(1) {
  animation-delay: 0.1s;
}

.stagger-animation>div:nth-child(2) {
  animation-delay: 0.2s;
}

.stagger-animation>div:nth-child(3) {
  animation-delay: 0.3s;
}

.stagger-animation>div:nth-child(4) {
  animation-delay: 0.4s;
}
</style>