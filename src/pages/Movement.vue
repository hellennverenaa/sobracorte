<script setup>
import { ref, onMounted, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import { ArrowUpCircle, ArrowDownCircle, History, Package, Search, X, Lock } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth' // <--- IMPORTANTE: Importamos o Auth

const { fetchMaterials, createMovement, fetchMovements } = useApi()
const authStore = useAuthStore() // <--- Iniciamos a loja de autenticação

// --- CONTROLE DE ACESSO ---
// Só Admins e Operadores podem mover estoque. Leitores não.
const podeMover = computed(() => ['admin', 'operador'].includes(authStore.user?.role))

// Dados do formulário
const tipoMovimento = ref('entrada')
const materialSelecionadoId = ref('') // Guarda o ID do material escolhido
const quantidade = ref(1)
const observacao = ref('')

// Controle da Busca Inteligente
const termoBusca = ref('') // O que você digita
const mostrarLista = ref(false) // Abre/fecha a lista

// Listas de dados
const materials = ref([])
const history = ref([])
const isLoading = ref(false)
const message = ref({ text: '', type: '' })

// Carrega dados ao abrir
onMounted(async () => {
  isLoading.value = true
  try {
    const data = await fetchMaterials()
    // Garante que é array
    materials.value = Array.isArray(data) ? data : (data.materials || [])
    history.value = await fetchMovements()
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
})

// --- LÓGICA DE FILTRO (BUSCA) ---
const materiaisFiltrados = computed(() => {
  if (!termoBusca.value) {
    return [] 
  }
  const termo = termoBusca.value.toLowerCase()
  
  // Filtra por CÓDIGO ou DESCRIÇÃO
  return materials.value.filter(m => 
    String(m.codigo || '').toLowerCase().includes(termo) ||
    String(m.descricao || '').toLowerCase().includes(termo)
  ).slice(0, 50) 
})

// Quando clica em um material da lista
function selecionarMaterial(material) {
  materialSelecionadoId.value = material.id
  // Preenche o campo de busca com o nome escolhido para ficar visível
  termoBusca.value = `${material.codigo} - ${material.descricao}`
  mostrarLista.value = false // Esconde a lista
}

// Limpar seleção
function limparSelecao() {
  materialSelecionadoId.value = ''
  termoBusca.value = ''
  mostrarLista.value = false
}

// Pega o nome do material para o histórico
const getMaterialName = (id) => {
  const m = materials.value.find(item => item.id == id)
  return m ? m.descricao : 'Material excluído ou desconhecido'
}

// Envia o formulário
async function handleSubmit() {
  // Proteção extra: Se não tiver permissão, nem tenta enviar
  if (!podeMover.value) {
    message.value = { text: 'Acesso negado.', type: 'error' }
    return
  }

  if (!materialSelecionadoId.value || quantidade.value <= 0) {
    message.value = { text: 'Selecione um material e uma quantidade válida.', type: 'error' }
    return
  }

  message.value = { text: 'Processando...', type: 'info' }
  
  try {
    await createMovement({
      materialId: materialSelecionadoId.value,
      tipo: tipoMovimento.value,
      quantidade: quantidade.value,
      observacao: observacao.value
    })

    message.value = { text: 'Movimentação registrada com sucesso!', type: 'success' }
    
    // Limpa campos
    quantidade.value = 1
    observacao.value = ''
    limparSelecao() 
    
    // Atualiza listas
    history.value = await fetchMovements()
    const data = await fetchMaterials()
    materials.value = Array.isArray(data) ? data : (data.materials || [])

  } catch (err) {
    message.value = { text: err.message, type: 'error' }
  }
}
</script>

<template>
  <Layout>
    <div class="max-w-6xl mx-auto px-4 py-8">
      <h2 class="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-2">
        <Package class="w-8 h-8 text-blue-600" />
        Controle de Movimentação
      </h2>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div class="lg:col-span-1">
          <div class="bg-white p-6 rounded-xl shadow-md border border-gray-100 sticky top-4">
            <h3 class="text-lg font-semibold mb-4 text-gray-700">Registrar Nova</h3>
            
            <div v-if="message.text" :class="`p-3 mb-4 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`">
              {{ message.text }}
            </div>

            <form @submit.prevent="handleSubmit" class="space-y-4">
              
              <div class="grid grid-cols-2 gap-3">
                <button 
                  type="button"
                  @click="tipoMovimento = 'entrada'"
                  :class="`p-3 rounded-lg border flex flex-col items-center justify-center gap-2 transition-all ${tipoMovimento === 'entrada' ? 'bg-green-50 border-green-500 text-green-700 ring-1 ring-green-500' : 'bg-white border-gray-200 hover:bg-gray-50'}`"
                >
                  <ArrowUpCircle class="w-6 h-6" />
                  <span class="font-medium">Entrada</span>
                </button>
                <button 
                  type="button"
                  @click="tipoMovimento = 'saida'"
                  :class="`p-3 rounded-lg border flex flex-col items-center justify-center gap-2 transition-all ${tipoMovimento === 'saida' ? 'bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500' : 'bg-white border-gray-200 hover:bg-gray-50'}`"
                >
                  <ArrowDownCircle class="w-6 h-6" />
                  <span class="font-medium">Saída</span>
                </button>
              </div>

              <div class="relative">
                <label class="block text-sm font-medium text-gray-700 mb-1">Buscar Material</label>
                
                <div class="relative">
                  <input 
                    type="text"
                    v-model="termoBusca"
                    @focus="mostrarLista = true"
                    placeholder="Digite Código ou Nome..."
                    class="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    autocomplete="off"
                  />
                  <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  
                  <button 
                    v-if="termoBusca" 
                    type="button" 
                    @click="limparSelecao"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X class="w-4 h-4" />
                  </button>
                </div>

                <div 
                  v-if="mostrarLista && termoBusca" 
                  class="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                >
                  <ul class="divide-y divide-gray-100">
                    <li v-if="materiaisFiltrados.length === 0" class="p-3 text-sm text-gray-500 text-center">
                      Nenhum material encontrado com esse código/nome.
                    </li>
                    <li 
                      v-for="m in materiaisFiltrados" 
                      :key="m.id"
                      @click="selecionarMaterial(m)"
                      class="p-3 hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <div class="font-medium text-gray-900 text-sm">
                        <span class="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs text-gray-600 mr-2">{{ m.codigo }}</span>
                        {{ m.descricao }}
                      </div>
                      <div class="text-xs text-gray-500 mt-1">
                        Saldo Atual: <span class="font-bold">{{ m.quantidade }} {{ m.unidade }}</span>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                <input 
                  v-model.number="quantidade" 
                  type="number" 
                  min="0.01" 
                  step="0.01"
                  class="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Observação</label>
                <input 
                  v-model="observacao" 
                  type="text" 
                  class="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ex: Nota fiscal 123"
                />
              </div>

              <button 
                v-if="podeMover"
                type="submit" 
                class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-colors disabled:opacity-50"
                :disabled="!materialSelecionadoId"
              >
                Confirmar {{ tipoMovimento === 'entrada' ? 'Entrada' : 'Saída' }}
              </button>

              <div v-else class="flex flex-col items-center justify-center p-4 bg-gray-100 rounded-lg border border-gray-200 text-center">
                <Lock class="w-6 h-6 text-gray-400 mb-2" />
                <p class="text-sm font-medium text-gray-600">Modo Visualização</p>
                <p class="text-xs text-gray-500 mt-1">Você não tem permissão para movimentar o estoque.</p>
              </div>

            </form>
          </div>
        </div>

        <div class="lg:col-span-2">
          <div class="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
            <div class="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h3 class="font-semibold text-gray-700 flex items-center gap-2">
                <History class="w-5 h-5" /> Histórico Recente
              </h3>
            </div>

            <div class="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              <div v-if="history.length === 0" class="p-8 text-center text-gray-500">
                Nenhuma movimentação registrada ainda.
              </div>

              <div v-for="item in history" :key="item.id" class="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div class="flex items-start gap-3">
                  <div :class="`p-2 rounded-full flex-shrink-0 ${item.tipo === 'entrada' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`">
                    <component :is="item.tipo === 'entrada' ? ArrowUpCircle : ArrowDownCircle" class="w-5 h-5" />
                  </div>
                  <div>
                    <p class="font-medium text-gray-900 line-clamp-1">{{ getMaterialName(item.materialId) }}</p>
                    <p class="text-sm text-gray-500">{{ new Date(item.data).toLocaleString() }}</p>
                    <p v-if="item.observacao" class="text-xs text-gray-400 mt-1">{{ item.observacao }}</p>
                  </div>
                </div>
                <div :class="`font-bold whitespace-nowrap ml-4 ${item.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`">
                  {{ item.tipo === 'entrada' ? '+' : '-' }}{{ item.quantidade }}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Layout>
</template>