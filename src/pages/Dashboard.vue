<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from '@/composables/useApi'
import { 
  TrendingUp, TrendingDown, Package, AlertOctagon, 
  PieChart, Wallet, Box, RefreshCw, Activity, Clock, Trophy, MapPin, HelpCircle
} from 'lucide-vue-next'

const { fetchStats, fetchMaterials, request } = useApi()

// --- ESTADOS ---
const realStats = ref({ totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 })
const displayStats = ref({ totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 })

const materials = ref([]) 
const isLoading = ref(true)
const isUpdating = ref(false)
const currentTime = ref(new Date()) 
let refreshInterval = null
let clockInterval = null

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

watch(() => realStats.value.totalMaterials, (n, o) => animateValue('totalMaterials', o||0, n))
watch(() => realStats.value.lowStock, (n, o) => animateValue('lowStock', o||0, n))
watch(() => realStats.value.totalMovements, (n, o) => animateValue('totalMovements', o||0, n))
watch(() => realStats.value.totalEntries, (n, o) => animateValue('totalEntries', o||0, n))

// --- LÓGICA DE NEGÓCIO ---

function formatNumber(value) {
  if (!value && value !== 0) return '0'
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

const totalExitsDisplay = computed(() => displayStats.value.totalMovements - displayStats.value.totalEntries)
const efficiencyRateDisplay = computed(() => {
  if (displayStats.value.totalMovements === 0) return 0
  return Math.round((totalExitsDisplay.value / displayStats.value.totalMovements) * 100)
})

// GRÁFICO DE PIZZA
const pieChartData = computed(() => {
  if (materials.value.length === 0) return []
  const groups = {}
  let totalQty = 0
  materials.value.forEach(m => {
    const tipo = m.tipo || 'Outros'
    const qtd = Number(m.quantidade) || 0
    if (!groups[tipo]) groups[tipo] = 0
    groups[tipo] += qtd
    totalQty += qtd
  })
  return Object.keys(groups).map(key => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value: groups[key],
    percent: totalQty > 0 ? (groups[key] / totalQty) * 100 : 0,
    color: getColorForCategory(key)
  })).sort((a, b) => b.value - a.value).slice(0, 5)
})

function getColorForCategory(cat) {
  const colors = { 'sintetico': '#1d4ed8', 'couro': '#854d0e', 'tecido': '#047857', 'solado': '#334155', 'quimico': '#b91c1c' }
  return colors[cat] || '#64748b'
}

const pieChartStyle = computed(() => {
  if (pieChartData.value.length === 0) return ''
  let gradientStr = ''
  let currentDeg = 0
  pieChartData.value.forEach((slice, index) => {
    const degrees = (slice.percent / 100) * 360
    gradientStr += `${slice.color} ${currentDeg}deg ${currentDeg + degrees}deg`
    if (index < pieChartData.value.length - 1) gradientStr += ', '
    currentDeg += degrees
  })
  return { background: `conic-gradient(${gradientStr})` }
})

const topMaterials = computed(() => {
  return [...materials.value]
    .sort((a, b) => Number(b.quantidade) - Number(a.quantidade))
    .slice(0, 5)
})

const maxMaterialValue = computed(() => {
  if (topMaterials.value.length === 0) return 1
  return Number(topMaterials.value[0].quantidade)
})

// --- CARREGAMENTO ---
async function loadData() {
  isUpdating.value = true 
  try {
    const statsData = await fetchStats()
    realStats.value = statsData

    const materialsData = await fetchMaterials('_limit=1000')
    materials.value = Array.isArray(materialsData) ? materialsData : (materialsData.materials || [])
    
  } catch (error) {
    console.error("Erro dashboard:", error)
  } finally {
    isLoading.value = false
    setTimeout(() => isUpdating.value = false, 800)
  }
}

onMounted(() => {
  loadData()
  clockInterval = setInterval(() => { currentTime.value = new Date() }, 1000)
  refreshInterval = setInterval(loadData, 5000) 
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

        <div class="flex flex-col md:flex-row justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-lg border border-slate-300 animate-fade-in-down">
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
          
          <div class="mt-4 md:mt-0 bg-slate-50 px-6 py-3 rounded-xl border border-slate-200 flex items-center gap-4 shadow-inner w-full md:w-auto justify-between md:justify-end">
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
          
          <div class="card-hover bg-white rounded-2xl p-6 shadow-xl border-b-4 border-emerald-600 relative overflow-visible group">
            
            <div class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Total de materiais reutilizados ou vendidos. Indica economia gerada.
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
            </div>

            <div class="flex justify-between items-start z-10 relative">
              <div>
                <div class="flex items-center gap-1">
                  <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Saídas (Uso/Venda)</p>
                  <HelpCircle class="w-3 h-3 text-slate-300 cursor-help" />
                </div>
                <h3 class="text-4xl font-black text-emerald-700 mt-2 tracking-tight">{{ formatNumber(totalExitsDisplay) }}</h3>
                <p class="text-[10px] text-emerald-600 font-bold mt-1 bg-emerald-50 inline-block px-2 py-0.5 rounded">Meta: Aumentar 🚀</p>
              </div>
              <div class="bg-emerald-50 p-3 rounded-xl text-emerald-600 shadow-inner">
                <Wallet class="w-7 h-7" />
              </div>
            </div>
          </div>

          <div class="card-hover bg-white rounded-2xl p-6 shadow-xl border-b-4 border-red-500 relative overflow-visible group">
            
            <div class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Total de novas sobras geradas que entraram no estoque. Gera custo.
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
            </div>

            <div class="flex justify-between items-start z-10 relative">
              <div>
                <div class="flex items-center gap-1">
                  <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Entradas (Acúmulo)</p>
                  <HelpCircle class="w-3 h-3 text-slate-300 cursor-help" />
                </div>
                <h3 class="text-4xl font-black text-red-700 mt-2 tracking-tight">{{ formatNumber(displayStats.totalEntries) }}</h3>
                <p class="text-[10px] text-red-600 font-bold mt-1 bg-red-50 inline-block px-2 py-0.5 rounded">Meta: Reduzir 📉</p>
              </div>
              <div class="bg-red-50 p-3 rounded-xl text-red-600 shadow-inner">
                <Package class="w-7 h-7" />
              </div>
            </div>
          </div>

          <div class="card-hover bg-slate-800 rounded-2xl p-6 shadow-2xl text-white border border-slate-600 relative overflow-visible group">
            
            <div class="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-slate-800 text-xs p-3 rounded-lg shadow-xl w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Quantidade de códigos/tipos de materiais diferentes cadastrados.
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45"></div>
            </div>

            <div class="flex justify-between items-start z-10 relative">
              <div>
                 <div class="flex items-center gap-1">
                   <p class="text-slate-400 text-[10px] font-black uppercase tracking-widest">Tipos em Estoque</p>
                   <HelpCircle class="w-3 h-3 text-slate-600 cursor-help" />
                 </div>
                 <h3 class="text-4xl font-black mt-2 tracking-tight group-hover:scale-110 transition-transform origin-left">{{ formatNumber(displayStats.totalMaterials) }}</h3>
                 <p class="text-[10px] text-slate-400 font-bold mt-1">Cadastros Ativos</p>
              </div>
              <div class="bg-slate-700 p-3 rounded-xl shadow-inner">
                <Box class="w-7 h-7 text-white" />
              </div>
            </div>
            <div class="w-full bg-slate-900 h-2 mt-4 rounded-full overflow-hidden border border-slate-600">
              <div class="bg-blue-500 h-full transition-all duration-1000 ease-out" :style="{ width: `${100 - efficiencyRateDisplay}%` }"></div>
            </div>
          </div>

          <div class="card-hover bg-white rounded-2xl p-6 shadow-xl border-b-4 border-blue-500 relative overflow-visible group">
            
            <div class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Mede a eficiência: % do material que SAI em relação ao que ENTRA.
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
            </div>

            <div>
              <div class="flex items-center gap-1">
                <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Giro de Estoque</p>
                <HelpCircle class="w-3 h-3 text-slate-300 cursor-help" />
              </div>
              <div class="flex items-center gap-2 mt-2">
                <h3 class="text-5xl font-black tracking-tighter" :class="efficiencyRateDisplay > 50 ? 'text-blue-700' : 'text-orange-600'">{{ efficiencyRateDisplay }}%</h3>
              </div>
              <p class="text-[10px] text-slate-400 font-bold mt-1">Ideal: Acima de 50%</p>
            </div>
            <div class="absolute -right-4 -bottom-4 opacity-10 rotate-12">
               <Activity class="w-32 h-32 text-slate-800" />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up" style="animation-delay: 0.2s">
          
          <div class="bg-white rounded-2xl shadow-xl border border-slate-300 p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
            <h3 class="font-bold text-slate-800 w-full text-left mb-6 flex items-center gap-2">
              <PieChart class="w-5 h-5 text-slate-400" /> Distribuição
            </h3>
            <div class="relative w-52 h-52 rounded-full shadow-lg mb-8 border-4 border-slate-50 transition-transform duration-700 hover:scale-105 hover:rotate-2" :style="pieChartStyle">
              <div class="absolute inset-0 m-auto w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                <span class="text-3xl font-black text-slate-800">{{ pieChartData.length }}</span>
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Categorias</span>
              </div>
            </div>
            <div class="w-full space-y-2">
              <div v-for="slice in pieChartData" :key="slice.label" class="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 transition-colors hover:bg-slate-100">
                <div class="flex items-center gap-3">
                  <span class="w-3 h-3 rounded-sm shadow-sm" :style="{ backgroundColor: slice.color }"></span>
                  <span class="text-slate-700 font-bold uppercase">{{ slice.label }}</span>
                </div>
                <span class="font-bold text-slate-900">{{ formatNumber(slice.value) }}</span>
              </div>
            </div>
          </div>

          <div class="lg:col-span-2 bg-white rounded-2xl shadow-xl border border-slate-300 flex flex-col overflow-hidden">
            <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div class="flex items-center gap-2">
                <Trophy class="w-5 h-5 text-yellow-500" /> 
                <h3 class="font-bold text-slate-800">Maiores Acúmulos</h3>
                <div class="group relative ml-1">
                  <HelpCircle class="w-3 h-3 text-slate-400 cursor-help" />
                  <div class="absolute left-0 bottom-full mb-2 w-48 bg-slate-800 text-white text-[10px] p-2 rounded hidden group-hover:block z-20">
                    Estes são os materiais que ocupam mais espaço no estoque hoje. Foco neles para venda!
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                 <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                 <span class="text-[10px] font-bold text-slate-400 uppercase">Top 5 Sobras</span>
              </div>
            </div>

            <div class="flex-grow bg-white p-2">
              <table class="w-full text-left">
                <thead class="bg-white text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <tr>
                    <th class="p-3 pl-4 w-12 text-center">Rank</th>
                    <th class="p-3">Material</th>
                    <th class="p-3">Localização</th>
                    <th class="p-3 text-right">Volume Atual</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-sm relative">
                  <tr v-for="(item, index) in topMaterials" :key="item.id" class="hover:bg-slate-50 transition-colors duration-200 group">
                    <td class="p-3 text-center">
                       <div class="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs mx-auto shadow-sm"
                            :class="index === 0 ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : 
                                   (index === 1 ? 'bg-slate-200 text-slate-600' : 
                                   (index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'))">
                         {{ index + 1 }}º
                       </div>
                    </td>
                    <td class="p-3">
                      <div class="font-bold text-slate-700 text-sm group-hover:text-blue-700 transition-colors">
                        {{ item.descricao }}
                      </div>
                      <div v-if="item.codigo" class="text-[10px] text-slate-400 font-mono mt-0.5">
                         {{ item.codigo }} • {{ item.tipo }}
                      </div>
                    </td>
                    <td class="p-3">
                       <div class="flex items-center gap-1 text-slate-500 text-xs font-medium">
                         <MapPin class="w-3 h-3 text-slate-300" /> {{ item.localizacao || 'Não definido' }}
                       </div>
                    </td>
                    <td class="p-3 pr-4 text-right w-1/3">
                      <div class="font-black text-slate-800 text-lg leading-none mb-1">
                        {{ formatNumber(item.quantidade) }} <span class="text-xs text-slate-400 font-bold uppercase">{{ item.unidade }}</span>
                      </div>
                      <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex justify-end">
                         <div class="h-full rounded-l-full transition-all duration-1000"
                              :class="index === 0 ? 'bg-red-500' : 'bg-slate-400'"
                              :style="{ width: `${(Number(item.quantidade) / maxMaterialValue) * 100}%` }">
                         </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="topMaterials.length === 0" class="p-10 text-center text-slate-400 italic font-medium">
                  Nenhum material cadastrado ainda.
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </Layout>
</template>

<style scoped>
.animate-fade-in-down { animation: fadeInDown 0.8s ease-out forwards; }
.animate-fade-in-up { opacity: 0; animation: fadeInUp 0.8s ease-out 0.3s forwards; }
.card-hover { transition: all 0.3s ease; }
.card-hover:hover { transform: translateY(-5px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); }

@keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

.stagger-animation > div { opacity: 0; animation: fadeInUp 0.6s ease-out forwards; }
.stagger-animation > div:nth-child(1) { animation-delay: 0.1s; }
.stagger-animation > div:nth-child(2) { animation-delay: 0.2s; }
.stagger-animation > div:nth-child(3) { animation-delay: 0.3s; }
.stagger-animation > div:nth-child(4) { animation-delay: 0.4s; }
</style>