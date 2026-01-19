<script setup>
import { ref, onMounted, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import { Package, AlertTriangle, ArrowUpCircle, Activity, TrendingUp, Calendar, Sparkles } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'

// --- LÓGICA (MANTIDA IGUAL) ---
const { fetchStats, fetchMaterials } = useApi()

const stats = ref({
  totalMaterials: 0,
  lowStock: 0,
  totalMovements: 0,
  totalEntries: 0
})

const materials = ref([])
const isLoading = ref(true)

const today = computed(() => {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
})

const topMaterials = computed(() => {
  const sorted = [...materials.value]
    .sort((a, b) => Number(b.quantidade) - Number(a.quantidade))
    .slice(0, 5)

  const maxVal = sorted[0]?.quantidade || 1
  
  return sorted.map(m => ({
    ...m,
    percent: Math.round((Number(m.quantidade) / maxVal) * 100)
  }))
})

onMounted(async () => {
  try {
    stats.value = await fetchStats()
    const data = await fetchMaterials()
    materials.value = Array.isArray(data) ? data : (data.materials || [])
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error)
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <Layout>
    <div class="min-h-screen bg-slate-50/50 py-8">
      
      <div class="w-full max-w-[1440px] mx-auto px-6 lg:px-8">
        
        <div class="mb-8 animate-fade-in-up flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-indigo-600 font-bold mb-2 text-sm uppercase tracking-wider">
              <Sparkles class="w-4 h-4" />
              <span>Visão Geral</span>
            </div>
            <h2 class="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
              Olá, Hellen!
            </h2>
            <p class="text-gray-500 mt-1">Aqui está o resumo do seu estoque hoje.</p>
          </div>
          
          <div class="bg-white px-5 py-2.5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <Calendar class="w-5 h-5 text-indigo-500" />
            <span class="text-gray-700 font-medium capitalize">{{ today }}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          
          <div class="group bg-white p-6 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 hover:shadow-[0_15px_30px_rgb(99,102,241,0.15)] transition-all duration-300 hover:-translate-y-1 animate-fade-in-up stagger-1 cursor-default relative overflow-hidden">
            <div class="flex items-start justify-between relative z-10">
              <div>
                <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Materiais</p>
                <p class="text-4xl font-black text-gray-900">{{ stats.totalMaterials }}</p>
              </div>
              <div class="p-3 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                <Package class="w-8 h-8" />
              </div>
            </div>
            <div class="absolute -bottom-4 -right-4 w-24 h-24 bg-indigo-50 rounded-full opacity-0 group-hover:opacity-50 transition-opacity duration-500 blur-2xl"></div>
          </div>

          <div class="group bg-white p-6 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 hover:shadow-[0_15px_30px_rgb(234,179,8,0.2)] transition-all duration-300 hover:-translate-y-1 animate-fade-in-up stagger-2 cursor-default relative overflow-hidden">
            <div v-if="stats.lowStock > 0" class="absolute inset-0 bg-yellow-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <div class="flex items-start justify-between relative z-10">
              <div>
                <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-2">
                  Baixo Estoque
                  <span v-if="stats.lowStock > 0" class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                </p>
                <p class="text-4xl font-black text-gray-900">{{ stats.lowStock }}</p>
              </div>
              <div class="p-3 rounded-xl bg-yellow-50 text-yellow-600 group-hover:scale-110 transition-transform duration-300">
                <AlertTriangle class="w-8 h-8" />
              </div>
            </div>
          </div>

          <div class="group bg-white p-6 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 hover:shadow-[0_15px_30px_rgb(168,85,247,0.15)] transition-all duration-300 hover:-translate-y-1 animate-fade-in-up stagger-3 cursor-default relative overflow-hidden">
            <div class="flex items-start justify-between relative z-10">
              <div>
                <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Movimentações</p>
                <p class="text-4xl font-black text-gray-900">{{ stats.totalMovements }}</p>
              </div>
              <div class="p-3 rounded-xl bg-purple-50 text-purple-600 group-hover:scale-110 transition-transform duration-300">
                <Activity class="w-8 h-8" />
              </div>
            </div>
            <div class="absolute -bottom-4 -right-4 w-24 h-24 bg-purple-50 rounded-full opacity-0 group-hover:opacity-50 transition-opacity duration-500 blur-2xl"></div>
          </div>

          <div class="group bg-white p-6 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 hover:shadow-[0_15px_30px_rgb(34,197,94,0.15)] transition-all duration-300 hover:-translate-y-1 animate-fade-in-up stagger-4 cursor-default relative overflow-hidden">
            <div class="flex items-start justify-between relative z-10">
              <div>
                <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Entradas</p>
                <p class="text-4xl font-black text-gray-900">{{ stats.totalEntries }}</p>
              </div>
              <div class="p-3 rounded-xl bg-green-50 text-green-600 group-hover:scale-110 transition-transform duration-300">
                <ArrowUpCircle class="w-8 h-8" />
              </div>
            </div>
            <div class="absolute -bottom-4 -right-4 w-24 h-24 bg-green-50 rounded-full opacity-0 group-hover:opacity-50 transition-opacity duration-500 blur-2xl"></div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up stagger-5">
          
          <div class="lg:col-span-2 bg-white p-8 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 flex flex-col h-full">
            <div class="flex items-center justify-between mb-6">
              <div>
                <h3 class="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <TrendingUp class="w-6 h-6 text-indigo-600" />
                  Top 5 - Maiores Estoques
                </h3>
                <p class="text-gray-500 text-sm mt-1">Materiais com maior volume de armazenamento.</p>
              </div>
            </div>

            <div class="flex-grow flex flex-col justify-center">
              <div v-if="isLoading" class="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
                <span class="font-medium">Carregando gráfico...</span>
              </div>

              <div v-else-if="topMaterials.length === 0" class="h-64 flex items-center justify-center text-gray-400 bg-gray-50 rounded-xl border-dashed border-2 border-gray-200">
                Nenhum dado para exibir no momento.
              </div>

              <div v-else class="space-y-6">
                <div v-for="(item, index) in topMaterials" :key="item.id" class="relative group">
                  <div class="flex justify-between text-sm mb-2 items-end">
                    <div class="flex items-center gap-3">
                      <span class="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                        {{ index + 1 }}
                      </span>
                      <span class="font-semibold text-gray-700 truncate max-w-[250px] md:max-w-md text-base" :title="item.descricao">{{ item.descricao }}</span>
                    </div>
                    <span class="font-bold text-gray-900 bg-gray-50 px-2 py-1 rounded border border-gray-100">{{ item.quantidade }} <span class="text-xs text-gray-500 font-bold uppercase">{{ item.unidade }}</span></span>
                  </div>
                  
                  <div class="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div 
                      class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 shadow-sm relative group-hover:from-indigo-400 group-hover:to-violet-400 transition-all duration-1000 ease-out" 
                      :style="{ width: item.percent + '%' }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-2xl overflow-hidden shadow-[0_15px_40px_rgb(67,56,202,0.2)] relative min-h-[350px] animate-fade-in-up stagger-6 flex flex-col">
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-violet-900 to-slate-900"></div>
            <div class="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500 via-transparent to-transparent"></div>
            
            <div class="relative p-8 h-full flex flex-col justify-between z-10 text-white">
              <div>
                <div class="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-100 mb-6 border border-white/10 shadow-lg">
                  <Sparkles class="w-3 h-3" /> DICA DE GESTÃO
                </div>
                <h3 class="text-2xl md:text-3xl font-bold mb-4 leading-tight tracking-tight">Mantenha seu estoque <br><span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-purple-200">sempre saudável</span></h3>
                <p class="text-indigo-100 text-base leading-relaxed opacity-90 border-l-2 border-indigo-400/50 pl-4">
                  A consistência é chave. Registre entradas e saídas no momento em que acontecem para evitar divergências.
                </p>
              </div>
              
              <div class="mt-8 bg-black/20 p-4 rounded-xl backdrop-blur-sm border border-white/5">
                <div class="flex items-center gap-3">
                  <div class="relative flex h-3 w-3">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </div>
                  <div>
                    <span class="text-sm font-bold block">Sistema Online</span>
                    <span class="text-xs text-indigo-300">Banco de dados local sincronizado</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  </Layout>
</template>

<style scoped>
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in-up {
  animation: fadeInUp 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  opacity: 0;
}

.stagger-1 { animation-delay: 0.1s; }
.stagger-2 { animation-delay: 0.15s; }
.stagger-3 { animation-delay: 0.2s; }
.stagger-4 { animation-delay: 0.25s; }
.stagger-5 { animation-delay: 0.3s; }
.stagger-6 { animation-delay: 0.4s; }
</style>