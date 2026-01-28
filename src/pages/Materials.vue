<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import Layout from '@/components/Layout.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import EmptyState from '@/components/EmptyState.vue'
import { Search, Plus as PlusIcon, Edit, Trash2, Package, Filter, X, User, Tag as TagIcon } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { fetchMaterials, createMaterial, updateMaterial, deleteMaterial, createMovement, request } = useApi()
const authStore = useAuthStore()

// --- CONFIGURAÇÕES ---
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

const unidades = ['UN', 'KG', 'MT', 'MT2', 'RL', 'CX', 'L', 'PR', 'M2']

const localizacoes = [
  'Estoque Geral',
  'Almoxarifado Central',
  'Prateleira A (Sintéticos)',
  'Prateleira B (Tecidos)',
  'Prateleira C (Químicos)',
  'Prateleira D (Metais)',
  'Área de Corte',
  'Expedição',
  'Depósito Externo'
]

const materials = ref([])
const isLoading = ref(true)
const searchTerm = ref('')
const filtroCategoria = ref('todos') 
const showModal = ref(false)
const editingMaterial = ref(null)
const isSubmitting = ref(false)

const podeEditar = computed(() => ['admin', 'operador'].includes(authStore.user?.role))
const ehAdmin = computed(() => authStore.user?.role === 'admin')

const formData = ref({
  codigo: '',
  descricao: '',
  tipo: 'sintetico',
  quantidade: 0,
  unidade: 'M2',
  localizacao: 'Estoque Geral',
  observacoes: ''
})

// --- CARREGAMENTO OTIMIZADO ---
async function loadMaterials() {
  isLoading.value = true
  materials.value = [] 

  try {
    let data = []

    if (searchTerm.value && searchTerm.value.length > 0) {
      const termo = searchTerm.value.toLowerCase()

      // Busca tudo sem limite no servidor
      const rawData = await request(`/materials?q=${termo}`)
      const candidatos = Array.isArray(rawData) ? rawData : (rawData.materials || [])

      // Filtra lixo e mostra os 50 melhores
      const filtrados = candidatos.filter(item => {
        const codigo = String(item.codigo || '').toLowerCase()
        const descricao = String(item.descricao || '').toLowerCase()
        return codigo.includes(termo) || descricao.includes(termo)
      })

      data = filtrados.slice(0, 50)

    } else if (filtroCategoria.value !== 'todos') {
      data = await fetchMaterials(`tipo=${filtroCategoria.value}`)
    } else {
      data = await fetchMaterials(`_limit=50`)
    }

    materials.value = Array.isArray(data) ? data : (data.materials || [])

  } catch (err) {
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

watch([searchTerm, filtroCategoria], () => {
  setTimeout(() => loadMaterials(), 400)
})

function openModal(material) {
  if (material) {
    editingMaterial.value = material
    formData.value = { 
      codigo: material.codigo || '', 
      descricao: material.descricao,
      tipo: material.tipo || 'sintetico',
      quantidade: material.quantidade, 
      unidade: material.unidade || 'M2', 
      localizacao: material.localizacao || '',
      observacoes: material.observacoes || ''
    }
  } else {
    editingMaterial.value = null
    formData.value = {
      codigo: '',
      descricao: '',
      tipo: 'sintetico',
      quantidade: 0,
      unidade: 'M2',
      localizacao: 'Estoque Geral',
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
    const payload = {
      ...formData.value,
      usuario_cadastro: authStore.user?.nome || 'Desconhecido',
      data_atualizacao: new Date().toISOString()
    }

    if (editingMaterial.value) {
      await updateMaterial(editingMaterial.value.id, payload)
    } else {
      payload.data_cadastro = new Date().toISOString()
      await createMaterial(payload)
    }
    
    searchTerm.value = ''
    filtroCategoria.value = 'todos'
    
    await loadMaterials()
    closeModal()
  } catch (err) {
    alert('Erro ao salvar: ' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(item) {
  if(!confirm(`ATENÇÃO: Tem certeza que deseja excluir "${item.descricao}"?\nIsso ficará registrado no histórico.`)) return

  try {
    const nomeAuditado = item.codigo ? `${item.codigo} - ${item.descricao}` : item.descricao
    
    await createMovement({
      materialId: null, 
      nomeMaterial: nomeAuditado, 
      tipo: 'exclusão', 
      quantidade: item.quantidade,
      observacao: `MATERIAL EXCLUÍDO DO SISTEMA`,
      usuario: authStore.user?.nome || 'Admin'
    })

    await deleteMaterial(item.id)
    loadMaterials()

  } catch (err) {
    alert('Erro ao excluir: ' + err.message)
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
       <button 
  v-if="auth.can('cadastrar_materiais')" 
  @click="showModal = true" 
  class="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-primary-focus transition-colors"
>
  <PlusIcon class="w-5 h-5" />
  Novo Material
</button>
      </div>

      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4">
        <div class="relative flex-grow">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input v-model="searchTerm" type="text" placeholder="Buscar por CÓDIGO ou DESCRIÇÃO..." class="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-gray-400">
        </div>
        <div class="relative min-w-[250px]">
          <Filter class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <select v-model="filtroCategoria" class="w-full pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer hover:bg-gray-100 transition-colors text-gray-700">
            <option v-for="cat in categorias" :key="cat.valor" :value="cat.valor">{{ cat.label }}</option>
          </select>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div v-if="isLoading" class="p-12 flex justify-center"><LoadingSpinner /></div>
        <EmptyState v-else-if="materials.length === 0" :icon="Package" title="Nenhum material encontrado" description="Verifique o termo digitado." />

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Código</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descrição</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Categoria</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Localização</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Saldo</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Cadastrado Por</th>
                <th class="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="item in materials" :key="item.id" class="hover:bg-blue-50/30 transition-colors group">
                <td class="px-6 py-4 text-sm font-mono text-gray-500">
                  <span v-if="item.codigo" class="bg-gray-100 px-2 py-1 rounded text-xs font-bold border border-gray-200" :class="{'bg-yellow-100 border-yellow-200 text-yellow-800': searchTerm && item.codigo.toLowerCase().includes(searchTerm.toLowerCase())}">{{ item.codigo }}</span>
                  <span v-else class="text-xs text-gray-300">---</span>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm font-semibold text-gray-900">{{ item.descricao }}</p>
                  <p v-if="item.observacoes" class="text-xs text-gray-400 mt-0.5 line-clamp-1">{{ item.observacoes }}</p>
                </td>
                <td class="px-6 py-4"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize border border-gray-200">{{ item.tipo }}</span></td>
                <td class="px-6 py-4 text-sm text-gray-500">{{ item.localizacao || '-' }}</td>
                
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <span :class="`text-sm font-bold ${Number(item.quantidade) < 10 ? 'text-red-600' : 'text-green-600'}`">
                      {{ Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) }}
                    </span>
                    <span class="text-xs text-gray-400 font-bold bg-gray-50 px-1 rounded">{{ item.unidade }}</span>
                  </div>
                </td>

                <td class="px-6 py-4 text-sm text-gray-400 flex items-center gap-2">
                  <User class="w-3 h-3" /> {{ item.usuario_cadastro || 'Sistema' }}
                </td>
                <td class="px-6 py-4 text-right">
                  <div v-if="ehAdmin" class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button @click="openModal(item)" class="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Editar"><Edit class="w-4 h-4" /></button>
                    <button @click="handleDelete(item)" class="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Excluir"><Trash2 class="w-4 h-4" /></button>
                  </div>
                  <span v-else class="text-xs text-gray-300 italic">Leitura</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="bg-gray-50 px-6 py-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
          <span v-if="!searchTerm && filtroCategoria === 'todos'">Mostrando últimos 50 itens cadastrados</span>
          <span v-else>Resultados da pesquisa</span>
        </div>
      </div>

      <div v-if="showModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl w-full max-w-lg shadow-2xl transform transition-all">
          <div class="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
            <h3 class="text-xl font-bold text-gray-900">{{ editingMaterial ? 'Editar' : 'Novo' }} Material</h3>
            <button @click="closeModal" class="text-gray-400 hover:text-red-500 transition-colors"><X class="w-6 h-6" /></button>
          </div>
          <form @submit.prevent="handleSubmit" class="p-6 space-y-5">
            <div class="grid grid-cols-3 gap-4">
              <div class="col-span-1">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Código</label>
                <div class="relative">
                  <TagIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input v-model="formData.codigo" class="w-full pl-9 pr-2.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-sm" placeholder="Ex: A10" />
                </div>
              </div>
              <div class="col-span-2">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Categoria</label>
                <select v-model="formData.tipo" class="w-full p-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">
                  <option v-for="cat in categorias.filter(c => c.valor !== 'todos')" :key="cat.valor" :value="cat.valor">{{ cat.label }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição</label>
              <input v-model="formData.descricao" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Tecido Sintético Preto..." required />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Unidade</label>
                <select v-model="formData.unidade" class="w-full p-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">
                  <option v-for="uni in unidades" :key="uni" :value="uni">{{ uni }}</option>
                </select>
              </div>
               <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Saldo Atual</label>
                <input v-model="formData.quantidade" type="number" step="0.01" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-800" required />
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Localização</label>
              <select v-model="formData.localizacao" class="w-full p-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">
                <option value="" disabled>Selecione onde está guardado...</option>
                <option v-for="loc in localizacoes" :key="loc" :value="loc">{{ loc }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Observações (Opcional)</label>
              <textarea v-model="formData.observacoes" rows="2" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"></textarea>
            </div>
            <div class="pt-4 flex justify-end gap-3 border-t border-gray-50">
              <button type="button" @click="closeModal" class="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
              <button type="submit" :disabled="isSubmitting" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold shadow-lg shadow-blue-200 transition-all active:scale-95">
                {{ isSubmitting ? 'Salvando...' : 'Salvar Material' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Layout>
</template>