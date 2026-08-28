<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import Layout from '@/components/Layout.vue';
import { useStockStore, SectorType } from '@/stores/stockStore';
import { useAuthStore } from '@/stores/auth';
import { 
  History, RefreshCw, User, Download
} from 'lucide-vue-next';

const stockStore = useStockStore();
const authStore = useAuthStore();

const filters = reactive({
  sector: '' as SectorType | '',
  type: '',
  operatorId: '',
  page: 1,
  limit: 25,
});

async function loadHistory() {
  const queryParams: any = {
    page: filters.page,
    limit: filters.limit,
  };
  if (filters.sector) queryParams.sector = filters.sector;
  if (filters.type) queryParams.type = filters.type;
  if (filters.operatorId.trim()) queryParams.operatorId = filters.operatorId.trim();

  await stockStore.fetchHistory(queryParams);
}

function exportCSV() {
  if (authStore.user?.role === 'leitor') return;
  if (!stockStore.history.data || stockStore.history.data.length === 0) return;

  const headers = ['ID', 'Data/Hora', 'Setor', 'Tipo', 'Detalhes', 'Quantidade', 'Operador', 'Matrícula', 'Motivo/Origem'];
  const rows = stockStore.history.data.map(mov => [
    mov.id,
    formatDate(mov.createdAt),
    mov.sector,
    mov.type,
    `"${formatItemDetails(mov.stockItem, mov).replace(/"/g, '""')}"`,
    mov.quantity,
    `"${(mov.operatorName || '').replace(/"/g, '""')}"`,
    mov.operatorId || '',
    `"${(mov.reason || mov.origem || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `historico_movimentacoes_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTypeBadge(type: string) {
  switch (type) {
    case 'ENTRADA':
      return { label: 'ENTRADA', class: 'bg-green-100 text-green-800 border-green-200' };
    case 'SAIDA':
      return { label: 'SAÍDA', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
    case 'REFUGO':
      return { label: 'REFUGO', class: 'bg-red-100 text-red-800 border-red-200' };
    case 'TRANSFERENCIA':
      return { label: 'TRANSFERÊNCIA', class: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'CASAMENTO_PAR':
      return { label: 'CASAMENTO DE PAR', class: 'bg-purple-100 text-purple-900 border-purple-200 font-bold' };
    case 'EXCLUSAO_CONFIGURACAO':
      return { label: 'EXCLUSÃO CONFIG', class: 'bg-rose-100 text-rose-900 border-rose-300 font-bold' };
    case 'EDICAO_CONFIGURACAO':
      return { label: 'EDIÇÃO CONFIG', class: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' };
    default:
      return { label: type, class: 'bg-gray-100 text-gray-800 border-gray-200' };
  }
}

function formatItemDetails(item: any, mov?: any) {
  if (mov && mov.sector === 'CONFIGURACOES') {
    return mov.origem || 'Configurações de Domínio';
  }
  if (!item) return '-';
  switch (item.sector) {
    case 'CORTE':
      return `${item.code || ''} - ${item.name || ''}`;
    case 'APOIO':
      return `${item.pieceCode || ''} (${item.description || ''}) - Gr. ${item.sizeGrade || ''}`;
    case 'PRE_FABRICADO':
      return `${item.productName || ''} (${item.color || ''}) - Gr. ${item.sizeGrade || ''}`;
    case 'EXPEDICAO':
      return `${item.sku || ''} (${item.color || ''}) - Gr. ${item.sizeGrade || ''}`;
    case 'MONTAGEM':
      return `${item.sku || ''} - Gr. ${item.sizeGrade || ''} (${item.footSide === 'E' ? 'Pé Esq.' : 'Pé Dir.'})`;
    default:
      return item.id ? `Item #${item.id}` : '-';
  }
}

onMounted(() => {
  loadHistory();
});
</script>

<template>
  <Layout>
    <div class="flex flex-col h-full">
      <!-- Top Bar -->
      <div class="flex flex-col sm:flex-row gap-3 items-center justify-between mx-4 my-4">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Histórico & Auditoria de Movimentações</h1>
          <p class="text-xs text-gray-500">Rastreabilidade completa de todas as entradas, saídas, transferências, casamentos de pares e configurações</p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Botão de Exportação Avançada (Oculto para perfil leitor) -->
          <button
            v-if="authStore.user?.role !== 'leitor'"
            @click="exportCSV"
            class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded flex items-center gap-1.5 shadow-sm text-xs font-bold transition-colors cursor-pointer"
            title="Exportar dados filtrados para CSV"
          >
            <Download class="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>

          <button
            @click="loadHistory"
            class="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-2 rounded flex items-center gap-1.5 shadow-sm text-xs font-medium transition-colors"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': stockStore.loading }" />
            <span>Atualizar Histórico</span>
          </button>
        </div>
      </div>

      <!-- Barra de Filtros Padrão Materials.vue -->
      <div class="bg-white p-4 rounded shadow-sm border border-gray-200 mx-4 mb-4 flex flex-col md:flex-row gap-4">
        <div class="w-full md:w-1/4">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Setor</label>
          <select
            v-model="filters.sector"
            @change="loadHistory"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-medium"
          >
            <option value="">TODOS OS SETORES</option>
            <option value="CORTE">CORTE</option>
            <option value="APOIO">APOIO</option>
            <option value="PRE_FABRICADO">PRÉ-FABRICADO (SOLAS)</option>
            <option value="EXPEDICAO">EXPEDIÇÃO (CABEDAIS)</option>
            <option value="MONTAGEM">MONTAGEM (PÉS ÓRFÃOS)</option>
            <option value="CONFIGURACOES">CONFIGURAÇÕES (DOMÍNIO)</option>
          </select>
        </div>

        <div class="w-full md:w-1/4">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Movimento</label>
          <select
            v-model="filters.type"
            @change="loadHistory"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-medium"
          >
            <option value="">TODOS OS TIPOS</option>
            <option value="ENTRADA">ENTRADA</option>
            <option value="SAIDA">SAÍDA / CONSUMO</option>
            <option value="REFUGO">REFUGO</option>
            <option value="TRANSFERENCIA">TRANSFERÊNCIA</option>
            <option value="CASAMENTO_PAR">CASAMENTO DE PAR</option>
            <option value="EXCLUSAO_CONFIGURACAO">EXCLUSÃO DE CONFIGURAÇÃO</option>
            <option value="EDICAO_CONFIGURACAO">EDIÇÃO DE CONFIGURAÇÃO</option>
          </select>
        </div>

        <div class="w-full md:w-1/4">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Matrícula Operador</label>
          <input
            v-model="filters.operatorId"
            @keyup.enter="loadHistory"
            type="text"
            placeholder="Ex: 12345"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 text-sm font-medium"
          />
        </div>

        <div class="w-full md:w-1/4 flex items-end">
          <button
            @click="loadHistory"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium p-2 rounded text-sm shadow-sm transition-colors"
          >
            Filtrar
          </button>
        </div>
      </div>

      <!-- Tabela de Auditoria Padrão Materials.vue -->
      <div class="flex-1 overflow-auto px-4 pb-4">
        <div class="bg-white rounded shadow border border-gray-200">
          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Data / Hora</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Setor</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Tipo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Item / Detalhes</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Quantidade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Operador (DASS)</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Motivo / Obs</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="mov in stockStore.history.data"
                :key="mov.id"
                class="hover:bg-gray-50 border-b last:border-b-0 transition-colors"
              >
                <td class="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                  {{ formatDate(mov.createdAt) }}
                </td>

                <td class="px-4 py-3 text-center">
                  <span class="px-2 py-0.5 text-xs bg-gray-100 rounded-full font-bold text-gray-600 border border-gray-200 uppercase">
                    {{ mov.sector }}
                  </span>
                </td>

                <td class="px-4 py-3 text-center">
                  <span
                    class="px-2 py-0.5 text-xs rounded-full font-bold border"
                    :class="getTypeBadge(mov.type).class"
                  >
                    {{ getTypeBadge(mov.type).label }}
                  </span>
                </td>

                <td class="px-4 py-3 text-sm text-gray-800 font-medium">
                  {{ formatItemDetails(mov.stockItem, mov) }}
                </td>

                <td class="px-4 py-3 text-right font-bold text-gray-800">
                  {{ mov.quantity }}
                  <span class="text-xs bg-blue-50 text-blue-800 px-1 rounded ml-1 border border-blue-100 font-mono font-semibold">
                    UN
                  </span>
                </td>

                <td class="px-4 py-3 text-sm text-gray-700">
                  <div class="flex items-center gap-1.5">
                    <User class="w-3.5 h-3.5 text-gray-400" />
                    <span>{{ mov.operatorName || mov.operatorId || 'Sistema' }}</span>
                    <span v-if="mov.operatorId" class="text-xs text-gray-400 font-mono">({{ mov.operatorId }})</span>
                  </div>
                </td>

                <td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" :title="mov.reason || mov.origem">
                  {{ mov.reason || mov.origem || '-' }}
                </td>
              </tr>

              <tr v-if="stockStore.history.data.length === 0">
                <td colspan="7" class="p-8 text-center text-gray-400 font-medium text-sm">
                  Nenhum registro de movimentação encontrado.
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Paginação -->
          <div v-if="stockStore.history.totalPages > 1" class="p-3 border-t border-gray-200 flex items-center justify-between text-xs bg-gray-50">
            <span class="text-gray-500 font-medium">
              Total de {{ stockStore.history.total }} registro(s)
            </span>

            <div class="flex items-center gap-2">
              <button
                :disabled="filters.page <= 1"
                @click="filters.page--; loadHistory()"
                class="px-3 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded font-medium disabled:opacity-40"
              >
                Anterior
              </button>
              <span class="font-bold text-gray-700">Pág. {{ filters.page }} de {{ stockStore.history.totalPages }}</span>
              <button
                :disabled="filters.page >= stockStore.history.totalPages"
                @click="filters.page++; loadHistory()"
                class="px-3 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded font-medium disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>
