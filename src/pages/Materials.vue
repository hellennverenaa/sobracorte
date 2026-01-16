<script setup>
import { ref, computed, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import EmptyState from '@/components/EmptyState.vue'
import { Search, Plus, Edit, Trash2, Package, AlertCircle, X } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const { fetchMaterials, createMaterial, updateMaterial, deleteMaterial } = useApi()

const materials = ref([])
const isLoading = ref(true)
const searchTerm = ref('')
const filterTipo = ref('')
const showModal = ref(false)
const editingMaterial = ref(null)
const error = ref('')
const isSubmitting = ref(false)

const formData = ref({
  codigo: '',
  descricao: '',
  tipo: 'madeira',
  quantidade: 0,
  unidade: 'kg',
  localizacao: '',
  observacoes: ''
})

const tipos = [
  { value: 'madeira', label: 'Madeira' },
  { value: 'chapa_metalica', label: 'Chapa Metálica' },
  { value: 'plastico', label: 'Plástico' },
  { value: 'vidro', label: 'Vidro' },
  { value: 'outro', label: 'Outro' }
]

const unidades = [
  { value: 'kg', label: 'Quilograma (kg)' },
  { value: 'm', label: 'Metro (m)' },
  { value: 'm2', label: 'Metro Quadrado (m²)' },
  { value: 'unidade', label: 'Unidade (un)' }
]

const filteredMaterials = computed(() => {
  let filtered = [...materials.value]

  if (searchTerm.value) {
    const search = searchTerm.value.toLowerCase()
    filtered = filtered.filter(m =>
      m.descricao.toLowerCase().includes(search) ||
      m.codigo.toLowerCase().includes(search)
    )
  }

  if (filterTipo.value) {
    filtered = filtered.filter(m => m.tipo === filterTipo.value)
  }

  return filtered
})

function getStockColor(quantidade) {
  if (quantidade < 10) return 'text-red-600 bg-red-100'
  if (quantidade < 50) return 'text-yellow-600 bg-yellow-100'
  return 'text-green-600 bg-green-100'
}

function getTipoLabel(tipo) {
  const found = tipos.find(t => t.value === tipo)
  return found ? found.label : tipo
}

// --- AJUSTE IMPORTANTE AQUI ---
async function loadMaterials() {
  isLoading.value = true
  try {
    const data = await fetchMaterials()
    // O json-server retorna o array direto, então usamos 'data' diretamente
    materials.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.error('Error fetching materials:', err)
    error.value = 'Erro ao carregar materiais'
  } finally {
    isLoading.value = false
  }
}

function openModal(material) {
  if (material) {
    editingMaterial.value = material
    formData.value = {
      codigo: material.codigo,
      descricao: material.descricao,
      tipo: material.tipo,
      quantidade: material.quantidade,
      unidade: material.unidade,
      localizacao: material.localizacao,
      observacoes: material.observacoes || ''
    }
  } else {
    editingMaterial.value = null
    formData.value = {
      codigo: '',
      descricao: '',
      tipo: 'madeira',
      quantidade: 0,
      unidade: 'kg',
      localizacao: '',
      observacoes: ''
    }
  }
  error.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingMaterial.value = null
  error.value = ''
}

async function handleSubmit() {
  // Verificação simples de login
  if (!authStore.isAuthenticated) {
    error.value = 'Você precisa estar autenticado.'
    return
  }

  error.value = ''
  isSubmitting.value = true

  try {
    if (editingMaterial.value) {
      await updateMaterial(editingMaterial.value.id, formData.value)
    } else {
      await createMaterial(formData.value)
    }

    await loadMaterials()
    closeModal()
  } catch (err) {
    error.value = err.message || 'Erro ao salvar material'
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(id) {
  if (!confirm('Tem certeza que deseja deletar este material?')) {
    return
  }

  try {
    await deleteMaterial(id)
    await loadMaterials()
  } catch (err) {
    alert('Erro ao deletar material')
  }
}

onMounted(() => {
  loadMaterials()
})
</script>

<template>
  <Layout>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h2 class="text-3xl font-bold text-gray-900 mb-2">Materiais</h2>
          <p class="text-gray-600">Gerencie o estoque de sobras e retalhos</p>
        </div>
        <button
          @click="openModal()"
          class="mt-4 md:mt-0 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
        >
          <Plus class="w-5 h-5 mr-2" />
          Novo Material
        </button>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              v-model="searchTerm"
              type="text"
              placeholder="Buscar por descrição, código..."
              class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          <select
            v-model="filterTipo"
            class="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
          >
            <option value="">Todos os tipos</option>
            <option v-for="tipo in tipos" :key="tipo.value" :value="tipo.value">
              {{ tipo.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div v-if="isLoading" class="p-12 flex justify-center">
          <LoadingSpinner />
        </div>

        <EmptyState
          v-else-if="filteredMaterials.length === 0"
          :icon="Package"
          title="Nenhum material encontrado"
          description="Adicione materiais ao estoque para começar a gerenciar."
          label="Adicionar Material"
          @action="openModal()"
        />

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Código</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Descrição</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Qtd.</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Local</th>
                <th class="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="material in filteredMaterials" :key="material.id" class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600 font-medium">
                  {{ material.codigo }}
                </td>
                <td class="px-6 py-4 text-sm font-medium text-gray-900">
                  {{ material.descricao }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    {{ getTipoLabel(material.tipo) }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getStockColor(material.quantidade)]">
                    {{ material.quantidade }} {{ material.unidade }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {{ material.localizacao }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div class="flex justify-end space-x-2">
                    <button
                      @click="openModal(material)"
                      class="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                      title="Editar"
                    >
                      <Edit class="w-4 h-4" />
                    </button>
                    <button
                      @click="handleDelete(material.id)"
                      class="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                      title="Deletar"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transform transition-all">
        <div class="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 class="text-xl font-bold text-gray-900">
            {{ editingMaterial ? 'Editar Material' : 'Novo Material' }}
          </h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600 transition-colors">
            <X class="w-6 h-6" />
          </button>
        </div>

        <form @submit.prevent="handleSubmit" class="p-6 space-y-6">
          <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
            <AlertCircle class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <span class="text-sm">{{ error }}</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Código *</label>
              <input
                v-model="formData.codigo"
                type="text"
                required
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                placeholder="Ex: MAT-001"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Tipo *</label>
              <select
                v-model="formData.tipo"
                required
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white"
              >
                <option v-for="tipo in tipos" :key="tipo.value" :value="tipo.value">
                  {{ tipo.label }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Descrição *</label>
            <input
              v-model="formData.descricao"
              type="text"
              required
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              placeholder="Ex: Madeira compensada 10mm"
            />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Quantidade *</label>
              <input
                v-model.number="formData.quantidade"
                type="number"
                required
                min="0"
                step="0.01"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Unidade *</label>
              <select
                v-model="formData.unidade"
                required
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white"
              >
                <option v-for="unidade in unidades" :key="unidade.value" :value="unidade.value">
                  {{ unidade.label }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Localização *</label>
            <input
              v-model="formData.localizacao"
              type="text"
              required
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              placeholder="Ex: Galpão A - Prateleira 3"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Observações</label>
            <textarea
              v-model="formData.observacoes"
              rows="3"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              placeholder="Informações adicionais..."
            />
          </div>

          <div class="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              @click="closeModal"
              class="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :disabled="isSubmitting"
              class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <span v-if="isSubmitting" class="mr-2">
                <LoadingSpinner class="w-4 h-4" />
              </span>
              {{ isSubmitting ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Layout>
</template>