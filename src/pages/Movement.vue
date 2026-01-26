<script setup>
import { ref, watch, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { ArrowUpCircle, ArrowDownCircle, History, Filter, AlertTriangle, Search, Package, CheckCircle, X } from 'lucide-vue-next'

const { request, createMovement, updateMaterial } = useApi()
const authStore = useAuthStore()

// --- ESTADOS ---
const history = ref([])
const isLoadingHistory = ref(false)

// Formulário
const tipoMovimento = ref('saida')
const quantidade = ref(1)
const observacao = ref('')
const message = ref('')
const error = ref('')

// Busca de Material
const termoBuscaMaterial = ref('')
const resultadosBuscaMaterial = ref([])
const materialSelecionado = ref(null)
const buscandoMaterial = ref(false)

// Filtros Histórico
const filtroTipo = ref('todos')
const termoBuscaHistorico = ref('') 

// --- FUNÇÃO DE BUSCA SEGURA (A SALVAÇÃO) ---
// 1. Busca TUDO com 'q' (mais garantido de achar).
// 2. Filtra no Javascript para garantir que bate com Código ou Descrição.
async function buscarMateriaisReal(termo) {
  if (!termo) return []
  try {
    const data = await request(`/materials?q=${termo}`)
    const lista = Array.isArray(data) ? data : (data.materials || [])
    
    // AQUI É A TRAVA DE SEGURANÇA:
    // Só aceita se o termo digitado estiver dentro do Código ou da Descrição.
    return lista.filter(m => {
      const s = termo.toLowerCase()
      const cod = String(m.codigo || '').toLowerCase()
      const desc = String(m.descricao || '').toLowerCase()
      return cod.includes(s) || desc.includes(s)
    })
  } catch (e) {
    return []
  }
}

// --- 1. BUSCA DE MATERIAL (ESQUERDA - FORMULÁRIO) ---
async function buscarMateriaisParaFormulario() {
  const termo = termoBuscaMaterial.value
  if (!termo || termo.length < 1) {
    resultadosBuscaMaterial.value = []
    return
  }
  
  buscandoMaterial.value = true
  resultadosBuscaMaterial.value = []

  try {
    const filtrados = await buscarMateriaisReal(termo)
    resultadosBuscaMaterial.value = filtrados.slice(0, 10)
  } catch (err) {
    console.error(err)
  } finally {
    buscandoMaterial.value = false
  }
}

watch(termoBuscaMaterial, (newVal) => {
  if (!materialSelecionado.value || newVal !== materialSelecionado.value.descricao) {
     // Pequeno delay para não buscar enquanto digita muito rápido
     setTimeout(buscarMateriaisParaFormulario, 300)
  }
})

function selecionarMaterial(mat) {
  materialSelecionado.value = mat
  termoBuscaMaterial.value = '' 
  resultadosBuscaMaterial.value = [] 
  error.value = ''
  // Limpa busca da direita para não confundir
  termoBuscaHistorico.value = ''
}

function limparSelecao() {
  materialSelecionado.value = null
  termoBuscaMaterial.value = ''
  loadHistory()
}

// --- 2. CARREGAR HISTÓRICO (DIREITA - CORRIGIDO) ---
async function loadHistory() {
  isLoadingHistory.value = true
  history.value = [] 

  try {
    const t = new Date().getTime()
    // Base da URL: Ordenar por ID decrescente (mais novos primeiro)
    let urlBase = `/movements?_sort=id&_order=desc&t=${t}`
    let filtrosExtras = ''

    // CENÁRIO A: Material Selecionado na Esquerda (Prioridade Total)
    if (materialSelecionado.value) {
      filtrosExtras += `&materialId=${materialSelecionado.value.id}`
      filtrosExtras += '&_limit=50' 
    }
    // CENÁRIO B: Busca no Campo da Direita
    else if (termoBuscaHistorico.value && termoBuscaHistorico.value.length > 0) {
      const termo = termoBuscaHistorico.value
      
      // 1. Primeiro, acha os MATERIAIS com esse código
      const materiaisEncontrados = await buscarMateriaisReal(termo)
      
      if (materiaisEncontrados.length > 0) {
        // 2. Pega os IDs deles e filtra o histórico
        // Ex: &materialId=10&materialId=11...
        const ids = materiaisEncontrados.map(m => m.id).slice(0, 20)
        filtrosExtras += '&' + ids.map(id => `materialId=${id}`).join('&')
      } else {
        // 3. Se não achou material, NÃO busca nada (para não mostrar "todas as entradas")
        isLoadingHistory.value = false
        return 
      }
    }
    // CENÁRIO C: Nada selecionado (Mostra últimos 50)
    else {
      filtrosExtras += '&_limit=50'
    }

    // Filtro de Tipo (Entrada/Saída)
    if (filtroTipo.value !== 'todos') {
      filtrosExtras += `&tipo=${filtroTipo.value}`
    }

    // Faz a busca final
    const data = await request(`${urlBase}${filtrosExtras}&_expand=material`)
    const rawList = Array.isArray(data) ? data : []
    
    // Filtra itens quebrados
    history.value = rawList.filter(item => item.tipo === 'exclusão' || (item.materialId && (item.material || item.nomeMaterial)))

  } catch (err) {
    console.error("Erro histórico:", err)
  } finally {
    isLoadingHistory.value = false
  }
}

watch([termoBuscaHistorico, filtroTipo], () => {
  setTimeout(() => loadHistory(), 500)
})

watch(materialSelecionado, () => {
  loadHistory()
})

// --- 3. SALVAR ---
async function save() {
  error.value = ''
  message.value = ''

  if (!materialSelecionado.value) {
    error.value = 'Selecione um material.'
    return
  }

  const qtd = Number(quantidade.value)
  if (qtd <= 0) {
    error.value = 'Qtd inválida.'
    return
  }

  let saldoAtual = Number(materialSelecionado.value.quantidade)
  let novoSaldo = 0
  
  if (tipoMovimento.value === 'saida') {
    if (qtd > saldoAtual) {
      error.value = `Saldo insuficiente! Disp: ${saldoAtual}`
      return
    }
    novoSaldo = saldoAtual - qtd
  } else {
    novoSaldo = saldoAtual + qtd
  }

  novoSaldo = Number(novoSaldo.toFixed(3))

  try {
    await updateMaterial(materialSelecionado.value.id, {
      quantidade: novoSaldo
    })

    const nomeAuditado = materialSelecionado.value.codigo 
      ? `${materialSelecionado.value.codigo} - ${materialSelecionado.value.descricao}`
      : materialSelecionado.value.descricao

    await createMovement({
      materialId: materialSelecionado.value.id,
      nomeMaterial: nomeAuditado, 
      tipo: tipoMovimento.value,
      quantidade: qtd,
      observacao: observacao.value,
      usuario: authStore.user?.nome || 'Sistema'
    })

    message.value = `Saldo Atualizado: ${novoSaldo}`
    materialSelecionado.value.quantidade = novoSaldo
    
    await loadHistory()
    
    quantidade.value = 1
    observacao.value = ''
    
    setTimeout(() => message.value = '', 4000)
  } catch (err) {
    error.value = 'Erro ao salvar.'
    console.error(err)
  }
}

onMounted(() => {
  loadHistory()
})
</script>

<template>
  <Layout>
    <div class="max-w-6xl mx-auto px-4 py-8 h-[calc(100vh-80px)] overflow-hidden flex flex-col">
      
      <div class="mb-6 flex-shrink-0">
        <h2 class="text-2xl font-bold text-gray-900">Movimentação</h2>
        <p class="text-sm text-gray-500">Registre entradas e saídas.</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full overflow-hidden pb-4">
        
        <div class="lg:col-span-1 flex flex-col overflow-y-auto">
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            
            <div class="flex bg-gray-100 p-1 rounded-xl mb-6">
              <button @click="tipoMovimento = 'entrada'" class="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all" :class="tipoMovimento === 'entrada' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
                <ArrowDownCircle class="w-4 h-4" /> Entrada (Custo)
              </button>
              <button @click="tipoMovimento = 'saida'" class="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all" :class="tipoMovimento === 'saida' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
                <ArrowUpCircle class="w-4 h-4" /> Saída (Lucro)
              </button>
            </div>

            <div class="mb-6 relative">
              <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Material</label>
              
              <div v-if="!materialSelecionado">
                <div class="relative">
                  <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input v-model="termoBuscaMaterial" type="text" placeholder="Digite CÓDIGO ou Nome..." class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                  <div v-if="buscandoMaterial" class="absolute right-3 top-1/2 -translate-y-1/2"><div class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
                </div>

                <div v-if="resultadosBuscaMaterial.length > 0" class="absolute z-10 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-60 overflow-y-auto">
                  <div v-for="mat in resultadosBuscaMaterial" :key="mat.id" @click="selecionarMaterial(mat)" class="p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-0">
                    <div class="font-bold text-gray-800 text-sm">{{ mat.descricao }}</div>
                    <div class="flex justify-between text-xs text-gray-500 mt-1">
                      <span class="bg-gray-100 px-1 rounded font-mono font-bold text-indigo-600">{{ mat.codigo || 'S/ Cód' }}</span>
                      <span>{{ mat.quantidade }} {{ mat.unidade }}</span>
                    </div>
                  </div>
                </div>
                <div v-else-if="termoBuscaMaterial.length > 2 && !buscandoMaterial" class="absolute z-10 w-full mt-2 bg-white p-3 text-center text-sm text-gray-500 rounded-xl shadow-xl border border-gray-100">
                  Nenhum material encontrado.
                </div>
              </div>

              <div v-else class="bg-indigo-50 border border-indigo-100 rounded-xl p-4 relative group">
                <button @click="limparSelecao" class="absolute top-2 right-2 text-indigo-400 hover:text-indigo-700 bg-white rounded-full p-1 shadow-sm" title="Trocar"><X class="w-3 h-3" /></button>
                <div class="flex items-start gap-3">
                  <div class="p-2 bg-white rounded-lg text-indigo-600 shadow-sm"><Package class="w-6 h-6" /></div>
                  <div>
                    <h4 class="font-bold text-gray-900 text-sm leading-tight">{{ materialSelecionado.descricao }}</h4>
                    <p class="text-xs text-indigo-600 font-medium mt-1">
                      Saldo Atual: <span class="text-lg font-bold">{{ materialSelecionado.quantidade }}</span> {{ materialSelecionado.unidade }}
                    </p>
                    <p class="text-[10px] text-gray-400 mt-1 uppercase font-mono">Cód: {{ materialSelecionado.codigo }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Quantidade</label>
                <input v-model="quantidade" type="number" step="0.01" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-800 text-lg" />
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Observação</label>
                <textarea v-model="observacao" rows="2" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"></textarea>
              </div>

              <div v-if="error" class="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><AlertTriangle class="w-4 h-4" /> {{ error }}</div>
              <div v-if="message" class="p-3 bg-green-50 text-green-600 text-sm rounded-lg font-bold text-center flex items-center justify-center gap-2"><CheckCircle class="w-4 h-4" /> {{ message }}</div>

              <button @click="save" :disabled="!materialSelecionado" class="w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" :class="tipoMovimento === 'entrada' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'">
                Confirmar {{ tipoMovimento === 'entrada' ? 'Entrada' : 'Saída' }}
              </button>
            </div>
          </div>
        </div>

        <div class="lg:col-span-2 h-full flex flex-col overflow-hidden">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
            
            <div class="p-4 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
              <div class="flex flex-col md:flex-row justify-between items-center gap-3">
                <h3 class="font-bold text-gray-900 flex items-center gap-2"><History class="w-5 h-5 text-gray-400" /> Histórico</h3>
                <div class="flex gap-3 w-full md:w-auto">
                  <div class="relative flex-grow">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input v-model="termoBuscaHistorico" type="text" placeholder="Buscar histórico por CÓDIGO ou Nome..." class="pl-9 pr-8 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-48 shadow-sm" :disabled="materialSelecionado" />
                    <button v-if="termoBuscaHistorico" @click="termoBuscaHistorico = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"><X class="w-3 h-3" /></button>
                  </div>
                  <div class="flex items-center gap-2 text-sm text-gray-500 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
                    <Filter class="w-4 h-4" />
                    <select v-model="filtroTipo" class="bg-transparent outline-none cursor-pointer hover:text-indigo-600"><option value="todos">Todos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex-grow overflow-y-auto relative bg-white">
              <div v-if="isLoadingHistory" class="absolute inset-0 bg-white/80 z-10 flex items-center justify-center"><div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>

              <table class="w-full text-left border-collapse">
                <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0 z-10 shadow-sm">
                  <tr><th class="p-4 w-32 bg-gray-50">Data</th><th class="p-4 bg-gray-50">Material</th><th class="p-4 w-24 bg-gray-50">Tipo</th><th class="p-4 w-20 bg-gray-50">Qtd</th><th class="p-4 w-32 bg-gray-50">Resp.</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-100 text-sm">
                  <tr v-for="item in history" :key="item.id" class="hover:bg-indigo-50/30 transition-colors">
                    <td class="p-4 text-gray-500 whitespace-nowrap text-xs">
                      <div class="font-bold">{{ new Date(item.data).toLocaleDateString('pt-BR') }}</div>
                      <div class="text-gray-400">{{ new Date(item.data).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) }}</div>
                    </td>
                    
                    <td class="p-4">
                      <div class="font-bold text-gray-800" :class="{'text-red-500 line-through': item.tipo === 'exclusão'}">
                        {{ (item.material ? item.material.descricao : null) || item.nomeMaterial || item.nome }}
                      </div>
                      <div v-if="item.material && item.material.codigo" class="text-[10px] text-gray-400 mt-0.5 font-mono">
                        Cód: {{ item.material.codigo }}
                      </div>
                      <div v-if="item.observacao" class="text-xs text-gray-500 mt-0.5 italic flex items-center gap-1">
                        <span class="w-1 h-1 bg-gray-300 rounded-full"></span> {{ item.observacao }}
                      </div>
                    </td>
                    
                    <td class="p-4">
                      <span class="px-2 py-1 rounded-md text-[10px] uppercase font-bold border tracking-wide" 
                        :class="{
                          'bg-red-50 text-red-700 border-red-100': item.tipo === 'entrada',
                          'bg-green-50 text-green-700 border-green-100': item.tipo === 'saida',
                          'bg-gray-200 text-gray-800 border-gray-300': item.tipo === 'exclusão'
                        }"
                      >
                         {{ item.tipo }}
                      </span>
                    </td>
                    <td class="p-4 font-bold text-gray-700 text-base">
                      {{ Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) }}
                    </td>
                    <td class="p-4 text-gray-500">
                       <div class="flex items-center gap-2">
                         <div class="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold border border-gray-200">{{ item.usuario ? item.usuario.charAt(0).toUpperCase() : '?' }}</div>
                         <span class="text-xs truncate max-w-[80px]" :title="item.usuario">{{ item.usuario || 'Sistema' }}</span>
                       </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-if="history.length === 0 && !isLoadingHistory" class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 mt-20">
                <History class="w-12 h-12 mb-3 text-gray-200" />
                <p class="font-medium">Nenhum registro encontrado.</p>
                <p v-if="termoBuscaHistorico" class="text-xs mt-1">Dica: Digite o CÓDIGO completo.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Layout>
</template>