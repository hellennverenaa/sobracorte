<template>
  <Layout>
    <div v-if="notification.show" :class="notification.type === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'"
      class="fixed top-4 right-4 px-4 py-3 rounded border shadow-lg z-[100]">
      {{ notification.message }}
    </div>
    <div class="flex flex-col h-full px-6 pt-6 bg-gray-50/50 relative">



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
                <button type="button" @click="form.type = 'ENTRADA'"
                  class="py-3 text-sm font-extrabold rounded-lg transition-all flex items-center justify-center gap-2"
                  :class="form.type === 'ENTRADA' ? 'bg-white text-red-600 shadow-sm ring-1 ring-black/5 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg> ENTRADA
                </button>
                <button type="button" @click="form.type = 'SAIDA'"
                  class="py-3 text-sm font-extrabold rounded-lg transition-all flex items-center justify-center gap-2"
                  :class="form.type === 'SAIDA' ? 'bg-white text-green-600 shadow-sm ring-1 ring-black/5 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg> SAÍDA
                </button>
              </div>

              <div class="relative">
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Material</label>
                <div class="relative">
                  <input v-model="searchQuery" @input="filterMaterials" @focus="showDropdown = true" type="text"
                    class="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-700 placeholder-gray-400"
                    placeholder="Digite código ou nome..." required />
                  <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                      stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <ul v-if="showDropdown && filteredMaterials.length > 0"
                  class="absolute z-50 w-full bg-white border border-gray-100 rounded-xl shadow-xl mt-2 max-h-60 overflow-y-auto custom-scrollbar ring-1 ring-black/5">
                  <li v-for="mat in filteredMaterials" :key="mat.id" @click="selectMaterial(mat)"
                    class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-50 group flex justify-between items-center transition-colors">
                    <span class="font-bold text-gray-700 group-hover:text-blue-700">{{ mat.name }}</span>
                    <span
                      class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono font-bold border border-gray-200">#{{
                        mat.code }}</span>
                  </li>
                </ul>
              </div>

              <div v-if="selectedMaterial"
                class="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-2xl p-4 shadow-sm relative overflow-hidden animate-fade-in">
                <div class="relative z-10">
                  <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Item Selecionado</div>
                  <div class="font-bold text-gray-800 text-lg leading-tight pr-8">{{ selectedMaterial.name }}</div>
                  <div class="mt-3 flex items-center gap-4">
                    <div>
                      <span class="text-xs text-gray-400 block">Código</span>
                      <span
                        class="font-mono text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{{
                          selectedMaterial.code }}</span>
                    </div>
                    <div>
                      <span class="text-xs text-gray-400 block">Estoque Total</span>
                      <span class="font-bold transition-colors"
                        :class="form.type === 'ENTRADA' ? 'text-red-600' : 'text-green-600'">
                        {{ formatNumber(selectedMaterial.quantity) }} {{ selectedMaterial.unit?.symbol }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Quantidade</label>
                <div class="relative">
                  <input v-model="form.quantity" type="number" step="0.001"
                    class="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-xl text-gray-800"
                    placeholder="0.000" required />
                  <div class="absolute right-4 top-3.5 text-sm font-bold text-gray-400 pointer-events-none uppercase">{{
                    selectedMaterial?.unit?.symbol || 'und' }}</div>
                </div>
              </div>

              <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Localização no Estoque</label>
                <select v-model="form.locationId" :disabled="form.type === 'SAIDA' && !form.locationId"
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-red-500">
                  <option value="" disabled selected hidden>Selecione a prateleira...</option>
                  <option v-for="option in locationOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <p v-if="form.type === 'SAIDA' && !form.locationId" class="text-xs text-red-500 mt-1 font-medium">
                  Este material está zerado em todas as prateleiras.
                </p>
              </div>

              <div v-if="form.type === 'ENTRADA'" class="space-y-2 mt-4 animate-fade-in">
                <label class="text-sm font-bold text-gray-700">
                  Origem da Sobra <span class="text-red-500">*</span>
                </label>
                <div class="relative">
                  <select v-model="form.originId"
                    class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    :class="!form.originId ? 'text-gray-400' : 'text-gray-900'">
                    <option value="" disabled selected hidden>Selecione o motivo da sobra...</option>
                    <option v-for="item in origensSobra" :key="item.id" :value="item.id">
                      {{ item.name }}
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Motivo / Obs</label>
                <input v-model="form.reason" type="text"
                  class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Ex: Observações gerais..." />
              </div>

              <button type="submit"
                class="w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-transform transform active:scale-[0.98] flex justify-center items-center gap-2 text-lg mt-4"
                :class="form.type === 'ENTRADA' ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-red-200 hover:shadow-red-300' : 'bg-gradient-to-r from-green-500 to-green-600 shadow-green-200 hover:shadow-green-300'">
                <span>CONFIRMAR {{ form.type }}</span>
              </button>
            </form>
          </div>
        </div>

        <div class="lg:col-span-8 h-full min-h-[500px]">
          <div class="bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col h-full overflow-hidden">
            <div
              class="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center sticky top-0 bg-white z-[5]">
              <h2 class="font-bold text-gray-700 flex items-center gap-2">Últimos Registros</h2>
              <div class="relative w-64">
                <input v-model="historySearch" type="text" placeholder="Filtrar por código..."
                  class="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white" />
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 absolute left-3 top-2.5"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div class="flex-1 overflow-auto custom-scrollbar">
              <table class="w-full text-left border-collapse">
                <thead class="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th
                      class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      Data</th>
                    <th
                      class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      Material</th>
                    <th
                      class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-center">
                      Tipo</th>
                    <th
                      class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-right">
                      Qtd</th>
                    <th
                      class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-center">
                      Resp.</th>
                    <th
                      class="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-center">
                      Obs</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  <tr v-for="item in filteredHistory" :key="item.id"
                    class="hover:bg-blue-50/30 transition-colors group">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{{ formatDate(item.data ||
                      item.createdAt) }}</td>
                    <td class="px-6 py-4">
                      <div class="flex flex-col">
                        <span class="font-bold text-gray-700 text-sm group-hover:text-blue-700 transition-colors">{{
                          item.material?.name || 'Excluído' }}</span>
                        <span class="text-[10px] text-gray-400 font-mono" v-if="item.material">Cód: {{
                          item.material.code }}</span>
                        <span v-if="item.originName" class="text-[9px] font-bold text-blue-500 uppercase mt-0.5">Origem: {{
                          item.originName }}</span>
                      </div>
                    </td>
                    <td class="px-6 py-4 text-center">
                      <span
                        class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border shadow-sm"
                        :class="item.type === 'entrada' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'">
                        {{ item.type }}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="text-sm font-bold text-gray-800">{{ formatNumber(item.quantity) }}
                      </div>
                    </td>
                    <td class="px-6 py-4 text-center">
                      <span
                        class="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full border border-gray-200 uppercase tracking-wider">
                        {{ item.operatorName || 'Sistema' }}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-center">
                      <div v-if="item.reason" class="relative group/tooltip inline-block">
                        <svg xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 text-gray-400 hover:text-blue-500 cursor-help" fill="none" viewBox="0 0 24 24"
                          stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <div
                          class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white text-xs rounded-xl p-3 hidden group-hover/tooltip:block z-50 shadow-2xl text-left w-auto max-w-sm">
                          <span class="block whitespace-normal leading-relaxed">{{ item.reason }}</span>
                          <div
                            class="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-gray-800">
                          </div>
                        </div>
                      </div>
                      <span v-else class="text-gray-300">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="flex items-center justify-between border-t px-5 py-3 text-xs text-gray-500">
              <span>{{ historyMeta.total }} registros</span>
              <div class="flex items-center gap-2">
                <button class="px-3 py-1 border rounded disabled:opacity-40" :disabled="historyPage <= 1" @click="changeHistoryPage(historyPage - 1)">Anterior</button>
                <span>Página {{ historyPage }} / {{ historyMeta.totalPages || 1 }}</span>
                <button class="px-3 py-1 border rounded disabled:opacity-40" :disabled="historyPage >= historyMeta.totalPages" @click="changeHistoryPage(historyPage + 1)">Próxima</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Layout>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Layout from '../components/Layout.vue'
import { api } from '../services/httpClient'
import { useToast } from '@/composables/useToast'
import { formatNumber, formatDate } from '@/utils/format'

const dbLocations = ref([]);
const origensSobra = ref([]);

const form = ref({ type: 'SAIDA', quantity: '', reason: '', locationId: '', originId: '' })

const materials = ref([])
const history = ref([])
const searchQuery = ref('')
const selectedMaterial = ref(null)
const showDropdown = ref(false)
const historySearch = ref('')
const historyPage = ref(1)
const historyMeta = ref({ total: 0, totalPages: 1, pageSize: 50 })
let searchTimer
let historyTimer
let isSelectingMaterial = false
const closeDropdownOnOutsideClick = (event) => {
  if (!event.target.closest('.relative')) showDropdown.value = false
}
const { notification, showNotification } = useToast()

const locationOptions = computed(() => {
  if (form.value.type === 'SAIDA') {
    if (!selectedMaterial.value) return [];
    const matLocations = selectedMaterial.value.locations || []
    const validLocations = matLocations
      .filter(ml => ml.quantity > 0)
      .map(ml => ({
        value: ml.locationId || ml.location?.id,
        label: `${ml.location.name} (Saldo: ${ml.quantity})`
      }))

    if (validLocations.length === 0) {
      return [{ value: '', label: '❌ Sem estoque físico disponível' }]
    }
    return validLocations
  }

  const categoryId = selectedMaterial.value?.categoryId || selectedMaterial.value?.category?.id;
  const linked = dbLocations.value.filter(loc => (loc.categories || []).some(c => c.id === categoryId));
  return linked.map(loc => ({ value: loc.id, label: loc.name }));
})

watch([selectedMaterial, () => form.value.type], ([newMat, newType]) => {
  if (!newMat) return;

  if (newType === 'SAIDA') {
    const hasStock = (newMat.locations || []).find(ml => ml.quantity > 0)
    if (hasStock) {
      form.value.locationId = hasStock.locationId || hasStock.location?.id
    } else {
      form.value.locationId = ''
    }
  } else {
    const categoryId = newMat.categoryId || newMat.category?.id;
    const linked = dbLocations.value.filter(loc => (loc.categories || []).some(c => c.id === categoryId));
    if (linked.length > 0) {
      form.value.locationId = linked[0].id;
    } else {
      form.value.locationId = '';
    }
  }
})

async function fetchData() {
  try {
    const [histRes, originsRes, locationsRes] = await Promise.all([
      api.get('/movements', { params: { page: historyPage.value, pageSize: historyMeta.value.pageSize, q: historySearch.value || undefined } }),
      api.get('/settings/origins'),
      api.get('/settings/locations')
    ]);

    history.value = histRes.data?.data || histRes.data;
    historyMeta.value = { ...historyMeta.value, ...(histRes.data?.meta || {}) };
    origensSobra.value = originsRes.data?.data || originsRes.data;
    dbLocations.value = locationsRes.data;

  } catch (error) {
    console.error("Erro no fetchData:", error);

    const errorMsg = error.response?.data?.error || 'Erro ao carregar dados do servidor.';
    showNotification('error', `⚠️ ${errorMsg}`);
  }
}

const filteredMaterials = computed(() => {
  if (!searchQuery.value) return []
  const term = searchQuery.value.toLowerCase().trim()
  return materials.value.filter(m =>
    (m.name || '').toLowerCase().includes(term) ||
    String(m.code || '').toLowerCase().includes(term)
  ).slice(0, 10)
})

watch(searchQuery, (value) => {
  clearTimeout(searchTimer)
  if (isSelectingMaterial) { isSelectingMaterial = false; return }
  selectedMaterial.value = null
  if (!value.trim()) { materials.value = []; return }
  searchTimer = setTimeout(async () => {
    const response = await api.get('/materials', { params: { page: 1, pageSize: 20, q: value.trim() } })
    materials.value = response.data?.data || response.data || []
    showDropdown.value = true
  }, 300)
})

watch(historySearch, () => {
  clearTimeout(historyTimer)
  historyTimer = setTimeout(() => { historyPage.value = 1; fetchData() }, 300)
})

function changeHistoryPage(nextPage) {
  if (nextPage < 1 || nextPage > historyMeta.value.totalPages) return
  historyPage.value = nextPage
  fetchData()
}

const filteredHistory = computed(() => {
  let list = history.value
  if (historySearch.value) {
    const term = historySearch.value.toLowerCase().trim()
    list = list.filter(h => {
      const codeMatch = h.material?.code && String(h.material.code).toLowerCase().includes(term)
      const nameMatch = h.material?.name && String(h.material.name).toLowerCase().includes(term)
      return codeMatch || nameMatch
    })
  }
  return list.slice(0, 100)
})

function selectMaterial(mat) {
  isSelectingMaterial = true
  selectedMaterial.value = mat
  searchQuery.value = mat.name
  showDropdown.value = false
}

function filterMaterials() {
  selectedMaterial.value = null
  showDropdown.value = true
}


async function submitMovement() {
  if (!selectedMaterial.value) {
    const term = searchQuery.value.trim();
    const match = materials.value.find(m => String(m.code) === term);
    if (match) selectedMaterial.value = match;
    else return showNotification('error', 'Selecione um material válido!');
  }

  if (!form.value.quantity || form.value.quantity <= 0) {
    return showNotification('error', 'Digite uma quantidade válida!');
  }
  if (!form.value.locationId) {
    return showNotification('error', 'Selecione a prateleira de destino!');
  }

  if (form.value.type === 'ENTRADA' && !form.value.originId) {
    return showNotification('error', 'Selecione a origem da sobra!');
  }

  try {
    await api.post('/movements', {
      materialId: Number(selectedMaterial.value.id),
      type: form.value.type,
      quantity: String(form.value.quantity),
      reason: form.value.reason || '',
      locationId: form.value.locationId,
      originId: form.value.type === 'ENTRADA' ? form.value.originId : null
    });

    showNotification('success', `Registro de ${form.value.type} salvo!`);

    form.value.quantity = '';
    form.value.reason = '';
    form.value.originId = '';
    searchQuery.value = '';
    selectedMaterial.value = null;

    await fetchData();

  } catch (e) {
    const httpStatus = e.response?.status;
    const errorMsg = e.response?.data?.error || e.message || 'Falha de conexão ou erro no servidor.';

    console.error(`Erro ao salvar movimentação (HTTP ${httpStatus || 'indisponível'}): ${errorMsg}`);

    showNotification('error', `❌ Erro ${httpStatus ? `(${httpStatus})` : ''}: ${errorMsg}`);
  }
}

onMounted(() => {
  fetchData()
  document.addEventListener('click', closeDropdownOnOutsideClick)
})

onUnmounted(() => {
  clearTimeout(searchTimer)
  clearTimeout(historyTimer)
  document.removeEventListener('click', closeDropdownOnOutsideClick)
})
</script>

<style scoped>
@keyframes fade {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fade-down {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade 0.3s ease-out forwards;
}

.fade-down-enter-active {
  animation: fade-down 0.3s ease-out;
}

.fade-down-leave-active {
  animation: fade-down 0.3s ease-in reverse;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 10px;
}
</style>
