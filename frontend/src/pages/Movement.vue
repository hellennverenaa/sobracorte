<template>
  <Layout>
    <div class="flex flex-col h-full px-6 pt-6 bg-gray-50/50">
      
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-800 tracking-tight">Movimentações</h1>
        <p class="text-gray-500">Controle de Entradas (Soma) e Saídas (Subtração)</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full pb-6">
        
        <div class="lg:col-span-4 h-fit">
          <div class="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h2 class="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">Nova Operação</h2>
            
            <form @submit.prevent="submitMovement" class="space-y-5">
              
              <div class="grid grid-cols-2 gap-3 p-1 bg-gray-100 rounded-xl">
                <button type="button" @click="form.type = 'ENTRADA'" class="py-3 text-sm font-extrabold rounded-lg transition-all flex items-center justify-center gap-2" :class="form.type === 'ENTRADA' ? 'bg-white text-red-600 shadow-sm ring-1 ring-black/5 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg> ENTRADA
                </button>
                <button type="button" @click="form.type = 'SAIDA'" class="py-3 text-sm font-extrabold rounded-lg transition-all flex items-center justify-center gap-2" :class="form.type === 'SAIDA' ? 'bg-white text-green-600 shadow-sm ring-1 ring-black/5 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg> SAÍDA
                </button>
              </div>

              <div class="relative">
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Material</label>
                <div class="relative">
                  <input v-model="searchQuery" @input="filterMaterials" @focus="showDropdown = true" type="text" class="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-700 placeholder-gray-400" placeholder="Digite código ou nome..." required />
                  <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                </div>
                <ul v-if="showDropdown && filteredMaterials.length > 0" class="absolute z-50 w-full bg-white border border-gray-100 rounded-xl shadow-xl mt-2 max-h-60 overflow-y-auto custom-scrollbar ring-1 ring-black/5">
                  <li v-for="mat in filteredMaterials" :key="mat.id" @click="selectMaterial(mat)" class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-50 group flex justify-between items-center transition-colors">
                    <span class="font-bold text-gray-700 group-hover:text-blue-700">{{ mat.name }}</span>
                    <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono font-bold border border-gray-200">#{{ mat.code }}</span>
                  </li>
                </ul>
              </div>

              <div v-if="selectedMaterial" class="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-2xl p-4 shadow-sm relative overflow-hidden animate-fade-in">
                <div class="absolute right-0 top-0 p-3 opacity-10 text-gray-400">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16" fill="currentColor" viewBox="0 0 20 20"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fill-rule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>
                </div>
                <div class="relative z-10">
                  <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Item Selecionado</div>
                  <div class="font-bold text-gray-800 text-lg leading-tight pr-8">{{ selectedMaterial.name }}</div>
                  <div class="mt-3 flex items-center gap-4">
                    <div>
                      <span class="text-xs text-gray-400 block">Código</span>
                      <span class="font-mono text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{{ selectedMaterial.code }}</span>
                    </div>
                    <div>
                      <span class="text-xs text-gray-400 block">Estoque Atual</span>
                      <span class="font-bold text-gray-700">{{ formatNumber(selectedMaterial.quantity) }} {{ selectedMaterial.unit }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Quantidade</label>
                <div class="relative">
                  <input v-model.number="form.quantity" type="number" step="0.01" class="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-xl text-gray-800" placeholder="0.00" required />
                  <div class="absolute right-4 top-3.5 text-sm font-bold text-gray-400 pointer-events-none">{{ selectedMaterial ? selectedMaterial.unit : 'un' }}</div>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Motivo / Obs</label>
                <input v-model="form.reason" type="text" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="Ex: Produção..." />
              </div>

              <button type="submit" class="w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-transform transform active:scale-[0.98] flex justify-center items-center gap-2 text-lg mt-4" :class="form.type === 'ENTRADA' ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-red-200 hover:shadow-red-300' : 'bg-gradient-to-r from-green-500 to-green-600 shadow-green-200 hover:shadow-green-300'">
                <span>CONFIRMAR {{ form.type }}</span>
              </button>
            </form>
          </div>
        </div>

        <div class="lg:col-span-8 h-full min-h-[500px]">
          <div class="bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col h-full overflow-hidden">
            
            <div class="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h2 class="font-bold text-gray-700 flex items-center gap-2">Últimos Registros</h2>
              <div class="relative w-64">
                <input v-model="historySearch" type="text" placeholder="Filtrar por código..." class="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white" />
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>

            <div class="flex-1 overflow-auto custom-scrollbar">
              <table class="w-full text-left border-collapse">
                <thead class="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Data</th>
                    <th class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Material</th>
                    <th class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-center">Tipo</th>
                    <th class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-right">Qtd</th>
                    <th class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-center">Responsável</th>
                    <th class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-center">Obs</th> </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  <tr v-for="item in filteredHistory" :key="item.id" class="hover:bg-blue-50/30 transition-colors group">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{{ formatDate(item.createdAt) }}</td>
                    <td class="px-6 py-4">
                      <div class="flex flex-col">
                        <span class="font-bold text-gray-700 text-sm group-hover:text-blue-700 transition-colors">{{ item.material?.name || 'Excluído' }}</span>
                        <span class="text-[10px] text-gray-400 font-mono" v-if="item.material">Cód: {{ item.material.code }}</span>
                      </div>
                    </td>
                    <td class="px-6 py-4 text-center">
                      <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border shadow-sm" :class="item.type === 'ENTRADA' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'">{{ item.type }}</span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="text-sm font-bold text-gray-800">{{ formatNumber(item.quantity) }}</div>
                    </td>
                    <td class="px-6 py-4 text-center">
                      <span class="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full border border-gray-200">
                        {{ item.user ? item.user.name : 'Sistema' }}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-center">
                      <div v-if="item.reason" class="relative group/tooltip inline-block">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 hover:text-blue-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-gray-800 text-white text-xs rounded p-2 hidden group-hover/tooltip:block z-50 text-center shadow-lg">
                          {{ item.reason }}
                          <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                      <span v-else class="text-gray-300">-</span>
                    </td>
                  </tr>
                  <tr v-if="filteredHistory.length === 0">
                    <td colspan="6" class="p-12 text-center text-gray-400 italic">Nenhum registro encontrado.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Layout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Layout from '../components/Layout.vue'

const API_URL = 'http://localhost:3000'

const form = ref({ type: 'SAIDA', quantity: '', reason: '' })
const materials = ref([])
const history = ref([])
const searchQuery = ref('')
const selectedMaterial = ref(null)
const showDropdown = ref(false)
const historySearch = ref('')

async function fetchData() {
  try {
    const [matRes, histRes] = await Promise.all([
      fetch(`${API_URL}/materials`),
      fetch(`${API_URL}/movements`)
    ])
    materials.value = await matRes.json()
    const allHistory = await histRes.json()
    history.value = allHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch (e) { console.error(e) }
}

const filteredMaterials = computed(() => {
  if (!searchQuery.value) return []
  const term = searchQuery.value.toLowerCase()
  return materials.value.filter(m => m.name.toLowerCase().includes(term) || String(m.code).toLowerCase().includes(term)).slice(0, 10)
})

const filteredHistory = computed(() => {
  let list = history.value
  if (historySearch.value) {
    const term = historySearch.value.toLowerCase()
    list = list.filter(h => h.material?.code && String(h.material.code).toLowerCase().includes(term))
  }
  return list.slice(0, 20)
})

function selectMaterial(mat) {
  selectedMaterial.value = mat
  searchQuery.value = mat.name
  showDropdown.value = false
}

function filterMaterials() {
  selectedMaterial.value = null
  showDropdown.value = true
}

function formatNumber(num) { return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) }
function formatDate(date) { if (!date) return '-'; return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function submitMovement() {
  if (!selectedMaterial.value) {
    const match = materials.value.find(m => String(m.code) === searchQuery.value.trim())
    if (match) selectedMaterial.value = match
    else return alert('⚠️ Selecione um material válido!')
  }

  if (!form.value.quantity || form.value.quantity <= 0) return alert('⚠️ Quantidade inválida!')

  // PEGA O USUÁRIO LOGADO
  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userId = user ? user.id : 1; 

  try {
    const res = await fetch(`${API_URL}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialId: Number(selectedMaterial.value.id),
        type: form.value.type,
        quantity: Number(form.value.quantity),
        reason: form.value.reason || '',
        userId: userId // Envia ID do usuário
      })
    })

    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      alert('✅ Movimentação Registrada!')
      form.value.quantity = ''
      form.value.reason = ''
      searchQuery.value = ''
      selectedMaterial.value = null
      await fetchData()
    } else {
      alert(`❌ Erro: ${data.error || 'Falha no servidor'}`)
    }
  } catch (e) { alert('Erro de conexão.') }
}

onMounted(() => {
  fetchData()
  document.addEventListener('click', (e) => { if (!e.target.closest('.relative')) showDropdown.value = false })
})
</script>

<style scoped>
@keyframes fade { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
.animate-fade-in { animation: fade 0.3s ease-out forwards; }
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
</style>
