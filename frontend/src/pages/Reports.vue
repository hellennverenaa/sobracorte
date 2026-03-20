<script setup>
import { ref, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from '@/composables/useApi'
import { FileSpreadsheet, Printer, Search, Calendar, Filter, FileText, FileBarChart } from 'lucide-vue-next'
import { exportToCSV } from '@/utils/export'

const { request } = useApi()

// --- ESTADOS ---
const loading = ref(false)
const reportData = ref([])
const hasSearched = ref(false)

// Filtros
const filters = ref({
  tipoMaterial: 'todos',
  periodo: 'mes_atual', // hoje, semana, mes_atual, ano_atual, custom
  dataInicio: '',
  dataFim: '',
  tipoMovimento: 'todos' // entrada, saida, todos
})

// Opções de Filtro
const materialTypes = [
  { value: 'todos', label: 'Todos os Materiais' },
  { value: 'couro', label: 'Couro' },
  { value: 'sintetico', label: 'Sintético' },
  { value: 'tecido', label: 'Tecido' },
  { value: 'solado', label: 'Solado' },
  { value: 'quimico', label: 'Químico' },
  { value: 'filme', label: 'Filme' }, // Adicionado para fechar com o dashboard
  { value: 'forro', label: 'Forro' }
]

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
  
  // Retorna as datas em formato ISO para o Backend entender
  return { 
    start: start.toISOString(), 
    end: end.toISOString() 
  }
}

// --- GERAR RELATÓRIO (Buscando do PostgreSQL) ---
async function generateReport() {
  loading.value = true
  hasSearched.value = true
  reportData.value = []

  try {
    const dates = getDatesFromPeriod(filters.value.periodo)
    if (!dates) {
      alert("Selecione as datas de início e fim.")
      loading.value = false
      return
    }

    // A MÁGICA: O Backend (Postgres) faz a busca pesada por data usando nossos índices!
    const queryUrl = `/reports/movements?dataInicio=${dates.start}&dataFim=${dates.end}`
    const apiData = await request(queryUrl)

    // O Frontend faz apenas os filtros "leves" de interface (Material e Tipo de Movimento)
    reportData.value = apiData.filter(mov => {
      // 1. Filtro de Tipo de Material (se aplicável, dependendo de como está salvo no material)
      // Como a rota /reports/movements não traz a categoria do material por padrão (só nome/código), 
      // se a DASS precisar filtrar muito por categoria, teremos que adicionar 'type' no ReportController depois.
      // Por enquanto, vamos pular esse filtro e focar nos movimentos.

      // 2. Filtro de Tipo de Movimento (ENTRADA/SAIDA)
      if (filters.value.tipoMovimento !== 'todos') {
        if (mov.tipo.toLowerCase() !== filters.value.tipoMovimento.toLowerCase()) return false
      }
      return true
    })

  } catch (err) {
    console.error(err)
    alert("Erro ao gerar relatório. Verifique a conexão com o servidor.")
  } finally {
    loading.value = false
  }
}

// --- EXPORTAR EXCEL ---
function downloadExcel() {
  if (reportData.value.length === 0) return
  
  // O Backend já devolve quase pronto, só ajustamos a Data para o Excel Brasileiro
  const rows = reportData.value.map(mov => ({
    DATA: new Date(mov.data_hora).toLocaleDateString('pt-BR'),
    HORA: new Date(mov.data_hora).toLocaleTimeString('pt-BR'),
    TIPO_MOVIMENTO: mov.tipo,
    MATERIAL: mov.material?.descricao || mov.nomeMaterial || '-',
    CODIGO: mov.codigo,
    QUANTIDADE: Number(mov.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
    UNIDADE: mov.unidade,
    MOTIVO: mov.motivo,
    USUARIO: mov.responsavel
  }))

  exportToCSV(`SobrasDASS_Relatorio_${filters.value.periodo}`, rows)
}

// --- EXPORTAR PDF (Impressão) ---
function printPDF() {
  window.print()
}

// Totais Calculados (Para mostrar no rodapé da tabela, se você tiver um)
const totalEntradas = computed(() => reportData.value.filter(m => m.tipo.toLowerCase() === 'entrada').reduce((acc, cur) => acc + Number(cur.quantidade), 0))
const totalSaidas = computed(() => reportData.value.filter(m => m.tipo.toLowerCase() === 'saida').reduce((acc, cur) => acc + Number(cur.quantidade), 0))

</script>

<template>
  <Layout>
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
            <button @click="generateReport" :disabled="loading" class="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
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
            Encontrados <strong>{{ reportData.length }}</strong> registros.
          </div>
          <div class="flex gap-2" v-if="reportData.length > 0">
            <button @click="printPDF" class="bg-gray-800 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-900">
              <Printer class="w-4 h-4" /> Imprimir / PDF
            </button>
            <button @click="downloadExcel" class="bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-green-700">
              <FileSpreadsheet class="w-4 h-4" /> Excel
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:border-0">
          
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
                <th class="p-4 text-right">Qtd</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-xs print:divide-gray-300">
              <tr v-for="row in reportData" :key="row.id">
                <td class="p-4 text-gray-600">
                  {{ new Date(row.data).toLocaleDateString('pt-BR') }} <span class="text-gray-400">{{ new Date(row.data).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) }}</span>
                </td>
                <td class="p-4">
                  <span class="font-bold uppercase" :class="row.tipo === 'entrada' ? 'text-red-600' : 'text-green-600'">{{ row.tipo }}</span>
                </td>
                <td class="p-4 font-bold text-gray-900">
                  {{ (row.material?.descricao || row.nomeMaterial) }}
                  <span v-if="row.material?.codigo" class="block text-[9px] text-gray-400 font-mono">{{ row.material.codigo }}</span>
                </td>
                <td class="p-4 capitalize text-gray-600">{{ row.material?.tipo || '-' }}</td>
                <td class="p-4 text-right font-bold text-gray-800">
                  {{ row.quantidade }} <span class="text-[9px] text-gray-400">{{ row.material?.unidade }}</span>
                </td>
              </tr>
              <tr v-if="reportData.length === 0">
                <td colspan="5" class="p-8 text-center text-gray-400 italic">Nenhum dado encontrado para os filtros selecionados.</td>
              </tr>
            </tbody>
            <tfoot v-if="reportData.length > 0" class="bg-gray-50 font-bold text-sm border-t-2 border-gray-200 print:bg-gray-100">
              <tr>
                <td colspan="3" class="p-4 text-right">TOTAIS DO PERÍODO:</td>
                <td colspan="2" class="p-4 text-right">
                  <div class="text-green-600">Saídas: {{ totalSaidas.toLocaleString('pt-BR') }}</div>
                  <div class="text-red-600">Entradas: {{ totalEntradas.toLocaleString('pt-BR') }}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  </Layout>
</template>

<style>
@media print {
  body { background: white; }
  .print\:hidden { display: none !important; }
  .print\:block { display: block !important; }
  /* Esconde sidebar, layout extra, etc */
  aside, header, footer { display: none; }
  main { margin: 0; padding: 0; height: auto; overflow: visible; }
}
</style>