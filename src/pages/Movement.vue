<script setup>
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle2, Package } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const { fetchMaterials, createTransaction, fetchTransactions } = useApi()

const materials = ref([])
const transactions = ref([])
const selectedMaterialId = ref('')
const movementType = ref('entrada')
const quantidade = ref('')
const observacoes = ref('')
const isLoading = ref(false)
const error = ref('')
const success = ref('')

async function loadMaterials() {
  try {
    const data = await fetchMaterials()
    materials.value = data.materials || []
  } catch (err) {
    console.error('Error fetching materials:', err)
  }
}

async function loadTransactions() {
  try {
    const data = await fetchTransactions()
    transactions.value = data.transactions || []
  } catch (err) {
    console.error('Error fetching transactions:', err)
  }
}

async function handleSubmit() {
  error.value = ''
  success.value = ''

  if (!selectedMaterialId.value || !quantidade.value) {
    error.value = 'Selecione um material e informe a quantidade'
    return
  }

  const qtd = parseFloat(quantidade.value)
  if (qtd <= 0) {
    error.value = 'A quantidade deve ser maior que zero'
    return
  }

  if (!authStore.token) {
    error.value = 'Você precisa estar autenticado. Faça login novamente.'
    return
  }

  isLoading.value = true

  try {
    const transactionData = {
      material_id: selectedMaterialId.value,
      tipo: movementType.value,
      quantidade: qtd,
      observacoes: observacoes.value || undefined
    }

    await createTransaction(transactionData)

    success.value = `${movementType.value === 'entrada' ? 'Entrada' : 'Saída'} registrada com sucesso!`
    
    // Reset form
    selectedMaterialId.value = ''
    quantidade.value = ''
    observacoes.value = ''

    // Reload data
    await loadMaterials()
    await loadTransactions()

    // Clear success message after 5 seconds
    setTimeout(() => {
      success.value = ''
    }, 5000)
  } catch (err) {
    error.value = err.message || 'Erro ao registrar movimentação'
  } finally {
    isLoading.value = false
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getSelectedMaterial() {
  return materials.value.find(m => m.id === selectedMaterialId.value)
}

onMounted(() => {
  loadMaterials()
  loadTransactions()
})
</script>

<template>
  <Layout>
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h2 class="text-3xl font-bold text-gray-900 mb-2">Movimentação</h2>
        <p class="text-gray-600">Registre entradas e saídas de materiais</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Form -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6">Registrar Movimentação</h3>

          <!-- Success Alert -->
          <div v-if="success" class="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start">
            <CheckCircle2 class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <span class="text-sm">{{ success }}</span>
          </div>

          <!-- Error Alert -->
          <div v-if="error" class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
            <AlertCircle class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <span class="text-sm">{{ error }}</span>
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-4">
            <!-- Movement Type -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-3">Tipo de Movimentação</label>
              <div class="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  @click="movementType = 'entrada'"
                  :class="[
                    'p-4 border-2 rounded-lg font-medium transition-all',
                    movementType === 'entrada'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  ]"
                >
                  <ArrowUpCircle class="w-6 h-6 mx-auto mb-2" />
                  Entrada
                </button>
                <button
                  type="button"
                  @click="movementType = 'saida'"
                  :class="[
                    'p-4 border-2 rounded-lg font-medium transition-all',
                    movementType === 'saida'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 hover:border-gray-300'
                  ]"
                >
                  <ArrowDownCircle class="w-6 h-6 mx-auto mb-2" />
                  Saída
                </button>
              </div>
            </div>

            <!-- Material Select -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Material *</label>
              <select
                v-model="selectedMaterialId"
                required
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">Selecione um material</option>
                <option v-for="material in materials" :key="material.id" :value="material.id">
                  {{ material.codigo }} - {{ material.descricao }} ({{ material.quantidade }} {{ material.unidade }})
                </option>
              </select>
            </div>

            <!-- Current Stock Info -->
            <div v-if="getSelectedMaterial()" class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="flex items-center">
                <Package class="w-5 h-5 text-blue-600 mr-2" />
                <div class="text-sm">
                  <p class="font-medium text-blue-900">Estoque Atual</p>
                  <p class="text-blue-700">
                    {{ getSelectedMaterial().quantidade }} {{ getSelectedMaterial().unidade }} -
                    {{ getSelectedMaterial().localizacao }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Quantity -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Quantidade *</label>
              <input
                v-model="quantidade"
                type="number"
                required
                min="0.01"
                step="0.01"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="0.00"
              />
            </div>

            <!-- Observations -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Observações</label>
              <textarea
                v-model="observacoes"
                rows="3"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="Informações adicionais..."
              />
            </div>

            <!-- Submit Button -->
            <button
              type="submit"
              :disabled="isLoading"
              :class="[
                'w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                movementType === 'entrada'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              ]"
            >
              {{ isLoading ? 'Registrando...' : `Registrar ${movementType === 'entrada' ? 'Entrada' : 'Saída'}` }}
            </button>
          </form>
        </div>

        <!-- Recent Transactions -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6">Movimentações Recentes</h3>

          <div v-if="transactions.length === 0" class="text-center py-8 text-gray-500">
            <Package class="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhuma movimentação registrada</p>
          </div>

          <div v-else class="space-y-3 max-h-[600px] overflow-y-auto">
            <div
              v-for="transaction in transactions"
              :key="transaction.id"
              class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex items-center">
                  <div
                    :class="[
                      'p-2 rounded-lg mr-3',
                      transaction.tipo === 'entrada' ? 'bg-green-100' : 'bg-red-100'
                    ]"
                  >
                    <ArrowUpCircle
                      v-if="transaction.tipo === 'entrada'"
                      class="w-5 h-5 text-green-600"
                    />
                    <ArrowDownCircle
                      v-else
                      class="w-5 h-5 text-red-600"
                    />
                  </div>
                  <div>
                    <p class="font-medium text-gray-900">
                      {{ transaction.material_descricao || transaction.material_codigo }}
                    </p>
                    <p class="text-sm text-gray-600">
                      {{ transaction.tipo === 'entrada' ? 'Entrada' : 'Saída' }} de {{ transaction.quantidade }} unidades
                    </p>
                  </div>
                </div>
                <span
                  :class="[
                    'px-2 py-1 rounded-full text-xs font-semibold',
                    transaction.tipo === 'entrada'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  ]"
                >
                  {{ transaction.quantidade }}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span>{{ transaction.usuario_nome }}</span>
                <span>{{ formatDate(transaction.created_at) }}</span>
              </div>
              <p v-if="transaction.observacoes" class="text-xs text-gray-600 mt-2 italic">
                {{ transaction.observacoes }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>
