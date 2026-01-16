<script setup>
import { ref, onMounted, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import { ArrowUpCircle, ArrowDownCircle, History, Package } from 'lucide-vue-next'
import { useApi } from '@/composables/useApi'

const { fetchMaterials, createMovement, fetchMovements } = useApi()

// Dados do formulário
const tipoMovimento = ref('entrada') // 'entrada' ou 'saida'
const materialSelecionado = ref('')
const quantidade = ref(1)
const observacao = ref('')

// Listas de dados
const materials = ref([])
const history = ref([])
const isLoading = ref(false)
const message = ref({ text: '', type: '' }) // Para mostrar sucesso ou erro

// Carrega os dados ao abrir a tela
onMounted(async () => {
  isLoading.value = true
  try {
    materials.value = await fetchMaterials()
    history.value = await fetchMovements()
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
})

// Pega o nome do material selecionado para exibir no histórico
const getMaterialName = (id) => {
  const m = materials.value.find(item => item.id == id)
  return m ? m.descricao : 'Material Desconhecido'
}

// Envia o formulário
async function handleSubmit() {
  if (!materialSelecionado.value || quantidade.value <= 0) {
    message.value = { text: 'Selecione um material e uma quantidade válida.', type: 'error' }
    return
  }

  message.value = { text: 'Processando...', type: 'info' }
  
  try {
    await createMovement({
      materialId: materialSelecionado.value,
      tipo: tipoMovimento.value,
      quantidade: quantidade.value,
      observacao: observacao.value
    })

    // Sucesso!
    message.value = { text: 'Movimentação registrada com sucesso!', type: 'success' }
    
    // Limpa o formulário e atualiza o histórico
    quantidade.value = 1
    observacao.value = ''
    history.value = await fetchMovements()
    
    // Recarrega materiais para atualizar o saldo na lista (opcional)
    materials.value = await fetchMaterials()

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

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Material</label>
                <select v-model="materialSelecionado" class="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required>
                  <option value="" disabled>Selecione...</option>
                  <option v-for="m in materials" :key="m.id" :value="m.id">
                    {{ m.codigo }} - {{ m.descricao }} (Saldo: {{ m.quantidade }})
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                <input 
                  v-model.number="quantidade" 
                  type="number" 
                  min="0.1" 
                  step="any"
                  class="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Observação (Opcional)</label>
                <input 
                  v-model="observacao" 
                  type="text" 
                  class="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ex: Nota fiscal 123"
                />
              </div>

              <button 
                type="submit" 
                class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-colors"
              >
                Confirmar {{ tipoMovimento === 'entrada' ? 'Entrada' : 'Saída' }}
              </button>
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

            <div class="divide-y divide-gray-100">
              <div v-if="history.length === 0" class="p-8 text-center text-gray-500">
                Nenhuma movimentação registrada ainda.
              </div>

              <div v-for="item in history" :key="item.id" class="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div class="flex items-start gap-3">
                  <div :class="`p-2 rounded-full ${item.tipo === 'entrada' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`">
                    <component :is="item.tipo === 'entrada' ? ArrowUpCircle : ArrowDownCircle" class="w-5 h-5" />
                  </div>
                  <div>
                    <p class="font-medium text-gray-900">{{ getMaterialName(item.materialId) }}</p>
                    <p class="text-sm text-gray-500">{{ new Date(item.data).toLocaleString() }}</p>
                    <p v-if="item.observacao" class="text-xs text-gray-400 mt-1">{{ item.observacao }}</p>
                  </div>
                </div>
                <div :class="`font-bold ${item.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`">
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