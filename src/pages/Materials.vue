<script setup>
import { ref, computed, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import EmptyState from '@/components/EmptyState.vue'
import { Search, Plus, Edit, Trash2, Package, Filter, X } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'

const { fetchMaterials, createMaterial, updateMaterial, deleteMaterial } = useApi()

// --- LISTA DE CATEGORIAS CALÇADISTAS ---
const categorias = [
  { valor: 'todos', label: 'Todos os Materiais' },
  { valor: 'sintetico', label: 'Sintéticos (PU/PVC)' },
  { valor: 'couro', label: 'Couro Natural' },
  { valor: 'tecido', label: 'Tecidos / Lonas' },
  { valor: 'forro', label: 'Forros' },
  { valor: 'solado', label: 'Solados / Borracha' },
  { valor: 'palmilha', label: 'Palmilhas / Espumas' },
  { valor: 'quimico', label: 'Químicos / Colas' },
  { valor: 'metal', label: 'Metais / Aviamentos' },
  { valor: 'embalagem', label: 'Embalagens' },
  { valor: 'outro', label: 'Outros' }
]

const materials = ref([])
const isLoading = ref(true)
const searchTerm = ref('')
const filtroCategoria = ref('todos') // Começa mostrando tudo
const showModal = ref(false)
const editingMaterial = ref(null)
const isSubmitting = ref(false)

// Formulário
const formData = ref({
  codigo: '',
  descricao: '',
  tipo: 'sintetico', // Padrão mais comum
  quantidade: 0,
  unidade: 'un',
  localizacao: '',
  observacoes: ''
})

// --- LÓGICA DE FILTRO AVANÇADA ---
const filteredMaterials = computed(() => {
  let lista = materials.value

  // 1. Filtra por Categoria
  if (filtroCategoria.value !== 'todos') {
    lista = lista.filter(m => m.tipo === filtroCategoria.value)
  }

  // 2. Filtra por Busca (Nome ou Código)
  if (searchTerm.value) {
    const termo = searchTerm.value.toLowerCase()
    lista = lista.filter(m => 
      String(m.descricao || '').toLowerCase().includes(termo) ||
      String(m.codigo || '').toLowerCase().includes(termo)
    )
  }

  return lista
})

async function loadMaterials() {
  isLoading.value = true
  try {
    const data = await fetchMaterials()
    materials.value = Array.isArray(data) ? data : (data.materials || [])
  } catch (err) {
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

// Funções do Modal
function openModal(material) {
  if (material) {
    editingMaterial.value = material
    formData.value = { ...material }
  } else {
    editingMaterial.value = null
    formData.value = {
      codigo: '',
      descricao: '',
      tipo: 'sintetico',
      quantidade: 0,
      unidade: 'un',
      localizacao: '',
      observacoes: ''
    }
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingMaterial.value = null
}

async function handleSubmit() {
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
    alert('Erro ao salvar: ' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(id) {
  if(confirm('Tem certeza que deseja excluir este material?')) {
    await deleteMaterial(id)
    loadMaterials()
  }
}

onMounted(() => loadMaterials())
</script>

<template>
  <Layout>
    <div class="max-w-7xl mx-auto px-4 py-8">
      
      <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Materiais</h2>
          <p class="text-gray-500 text-sm">Gerencie o estoque de matéria-prima.</p>
        </div>
        <button @click="openModal()" class="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 font-medium transition-colors w-full md:w-auto justify-center">
          <Plus class="w-5 h-5" /> Novo Material
        </button>
      </div>

      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4">
        
        <div class="relative flex-grow">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            v-model="searchTerm" 
            type="text" 
            placeholder="Buscar por código, nome ou descrição..." 
            class="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          >
        </div>

        <div class="relative min-w-[200px]">
          <Filter class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <select 
            v-model="filtroCategoria"
            class="w-full pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <option v-for="cat in categorias" :key="cat.valor" :value="cat.valor">
              {{ cat.label }}
            </option>
          </select>
          <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div v-if="isLoading" class="p-12 flex justify-center"><LoadingSpinner /></div>
        
        <EmptyState 
          v-else-if="filteredMaterials.length === 0" 
          :icon="Package" 
          title="Nenhum material encontrado" 
          description="Tente mudar o filtro ou buscar por outro termo."
        />

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Código</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descrição</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Categoria</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estoque</th>
                <th class="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="item in filteredMaterials" :key="item.id" class="hover:bg-blue-50/30 transition-colors group">
                <td class="px-6 py-4 text-sm font-mono text-gray-500 bg-gray-50/30 w-32">{{ item.codigo }}</td>
                <td class="px-6 py-4">
                  <p class="text-sm font-semibold text-gray-900">{{ item.descricao }}</p>
                  <p v-if="item.observacoes" class="text-xs text-gray-400 mt-0.5">{{ item.observacoes }}</p>
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize border border-gray-200">
                    {{ item.tipo }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <span :class="`text-sm font-bold ${Number(item.quantidade) < 10 ? 'text-red-600' : 'text-green-600'}`">
                      {{ item.quantidade }}
                    </span>
                    <span class="text-xs text-gray-400 uppercase">{{ item.unidade }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 text-right">
                  <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button @click="openModal(item)" class="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Editar">
                      <Edit class="w-4 h-4" />
                    </button>
                    <button @click="handleDelete(item.id)" class="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Excluir">
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="bg-gray-50 px-6 py-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
          <span>Mostrando {{ filteredMaterials.length }} itens</span>
          <span v-if="filteredMaterials.length < materials.length"> (Filtrado de {{ materials.length }} totais)</span>
        </div>
      </div>

      <div v-if="showModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl w-full max-w-lg shadow-2xl transform transition-all">
          
          <div class="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 class="text-xl font-bold text-gray-900">{{ editingMaterial ? 'Editar' : 'Novo' }} Material</h3>
            <button @click="closeModal" class="text-gray-400 hover:text-gray-600"><X class="w-6 h-6" /></button>
          </div>

          <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input v-model="formData.codigo" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select v-model="formData.tipo" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option v-for="cat in categorias.filter(c => c.valor !== 'todos')" :key="cat.valor" :value="cat.valor">
                    {{ cat.label }}
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input v-model="formData.descricao" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Quantidade Inicial</label>
                <input v-model="formData.quantidade" type="number" step="0.01" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                <input v-model="formData.unidade" placeholder="Ex: m, kg, par" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Localização (Opcional)</label>
              <input v-model="formData.localizacao" placeholder="Ex: Prateleira B3" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            <div class="pt-4 flex justify-end gap-3">
              <button type="button" @click="closeModal" class="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
              <button type="submit" :disabled="isSubmitting" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                {{ isSubmitting ? 'Salvando...' : 'Salvar Alterações' }}
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  </Layout>
</template>