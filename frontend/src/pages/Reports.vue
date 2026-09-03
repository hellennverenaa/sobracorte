<script setup>
import { ref, computed, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { FileSpreadsheet, Printer, Search, Calendar, Filter, FileBarChart } from 'lucide-vue-next'
import { api } from '@/services/httpClient'
import { useToast } from '@/composables/useToast'

// --- ESTADOS ---
const loading = ref(false)
const reportData = ref([])
const hasSearched = ref(false)
const reportPage = ref(1)
const reportMeta = ref({ page: 1, pageSize: 100, total: 0, totalPages: 1 })

const { notification, showNotification } = useToast()

// Filtros
const filters = ref({
  tipoMaterial: 'todos',
  periodo: 'mes_atual', // hoje, semana, mes_atual, ano_atual, custom
  dataInicio: '',
  dataFim: '',
  tipoMovimento: 'todos' // entrada, saida, todos
})

// Opções de Filtro Sincronizadas
const materialTypes = ref([
  { value: 'todos', label: 'Todos os Materiais' }
])

async function fetchCategories() {
  try {
    const res = await api.get('/settings/categories')
    materialTypes.value = [
      { value: 'todos', label: 'Todos os Materiais' },
      ...res.data.map(cat => ({
        value: cat.name.toLowerCase(),
        label: cat.name.charAt(0).toUpperCase() + cat.name.slice(1).toLowerCase()
      }))
    ]
  } catch (err) {
    console.error("Erro ao carregar categorias para o relatório:", err)
  }
}

onMounted(() => {
  fetchCategories()
})

const periods = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Esta Semana' },
  { value: 'mes_atual', label: 'Este Mês' },
  { value: 'ano_atual', label: 'Este Ano' },
  { value: 'custom', label: 'Personalizado' }
]

// --- LÓGICA DE DATAS (Para Enviar ao Backend) ---
function getDatesFromPeriod(period) {
  const now = new Date()
  let start = new Date()
  let end = new Date()

  if (period === 'hoje') {
    start.setHours(0,0,0,0)
    end.setHours(23,59,59,999)
  } else if (period === 'semana') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Ajuste para segunda-feira
    start = new Date(now.setDate(diff))
    start.setHours(0,0,0,0)
    end = new Date() // Fim é hoje
  } else if (period === 'mes_atual') {
    start.setDate(1)
    start.setHours(0,0,0,0)
    end = new Date()
  } else if (period === 'ano_atual') {
    start.setMonth(0, 1)
    start.setHours(0,0,0,0)
    end = new Date()
  } else if (period === 'custom') {
    if (!filters.value.dataInicio || !filters.value.dataFim) return null
    start = new Date(filters.value.dataInicio + 'T00:00:00')
    end = new Date(filters.value.dataFim + 'T23:59:59')
  }
  
  const localDate = value => {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return { 
    start: localDate(start),
    end: localDate(end)
  }
}

function reportParams() {
  const dates = getDatesFromPeriod(filters.value.periodo)
  if (!dates) return null
  return {
    startDate: dates.start,
    endDate: dates.end,
    category: filters.value.tipoMaterial === 'todos' ? undefined : filters.value.tipoMaterial,
    type: filters.value.tipoMovimento === 'todos' ? undefined : filters.value.tipoMovimento,
  }
}

async function generateReport(page = 1) {
  loading.value = true
  hasSearched.value = true
  reportData.value = []

  try {
    const params = reportParams()
    if (!params) {
      showNotification('error', "Selecione as datas de início e fim para o período personalizado.")
      return
    }
    const response = await api.get('/reports/movements', { params: { ...params, page, pageSize: reportMeta.value.pageSize } })
    reportData.value = response.data.data
    reportMeta.value = response.data.meta
    reportPage.value = response.data.meta.page

  } catch (err) {
    console.error(err)
    showNotification('error', "Erro ao gerar relatório. Verifique a conexão com o servidor.")
  } finally {
    loading.value = false
  }
}

// --- EXPORTAR EXCEL ---
async function downloadExcel() {
  if (!reportMeta.value.total) return
  try {
    const response = await api.get('/reports/movements/export', { params: reportParams(), responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `SobrasDASS_Relatorio_${filters.value.periodo}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    showNotification('error', 'Erro ao exportar o relatório completo.')
  }
}

// --- EXPORTAR PDF (Impressão) ---
function printPDF() {
  window.print()
}

// Totais Calculados (Para mostrar no rodapé da tabela, se você tiver um)
const totalsByUnit = computed(() => {
  const totals = new Map()
  for (const movement of reportData.value) {
    const unit = movement.material?.unit || 'sem unidade'
    const current = totals.get(unit) || { unit, entradas: 0, saidas: 0 }
    current[movement.type === 'entrada' ? 'entradas' : 'saidas'] += Number(movement.quantity)
    totals.set(unit, current)
  }
  return [...totals.values()]
})

</script>

<template>
  <Layout>
    <div v-if="notification.show" :class="notification.type === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'"
      class="fixed top-4 right-4 px-4 py-3 rounded border shadow-lg z-[100]">
      {{ notification.message }}
    </div>

    <div class="max-w-6xl mx-auto px-4 py-8">
      
      <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 print:hidden">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileBarChart class="w-6 h-6 text-indigo-600" /> Central de Relatórios
          </h2>
          <p class="text-gray-500 text-sm">Exporte dados detalhados para análise.</p>
        </div>
      </div>

      <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 print:hidden">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Período</label>
            <div class="relative">
              <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select v-model="filters.periodo" class="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                <option v-for="p in periods" :key="p.value" :value="p.value">{{ p.label }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Tipo de Material</label>
            <div class="relative">
              <Filter class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select v-model="filters.tipoMaterial" class="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                <option v-for="t in materialTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Movimentação</label>
            <select v-model="filters.tipoMovimento" class="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="todos">Entradas e Saídas</option>
              <option value="entrada">Apenas Entradas</option>
              <option value="saida">Apenas Saídas</option>
            </select>
          </div>

          <div class="flex items-end">
            <button @click="generateReport(1)" :disabled="loading" class="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              <Search v-if="!loading" class="w-4 h-4" />
              {{ loading ? 'Processando...' : 'Gerar Relatório' }}
            </button>
          </div>
        </div>

        <div v-if="filters.periodo === 'custom'" class="grid grid-cols-2 gap-4 mt-4 bg-indigo-50 p-4 rounded-xl">
           <div><label class="text-xs font-bold uppercase">De:</label><input v-model="filters.dataInicio" type="date" class="w-full p-2 rounded-lg border" /></div>
           <div><label class="text-xs font-bold uppercase">Até:</label><input v-model="filters.dataFim" type="date" class="w-full p-2 rounded-lg border" /></div>
        </div>
      </div>

      <div v-if="hasSearched" class="animate-fade-in-up">
        
        <div class="flex justify-between items-center mb-4 print:hidden">
          <div class="text-sm text-gray-500">
            Encontrados <strong>{{ reportMeta.total }}</strong> registros.
          </div>
          <div class="flex gap-2" v-if="reportMeta.total > 0">
            <button @click="printPDF" class="bg-gray-800 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-900">
              <Printer class="w-4 h-4" /> Imprimir página / PDF
            </button>
            <button @click="downloadExcel" class="bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-green-700">
              <FileSpreadsheet class="w-4 h-4" /> Excel
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:border-0 print:overflow-visible print:w-full">
          
          <div class="hidden print:block p-8 text-center border-b border-gray-200">
            <h1 class="text-3xl font-black text-slate-900">Sobras DASS</h1>
            <p class="text-gray-500">Relatório de Controle de Estoque</p>
            <p class="text-xs mt-2">Gerado em: {{ new Date().toLocaleString() }}</p>
          </div>

          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider print:bg-gray-100 print:text-black">
              <tr>
                <th class="p-4">Data</th>
                <th class="p-4">Tipo</th>
                <th class="p-4">Material</th>
                <th class="p-4">Categoria</th>
                <th class="p-4 text-center">Origem</th>
                <th class="p-4 text-right">Qtd</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs print:divide-gray-300">
              <tr v-for="row in reportData" :key="row.id">
                <td class="p-4 text-gray-600">
                  {{ new Date(row.createdAt).toLocaleDateString('pt-BR') }} <span class="text-gray-400">{{ new Date(row.createdAt).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) }}</span>
                </td>
                <td class="p-4">
                  <span class="font-bold uppercase" :class="row.type === 'entrada' ? 'text-red-600' : 'text-green-600'">{{ row.type }}</span>
                </td>
                <td class="p-4 font-bold text-gray-900">
                  {{ row.material?.name || '-' }}
                  <span v-if="row.material?.code" class="block text-[9px] text-gray-400 font-mono">{{ row.material.code }}</span>
                </td>
                <td class="p-4 capitalize text-gray-600">{{ row.material?.categoryName || '-' }}</td>
                <td class="p-4 text-center text-xs font-bold text-blue-600 uppercase">{{ row.originName || '-' }}</td>
                <td class="p-4 text-right font-bold text-gray-800">
                  {{ row.quantity }} <span class="text-[9px] text-gray-400">{{ row.material?.unit }}</span>
                </td>
              </tr>
              <tr v-if="reportData.length === 0">
                <td colspan="6" class="p-8 text-center text-gray-400 italic">Nenhum dado encontrado para os filtros selecionados.</td>
              </tr>
            </tbody>
            <tfoot v-if="reportData.length > 0" class="bg-gray-50 font-bold text-sm border-t-2 border-gray-200 print:bg-gray-100">
              <tr>
                <td colspan="3" class="p-4 text-right">TOTAIS DO PERÍODO:</td>
                <td colspan="3" class="p-4 text-right">
                  <div v-for="total in totalsByUnit" :key="total.unit" class="mb-1">
                    <span class="text-slate-500">{{ total.unit }} — </span>
                    <span class="text-green-600">Saídas: {{ total.saidas.toLocaleString('pt-BR') }}</span>
                    <span class="text-red-600 ml-2">Entradas: {{ total.entradas.toLocaleString('pt-BR') }}</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
          <div v-if="reportMeta.totalPages > 1" class="flex items-center justify-between border-t px-4 py-3 text-xs text-gray-500 print:hidden">
            <span>Página {{ reportPage }} de {{ reportMeta.totalPages }}</span>
            <div class="flex gap-2">
              <button class="px-3 py-1 border rounded disabled:opacity-40" :disabled="reportPage <= 1 || loading" @click="generateReport(reportPage - 1)">Anterior</button>
              <button class="px-3 py-1 border rounded disabled:opacity-40" :disabled="reportPage >= reportMeta.totalPages || loading" @click="generateReport(reportPage + 1)">Próxima</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </Layout>
</template>

<style>
@page {
  margin: 0cm; 
}

@media print {
  body { background: white !important; }
  aside, header, footer, nav { display: none !important; }
  .print\:hidden { display: none !important; }
  .print\:block { display: block !important; }
  
  * {
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    min-height: auto !important;
  }

  #app, main { 
    margin: 0 !important; 
    padding: 0 !important;
    width: 100% !important;
  }

  /* Garante que uma linha (tr) da tabela não seja cortada no meio entre as páginas */
  table { width: 100% !important; }
  tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
</style>
