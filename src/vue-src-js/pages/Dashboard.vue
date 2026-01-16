<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Layout from '@/components/Layout.vue'
import StatCard from '@/components/StatCard.vue'
import InitialSetup from '@/components/InitialSetup.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import { Package, TrendingDown, ArrowRightLeft, TrendingUp, ArrowDownCircle } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'

const router = useRouter()
const { fetchStats } = useApi()

const stats = ref({
  total_materials: 0,
  low_stock_count: 0,
  today_transactions: 0,
  total_entradas: 0,
  total_saidas: 0
})
const isLoading = ref(true)

async function loadStats() {
  try {
    const data = await fetchStats()
    stats.value = data
  } catch (error) {
    console.error('Error fetching stats:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadStats()
})
</script>

<template>
  <Layout>
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <LoadingSpinner />
    </div>

    <div v-else class="max-w-7xl mx-auto">
      <!-- Welcome Section -->
      <div class="mb-8">
        <h2 class="text-3xl font-bold text-gray-900 mb-2">Dashboard</h2>
        <p class="text-gray-600">Visão geral do estoque de sobras de materiais</p>
      </div>

      <!-- Initial Setup - Show if no materials -->
      <div v-if="stats.total_materials === 0" class="mb-6">
        <InitialSetup />
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total de Materiais"
          :value="stats.total_materials"
          :icon="Package"
          color="text-blue-600"
          bg-color="bg-blue-100"
        />

        <StatCard
          title="Baixo Estoque"
          :value="stats.low_stock_count"
          :icon="TrendingDown"
          color="text-red-600"
          bg-color="bg-red-100"
        />

        <StatCard
          title="Movimentações Hoje"
          :value="stats.today_transactions"
          :icon="ArrowRightLeft"
          color="text-purple-600"
          bg-color="bg-purple-100"
        />

        <StatCard
          title="Total de Entradas"
          :value="stats.total_entradas"
          :icon="TrendingUp"
          color="text-green-600"
          bg-color="bg-green-100"
        />
      </div>

      <!-- Additional Info -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Quick Actions -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h3>
          <div class="space-y-3">
            <router-link
              to="/materials"
              class="flex items-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Package class="w-5 h-5 text-blue-600 mr-3" />
              <div>
                <p class="font-medium text-gray-900">Consultar Materiais</p>
                <p class="text-sm text-gray-600">Visualize e gerencie o estoque</p>
              </div>
            </router-link>

            <router-link
              to="/movement"
              class="flex items-center p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
            >
              <ArrowRightLeft class="w-5 h-5 text-green-600 mr-3" />
              <div>
                <p class="font-medium text-gray-900">Registrar Movimentação</p>
                <p class="text-sm text-gray-600">Entrada ou saída de materiais</p>
              </div>
            </router-link>
          </div>
        </div>

        <!-- Summary -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Resumo de Transações</h3>
          <div class="space-y-4">
            <div class="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div class="flex items-center">
                <TrendingUp class="w-5 h-5 text-green-600 mr-3" />
                <span class="font-medium text-gray-900">Entradas</span>
              </div>
              <span class="text-xl font-bold text-green-600">{{ stats.total_entradas }}</span>
            </div>

            <div class="flex items-center justify-between p-4 bg-red-50 rounded-lg">
              <div class="flex items-center">
                <ArrowDownCircle class="w-5 h-5 text-red-600 mr-3" />
                <span class="font-medium text-gray-900">Saídas</span>
              </div>
              <span class="text-xl font-bold text-red-600">{{ stats.total_saidas }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Alert for low stock -->
      <div v-if="stats.low_stock_count > 0" class="mt-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
        <div class="flex">
          <div class="flex-shrink-0">
            <TrendingDown class="h-5 w-5 text-yellow-400" />
          </div>
          <div class="ml-3">
            <p class="text-sm text-yellow-700">
              <span class="font-medium">Atenção:</span> Você tem {{ stats.low_stock_count }}
              {{ stats.low_stock_count === 1 ? 'material' : 'materiais' }} com estoque baixo (menos de 10 unidades).
            </p>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>
