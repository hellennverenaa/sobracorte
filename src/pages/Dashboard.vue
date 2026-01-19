<script setup>
import { ref, onMounted, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import { Package, AlertTriangle, ArrowUpCircle, Activity, TrendingUp, Calendar, Sparkles } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'

const { fetchStats, fetchMaterials } = useApi()
const authStore = useAuthStore()

const stats = ref({ totalMaterials: 0, lowStock: 0, totalMovements: 0, totalEntries: 0 })
const materials = ref([])
const isLoading = ref(true)

const nomeUsuario = computed(() => {
  const nomeCompleto = authStore.user?.nome || 'Visitante'
  return nomeCompleto.split(' ')[0] 
})

const today = computed(() => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))

const topMaterials = computed(() => {
  const sorted = [...materials.value].sort((a, b) => Number(b.quantidade) - Number(a.quantidade)).slice(0, 5)
  const maxVal = sorted[0]?.quantidade || 1
  return sorted.map(m => ({ ...m, percent: Math.round((Number(m.quantidade) / maxVal) * 100) }))
})

onMounted(async () => {
  try {
    stats.value = await fetchStats()
    const data = await fetchMaterials()
    materials.value = Array.isArray(data) ? data : (data.materials || [])
  } catch (error) { console.error(error) } 
  finally { isLoading.value = false }
})
</script>

<template>
  <Layout>
    <div class="min-h-screen bg-slate-50/50 py-5">
      <div class="w-full max-w-[1440px] mx-auto px-6 lg:px-8">
        <div class="mb-4 animate-fade-in-up flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-indigo-600 font-bold mb-1 text-xs uppercase tracking-wider">
              <Sparkles class="w-3.5 h-3.5" /> <span>Visão Geral</span>
            </div>
            <h2 class="text-3xl font-extrabold text-gray-900 tracking-tight leading-none">Olá, {{ nomeUsuario }}!</h2>
          </div>
          <div class="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-2">
            <Calendar class="w-4 h-4 text-indigo-500" /> <span class="text-gray-700 font-medium capitalize text-sm">{{ today }}</span>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div class="bg-white p-5 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 flex items-center justify-between">
            <div><p class="text-xs font-bold text-gray-400 uppercase">Total Materiais</p><p class="text-3xl font-black text-gray-900">{{ stats.totalMaterials }}</p></div>
            <div class="p-2.5 rounded-xl bg-indigo-50 text-indigo-600"><Package class="w-7 h-7" /></div>
          </div>
          <div class="bg-white p-5 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 flex items-center justify-between">
            <div><p class="text-xs font-bold text-gray-400 uppercase">Baixo Estoque</p><p class="text-3xl font-black text-gray-900">{{ stats.lowStock }}</p></div>
            <div class="p-2.5 rounded-xl bg-yellow-50 text-yellow-600"><AlertTriangle class="w-7 h-7" /></div>
          </div>
          <div class="bg-white p-5 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 flex items-center justify-between">
            <div><p class="text-xs font-bold text-gray-400 uppercase">Movimentações</p><p class="text-3xl font-black text-gray-900">{{ stats.totalMovements }}</p></div>
            <div class="p-2.5 rounded-xl bg-purple-50 text-purple-600"><Activity class="w-7 h-7" /></div>
          </div>
          <div class="bg-white p-5 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 flex items-center justify-between">
            <div><p class="text-xs font-bold text-gray-400 uppercase">Total Entradas</p><p class="text-3xl font-black text-gray-900">{{ stats.totalEntries }}</p></div>
            <div class="p-2.5 rounded-xl bg-green-50 text-green-600"><ArrowUpCircle class="w-7 h-7" /></div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
          <div class="lg:col-span-2 bg-white p-6 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 flex flex-col h-full">
            <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4"><TrendingUp class="w-5 h-5 text-indigo-600" /> Top 5 - Maiores Estoques</h3>
            <div class="flex-grow flex flex-col justify-around">
              <div v-for="(item, index) in topMaterials" :key="item.id" class="relative group">
                <div class="flex justify-between text-sm mb-1">
                  <span class="font-semibold text-gray-700 truncate w-3/4">{{ index + 1 }}. {{ item.descricao }}</span>
                  <span class="font-bold">{{ item.quantidade }} {{ item.unidade }}</span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div class="h-full rounded-full bg-indigo-500" :style="{ width: item.percent + '%' }"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="bg-indigo-900 rounded-2xl p-6 text-white flex flex-col justify-between shadow-xl">
            <div>
              <div class="inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-xs font-bold mb-4"><Sparkles class="w-3 h-3" /> DICA DE GESTÃO</div>
              <h3 class="text-2xl font-bold mb-3">Mantenha seu estoque saudável</h3>
              <p class="text-indigo-200 text-sm">Registre as saídas diariamente.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>

<style scoped>
.animate-fade-in-up { animation: fadeInUp 0.7s forwards; opacity: 0; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
</style>