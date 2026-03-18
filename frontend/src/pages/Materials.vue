<template>
  <Layout>
    <div class="flex flex-col h-full">
      
      <div class="flex justify-between items-center mb-6 px-4 pt-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Materiais</h1>
          <p class="text-sm text-gray-500">Gerenciamento de Estoque</p>
        </div>
        <button 
          @click="openCreateModal"
          class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2 shadow-sm transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          <span>Novo Material</span>
        </button>
      </div>

      <div class="bg-white p-4 rounded shadow-sm border border-gray-200 mx-4 mb-4 flex gap-4">
        <div class="w-1/3">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Categoria</label>
          <select v-model="selectedCategory" class="w-full border p-2 rounded outline-none focus:border-blue-500 bg-white">
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>
        <div class="w-2/3">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar</label>
          <input 
            v-model="search" 
            type="text" 
            placeholder="Pesquise por código ou nome..." 
            class="w-full border p-2 rounded outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div class="flex-1 overflow-auto px-4 pb-4">
        <div class="bg-white rounded shadow border border-gray-200">
          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Código</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Descrição</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Categ.</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Qtd / Medida</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in paginatedMaterials" :key="item.id" class="hover:bg-gray-50 border-b last:border-0 transition-colors">
                <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ item.code }}</td>
                <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.name }}</td>
                <td class="px-4 py-3 text-center">
                  <span class="px-2 py-1 text-xs bg-gray-100 rounded-full font-bold text-gray-600 border border-gray-200">{{ item.type }}</span>
                </td>
                <td class="px-4 py-3 text-right font-bold text-gray-800">
                  {{ formatNumber(item.quantity) }} 
                  <span class="text-xs bg-blue-50 text-blue-800 px-1 rounded ml-1 border border-blue-100">{{ item.unit }}</span>
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-3">
                    <button @click="viewDetails(item)" class="text-gray-400 hover:text-blue-600 transition-colors" title="Visualizar Detalhes">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </button>
                    <button @click="editItem(item)" class="text-gray-400 hover:text-orange-500 transition-colors" title="Editar">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button @click="confirmDelete(item)" class="text-gray-400 hover:text-red-600 transition-colors" title="Excluir">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="viewingItem" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
            <h3 class="font-bold text-gray-800">Detalhes do Material</h3>
            <button @click="viewingItem = null" class="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
          </div>
          <div class="p-6 space-y-4">
            <div class="flex justify-center mb-2">
              <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded text-lg font-mono font-bold border border-blue-200">{{ viewingItem.code }}</span>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase">Nome</label>
              <div class="text-gray-900 font-medium">{{ viewingItem.name }}</div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Unidade</label>
                <div class="text-gray-900 font-bold">{{ viewingItem.unit }}</div>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Estoque</label>
                <div class="text-gray-900 font-bold">{{ formatNumber(viewingItem.quantity) }}</div>
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase">Localização</label>
              <div class="text-gray-900">{{ viewingItem.location || 'Não informada' }}</div>
            </div>
             <div>
              <label class="block text-xs font-bold text-gray-500 uppercase">Observação</label>
              <div class="text-gray-900 bg-gray-50 p-2 rounded border border-gray-100 text-sm">{{ viewingItem.observation || 'Nenhuma observação' }}</div>
            </div>
          </div>
          <div class="px-6 py-4 bg-gray-50 text-right">
            <button @click="viewingItem = null" class="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 text-sm">Fechar</button>
          </div>
        </div>
      </div>

      <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
          <h2 class="text-lg font-bold mb-4 text-gray-800">{{ editingItem ? 'Editar' : 'Novo Material' }}</h2>
          <form @submit.prevent="saveItem" class="space-y-4">
            
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">Código</label>
              <input v-model="form.code" required class="w-full border p-2 rounded outline-none font-mono" placeholder="Ex: 1040" />
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">Descrição</label>
              <input v-model="form.name" required class="w-full border p-2 rounded outline-none" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">Categoria</label>
                <select v-model="form.type" class="w-full border p-2 rounded bg-white outline-none">
                  <option v-for="cat in categories.filter(c => c !== 'Todos')" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">Unidade</label>
                <select v-model="form.unit" class="w-full border p-2 rounded bg-white outline-none font-medium">
                  <option value="und">Unidade (und)</option>
                  <option value="kg">Quilograma (kg)</option>
                  <option value="m">Metro (m)</option>
                  <option value="m²">Metro Quadrado (m²)</option>
                  <option value="g">Grama (g)</option>
                  <option value="par">Par</option>
                  <option value="cx">Caixa</option>
                  <option value="rl">Rolo</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
               <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">Estoque Inicial</label>
                <input type="number" step="0.01" v-model.number="form.quantity" class="w-full border p-2 rounded outline-none" />
              </div>
              <div>
                 <label class="block text-sm font-bold text-gray-700 mb-1">Localização</label>
                 <input v-model="form.location" class="w-full border p-2 rounded outline-none" placeholder="Opcional" />
              </div>
            </div>
            
            <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">Observação</label>
                <textarea v-model="form.observation" class="w-full border p-2 rounded outline-none h-20 resize-none" placeholder="Detalhes adicionais..."></textarea>
              </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t">
              <button type="button" @click="showCreateModal = false" class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Cancelar</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Salvar</button>
            </div>
          </form>
        </div>
      </div>

    </div>
  </Layout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Layout from '../components/Layout.vue'

const API_URL = 'http://localhost:3000'
const materials = ref([])
const search = ref('')
const selectedCategory = ref('Todos')
const showCreateModal = ref(false)
const editingItem = ref(null)
const viewingItem = ref(null)

const form = ref({ code: '', name: '', type: 'OUTROS', unit: 'und', quantity: 0, location: '', observation: '' })

const categories = ['Todos', 'TECIDO', 'LINHA', 'ELASTICO', 'AVIAMENTO', 'COURO', 'SINTETICO', 'SOLADO', 'FILME', 'EVA', 'ESPUMA', 'FORRO', 'MANTA', 'MICROFIBRA', 'FERRAMENTAIS', 'OUTROS']

async function fetchMaterials() {
  try {
    const res = await fetch(`${API_URL}/materials`)
    materials.value = await res.json()
  } catch (e) { console.error(e) }
}

const paginatedMaterials = computed(() => {
  return materials.value.filter(m => {
    const term = search.value.toLowerCase()
    return (selectedCategory.value === 'Todos' || m.type === selectedCategory.value) &&
           (m.name.toLowerCase().includes(term) || String(m.code).toLowerCase().includes(term))
  }).sort((a,b) => b.id - a.id).slice(0, 50)
})

function formatNumber(num) { return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) }

function openCreateModal() {
  editingItem.value = null
  form.value = { code: '', name: '', type: 'OUTROS', unit: 'und', quantity: 0, location: '', observation: '' }
  showCreateModal.value = true
}

function editItem(item) {
  editingItem.value = item
  form.value = { ...item }
  showCreateModal.value = true
}

function viewDetails(item) { viewingItem.value = item }

async function saveItem() {
  try {
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const userId = user ? user.id : 1; 

    const method = editingItem.value ? 'PUT' : 'POST'
    const url = editingItem.value ? `${API_URL}/materials/${editingItem.value.id}` : `${API_URL}/materials`
    
    const payload = { ...form.value, userId } 
    if (!editingItem.value) delete payload.id 

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    
    if (res.ok) {
      alert('Salvo com sucesso!')
      showCreateModal.value = false
      await fetchMaterials()
    } else {
      alert('Erro: Verifique se o código já existe.')
    }
  } catch (e) { alert('Erro de conexão.') }
}

async function confirmDelete(item) {
  if (confirm('Tem certeza? A exclusão será registrada.')) {
    await fetch(`${API_URL}/materials/${item.id}`, { method: 'DELETE' })
    fetchMaterials()
  }
}

onMounted(fetchMaterials)
</script>