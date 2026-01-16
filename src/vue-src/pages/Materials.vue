<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import EmptyState from '@/components/EmptyState.vue'
import { Search, Plus, Edit, Trash2, Package, AlertCircle, X } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import type { Material } from '@/types'

const authStore = useAuthStore()
const { fetchMaterials, createMaterial, updateMaterial, deleteMaterial } = useApi()

const materials = ref<Material[]>([])
const isLoading = ref(true)
const searchTerm = ref('')
const filterTipo = ref('')
const showModal = ref(false)
const editingMaterial = ref<Material | null>(null)
const error = ref('')
const isSubmitting = ref(false)

const formData = ref({
  codigo: '',
  descricao: '',
  tipo: 'madeira' as Material['tipo'],
  quantidade: 0,
  unidade: 'kg' as Material['unidade'],
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

function getStockColor(quantidade: number) {
  if (quantidade < 10) return 'text-red-600 bg-red-100'
  if (quantidade < 50) return 'text-yellow-600 bg-yellow-100'
  return 'text-green-600 bg-green-100'
}

function getTipoLabel(tipo: string) {
  return tipos.find(t => t.value === tipo)?.label || tipo
}

async function loadMaterials() {
  try {
    const data = await fetchMaterials()
    materials.value = data.materials || []
  } catch (err) {
    console.error('Error fetching materials:', err)
  } finally {
    isLoading.value = false
  }
}

function openModal(material?: Material) {
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
  if (!authStore.token) {
    error.value = 'Você precisa estar autenticado. Faça login novamente.'
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
  } catch (err: any) {
    error.value = err.message || 'Erro ao salvar material'
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(id: string) {
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
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h2 class="text-3xl font-bold text-gray-900 mb-2">Materiais</h2>
          <p class="text-gray-600">Gerencie o estoque de sobras</p>
        </div>
        <button
          @click="openModal()"
          class="mt-4 md:mt-0 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center shadow-md transition-colors"
        >
          <Plus class="w-5 h-5 mr-2" />
          Novo Material
        </button>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              v-model="searchTerm"
              type="text"
              placeholder="Buscar por descrição ou código..."
              class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <select
            v-model="filterTipo"
            class="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Todos os tipos</option>
            <option v-for="tipo in tipos" :key="tipo.value" :value="tipo.value">
              {{ tipo.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- Materials Table -->
      <div class="bg-white rounded-xl shadow-md overflow-hidden">
        <LoadingSpinner v-if="isLoading" />

        <EmptyState
          v-else-if="filteredMaterials.length === 0"
          :icon="Package"
          title="Nenhum material encontrado"
          description="Adicione materiais ao estoque para começar"
          :action="{ label: 'Adicionar Material' }"
          @action="openModal()"
        />

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Código</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Descrição</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tipo</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantidade</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Localização</th>
                <th class="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="material in filteredMaterials" :key="material.id" class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  {{ material.codigo }}
                </td>
                <td class="px-6 py-4 text-sm font-medium text-gray-900">
                  {{ material.descricao }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    {{ getTipoLabel(material.tipo) }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <span :class="['px-3 py-1 rounded-full font-semibold', getStockColor(material.quantidade)]">
                    {{ material.quantidade }} {{ material.unidade }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {{ material.localizacao }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    @click="openModal(material)"
                    class="text-blue-600 hover:text-blue-900 mr-3"
                    title="Editar"
                  >
                    <Edit class="w-4 h-4" />
                  </button>
                  <button
                    @click="handleDelete(material.id)"
                    class="text-red-600 hover:text-red-900"
                    title="Deletar"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 class="text-xl font-bold text-gray-900">
            {{ editingMaterial ? 'Editar Material' : 'Novo Material' }}
          </h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600">
            <X class="w-6 h-6" />
          </button>
        </div>

        <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
          <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
            <AlertCircle class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <span class="text-sm">{{ error }}</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Código *</label>
              <input
                v-model="formData.codigo"
                type="text"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="Ex: MAT-001"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Tipo *</label>
              <select
                v-model="formData.tipo"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
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
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Ex: Madeira compensada 10mm"
            />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Quantidade *</label>
              <input
                v-model.number="formData.quantidade"
                type="number"
                required
                min="0"
                step="0.01"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Unidade *</label>
              <select
                v-model="formData.unidade"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
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
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Ex: Galpão A - Prateleira 3"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Observações</label>
            <textarea
              v-model="formData.observacoes"
              rows="3"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Informações adicionais..."
            />
          </div>

          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              @click="closeModal"
              class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :disabled="isSubmitting"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isSubmitting ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Layout>
</template>
