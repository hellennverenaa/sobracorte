<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Layout from '@/components/Layout.vue';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/httpClient';
import { 
  ClipboardList, Plus, Search, X, RefreshCw, CheckCircle2, AlertCircle, 
  Clock, CheckCircle, Ban, MapPin, Scissors, Wrench, Layers, Box, Footprints,
  Eye, FileText
} from 'lucide-vue-next';

const authStore = useAuthStore();

interface RequisitionItem {
  id: string;
  code: string;
  requestSector: 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'EXPEDICAO' | 'MONTAGEM';
  sku: string;
  modelName: string;
  description: string;
  sizeGrade?: string;
  footSide?: 'E' | 'D' | null;
  quantityRequested: number;
  quantityFulfilled: number;
  reason: string;
  status: 'PENDENTE' | 'ATENDIDA_TOTAL' | 'ATENDIDA_PARCIAL' | 'CANCELADA';
  requesterName?: string;
  createdAt: string;
  stockAvailable: number;
  locations: string[];
}

const requisitions = ref<RequisitionItem[]>([]);
const totalCount = ref(0);
const currentPage = ref(1);
const totalPages = ref(1);
const loading = ref(false);

const filterStatus = ref('');
const filterSector = ref('');
const search = ref('');
const appliedSearch = ref('');

// Modal de Nova Requisição
const showCreateModal = ref(false);
const isSubmitting = ref(false);
const form = ref({
  requestSector: 'MONTAGEM' as 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'EXPEDICAO' | 'MONTAGEM',
  sku: '',
  modelName: '',
  description: '',
  sizeGrade: '',
  footSide: null as 'E' | 'D' | null,
  quantityRequested: 1,
  reason: '',
});

// Modal de Visualização de Detalhes
const viewingItem = ref<RequisitionItem | null>(null);

// Notificações Toast
const notification = ref({
  show: false,
  message: '',
  type: 'success' as 'success' | 'error',
});

function showToast(message: string, type: 'success' | 'error' = 'success') {
  notification.value = { show: true, message, type };
  setTimeout(() => {
    notification.value.show = false;
  }, 4000);
}

const sectorOptions = [
  { id: 'CORTE', label: 'Corte (Matéria-Prima)', icon: Scissors },
  { id: 'APOIO', label: 'Apoio (Peças Cortadas)', icon: Wrench },
  { id: 'PRE_FABRICADO', label: 'Pré-Fabricado (Solas)', icon: Layers },
  { id: 'EXPEDICAO', label: 'Cabedais', icon: Box },
  { id: 'MONTAGEM', label: 'Montagem', icon: Footprints },
];

async function loadRequisitions(page = currentPage.value) {
  loading.value = true;
  currentPage.value = page;
  try {
    const params: any = {
      page,
      limit: 20,
    };
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterSector.value) params.requestSector = filterSector.value;
    if (appliedSearch.value) params.search = appliedSearch.value;

    const res = await api.get('/requisitions', { params });
    requisitions.value = res.data.data || [];
    totalCount.value = res.data.total || 0;
    totalPages.value = res.data.totalPages || 1;
  } catch (error) {
    console.error('Erro ao carregar requisições:', error);
    showToast('Erro ao carregar requisições de reposição.', 'error');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  appliedSearch.value = search.value.trim();
  loadRequisitions(1);
}

function clearSearch() {
  search.value = '';
  appliedSearch.value = '';
  loadRequisitions(1);
}

function openCreate() {
  form.value = {
    requestSector: 'MONTAGEM',
    sku: '',
    modelName: '',
    description: '',
    sizeGrade: '',
    footSide: null,
    quantityRequested: 1,
    reason: '',
  };
  showCreateModal.value = true;
}

async function submitRequisition() {
  if (!form.value.sku.trim()) {
    showToast('O COD. PRODUTO / SKU é obrigatório.', 'error');
    return;
  }
  if (!form.value.modelName.trim()) {
    showToast('O Nome do Modelo / Linha é obrigatório.', 'error');
    return;
  }
  if (!form.value.description.trim()) {
    showToast('A Descrição da Peça / Material é obrigatória.', 'error');
    return;
  }
  if (!form.value.quantityRequested || form.value.quantityRequested <= 0) {
    showToast('A Quantidade solicitada deve ser maior que zero.', 'error');
    return;
  }
  if (!form.value.reason.trim()) {
    showToast('O Motivo da avaria/defeito é obrigatório.', 'error');
    return;
  }

  isSubmitting.value = true;
  try {
    await api.post('/requisitions', {
      ...form.value,
      sku: form.value.sku.toUpperCase().trim(),
      modelName: form.value.modelName.toUpperCase().trim(),
      description: form.value.description.toUpperCase().trim(),
      sizeGrade: form.value.sizeGrade ? form.value.sizeGrade.toUpperCase().trim() : undefined,
      reason: form.value.reason.toUpperCase().trim(),
    });

    showToast('Requisição de reposição aberta com sucesso!', 'success');
    showCreateModal.value = false;
    await loadRequisitions(1);
  } catch (error: any) {
    console.error('Erro ao abrir requisição:', error);
    const msg = error.response?.data?.error || 'Erro ao processar a requisição.';
    showToast(msg, 'error');
  } finally {
    isSubmitting.value = false;
  }
}

async function cancelItem(item: RequisitionItem) {
  if (!confirm(`Deseja realmente cancelar a requisição ${item.code}?`)) return;

  try {
    await api.patch(`/requisitions/${item.id}/cancel`);
    showToast(`Requisição ${item.code} cancelada.`, 'success');
    await loadRequisitions();
  } catch (error: any) {
    const msg = error.response?.data?.error || 'Erro ao cancelar requisição.';
    showToast(msg, 'error');
  }
}

// Métricas dos Cards do Topo
const stats = computed(() => {
  const total = totalCount.value;
  const pendingWithStock = requisitions.value.filter(
    (r) => r.status === 'PENDENTE' && r.stockAvailable >= r.quantityRequested
  ).length;
  const pendingNoStock = requisitions.value.filter(
    (r) => r.status === 'PENDENTE' && r.stockAvailable === 0
  ).length;
  const fulfilled = requisitions.value.filter(
    (r) => r.status === 'ATENDIDA_TOTAL' || r.status === 'ATENDIDA_PARCIAL'
  ).length;

  return { total, pendingWithStock, pendingNoStock, fulfilled };
});

function formatSectorName(sec: string) {
  const map: Record<string, string> = {
    CORTE: 'Corte',
    APOIO: 'Apoio',
    PRE_FABRICADO: 'Pré-Fabricado',
    EXPEDICAO: 'Cabedais',
    MONTAGEM: 'Montagem',
  };
  return map[sec] || sec;
}

function formatDate(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(() => {
  loadRequisitions(1);
});
</script>

<template>
  <Layout>
    <!-- Toast Notification -->
    <div
      v-if="notification.show"
      :class="notification.type === 'success'
        ? 'bg-green-100 border-green-400 text-green-700'
        : 'bg-red-100 border-red-400 text-red-700'"
      class="fixed top-4 right-4 px-4 py-3 rounded border shadow-lg z-50 flex items-center transition-all duration-300"
    >
      <span class="font-medium">{{ notification.message }}</span>
    </div>

    <div class="p-6 space-y-6 max-w-7xl mx-auto">
      <!-- Topbar / Cabeçalho -->
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div class="flex items-center gap-2.5">
            <div class="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ClipboardList class="w-6 h-6" />
            </div>
            <div>
              <h1 class="text-xl font-black text-slate-900 tracking-tight">Central de Requisições de Reposição</h1>
              <p class="text-xs text-slate-500 font-medium">Digitalização e rastreabilidade de reposição de peças danificadas na fábrica</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <button
            @click="loadRequisitions(currentPage)"
            :disabled="loading"
            class="px-3 py-2 text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="loading ? 'animate-spin' : ''" />
            <span>Atualizar</span>
          </button>

          <button
            @click="openCreate"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20"
          >
            <Plus class="w-4 h-4" />
            <span>Nova Solicitação</span>
          </button>
        </div>
      </div>

      <!-- Cards de Indicadores Rápidos -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div class="w-10 h-10 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center font-bold">
            <ClipboardList class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[11px] font-bold text-slate-400 uppercase">Total de Requisições</p>
            <p class="text-lg font-black text-slate-900">{{ stats.total }}</p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex items-center gap-3.5 bg-emerald-50/20">
          <div class="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
            <CheckCircle2 class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[11px] font-bold text-emerald-600 uppercase">Com Saldo em Sobras</p>
            <p class="text-lg font-black text-emerald-800">{{ stats.pendingWithStock }} <span class="text-xs font-medium text-emerald-600">(Página Atual)</span></p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex items-center gap-3.5 bg-rose-50/20">
          <div class="w-10 h-10 bg-rose-100 text-rose-700 rounded-xl flex items-center justify-center font-bold">
            <AlertCircle class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[11px] font-bold text-rose-600 uppercase">Sem Saldo (Acionar Corte)</p>
            <p class="text-lg font-black text-rose-800">{{ stats.pendingNoStock }} <span class="text-xs font-medium text-rose-600">(Página Atual)</span></p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div class="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold">
            <CheckCircle class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[11px] font-bold text-indigo-600 uppercase">Atendidas</p>
            <p class="text-lg font-black text-slate-900">{{ stats.fulfilled }}</p>
          </div>
        </div>
      </div>

      <!-- Filtros e Busca -->
      <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
        <div class="w-full md:w-1/4">
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
          <select
            v-model="filterStatus"
            @change="loadRequisitions(1)"
            class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-indigo-500 bg-white text-xs font-medium"
          >
            <option value="">Todos os Status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="ATENDIDA_TOTAL">Atendida Total</option>
            <option value="ATENDIDA_PARCIAL">Atendida Parcial</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </div>

        <div class="w-full md:w-1/4">
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Setor Solicitante</label>
          <select
            v-model="filterSector"
            @change="loadRequisitions(1)"
            class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-indigo-500 bg-white text-xs font-medium"
          >
            <option value="">Todos os Setores</option>
            <option value="CORTE">Corte</option>
            <option value="APOIO">Apoio</option>
            <option value="PRE_FABRICADO">Pré-Fabricado</option>
            <option value="EXPEDICAO">Cabedais</option>
            <option value="MONTAGEM">Montagem</option>
          </select>
        </div>

        <div class="w-full md:w-2/4">
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Buscar por Código, SKU, Modelo ou Solicitante</label>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <input
                v-model="search"
                @keydown.enter="handleSearch"
                type="text"
                placeholder="Ex: REQ-2026, SKU, Pegasus, Gáspea..."
                class="w-full border border-slate-200 py-2 pl-3 pr-8 rounded-xl outline-none focus:border-indigo-500 text-xs uppercase bg-white"
              />
              <button
                v-if="search"
                type="button"
                @click="clearSearch"
                class="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                title="Limpar"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              @click="handleSearch"
              class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Search class="w-3.5 h-3.5" />
              <span>Buscar</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Tabela de Requisições -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">CÓDIGO / DATA</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">SETOR & SOLICITANTE</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">ITEM / SKU & MODELO</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">GRADE / LADO</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-right">QTD.</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">DISPONIBILIDADE EM SOBRAS</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">STATUS</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">AÇÕES</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-xs">
              <tr v-if="loading && requisitions.length === 0">
                <td colspan="8" class="text-center py-8 text-slate-400 font-medium">Carregando solicitações de reposição...</td>
              </tr>
              <tr v-else-if="requisitions.length === 0">
                <td colspan="8" class="text-center py-8 text-slate-400 font-medium">Nenhuma requisição de reposição encontrada.</td>
              </tr>
              <tr
                v-for="item in requisitions"
                :key="item.id"
                class="hover:bg-slate-50/70 transition-colors"
              >
                <!-- Código / Data -->
                <td class="px-4 py-3">
                  <span class="font-mono font-bold text-indigo-600 block">{{ item.code }}</span>
                  <span class="text-[10.5px] text-slate-400">{{ formatDate(item.createdAt) }}</span>
                </td>

                <!-- Setor & Solicitante -->
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {{ formatSectorName(item.requestSector) }}
                  </span>
                  <span class="block text-[11px] text-slate-600 font-medium mt-0.5 truncate max-w-[140px]">
                    {{ item.requesterName || 'Operador' }}
                  </span>
                </td>

                <!-- Item / SKU & Modelo -->
                <td class="px-4 py-3">
                  <div class="font-bold text-slate-900 font-mono text-[11.5px]">{{ item.sku }}</div>
                  <div class="text-[11px] text-slate-700 font-medium">{{ item.modelName }}</div>
                  <div class="text-[10px] text-slate-400 italic truncate max-w-[180px]">{{ item.description }}</div>
                </td>

                <!-- Grade / Lado -->
                <td class="px-4 py-3 text-center">
                  <span v-if="item.sizeGrade" class="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono font-bold text-[10.5px]">
                    {{ item.sizeGrade }}
                  </span>
                  <span v-else class="text-slate-400">-</span>

                  <span
                    v-if="item.footSide"
                    class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                    :class="item.footSide === 'E' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'"
                  >
                    Pé {{ item.footSide === 'E' ? 'Esq.' : 'Dir.' }}
                  </span>
                </td>

                <!-- Quantidade -->
                <td class="px-4 py-3 text-right font-black text-slate-800 text-[12px]">
                  {{ item.quantityRequested }}
                </td>

                <!-- Disponibilidade em Tempo Real -->
                <td class="px-4 py-3 text-center">
                  <div v-if="item.stockAvailable >= item.quantityRequested" class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10.5px]">
                      <CheckCircle2 class="w-3.5 h-3.5" />
                      {{ item.stockAvailable }} un. em estoque
                    </span>
                    <span v-if="item.locations.length > 0" class="text-[10px] text-emerald-600 mt-0.5 truncate max-w-[180px]">
                      📍 {{ item.locations.join(', ') }}
                    </span>
                  </div>

                  <div v-else-if="item.stockAvailable > 0" class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-[10.5px]">
                      <Clock class="w-3.5 h-3.5" />
                      Parcial: {{ item.stockAvailable }} un.
                    </span>
                    <span v-if="item.locations.length > 0" class="text-[10px] text-amber-600 mt-0.5 truncate max-w-[180px]">
                      📍 {{ item.locations.join(', ') }}
                    </span>
                  </div>

                  <div v-else>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[10.5px]">
                      <AlertCircle class="w-3.5 h-3.5" />
                      0 disponível (Acionar Corte)
                    </span>
                  </div>
                </td>

                <!-- Status -->
                <td class="px-4 py-3 text-center">
                  <span
                    v-if="item.status === 'PENDENTE'"
                    class="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                  >
                    Pendente
                  </span>
                  <span
                    v-else-if="item.status === 'ATENDIDA_TOTAL'"
                    class="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"
                  >
                    Atendida
                  </span>
                  <span
                    v-else-if="item.status === 'ATENDIDA_PARCIAL'"
                    class="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-blue-100 text-blue-800 border border-blue-200"
                  >
                    Atendida Parcial
                  </span>
                  <span
                    v-else-if="item.status === 'CANCELADA'"
                    class="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-200 text-slate-600 border border-slate-300"
                  >
                    Cancelada
                  </span>
                </td>

                <!-- Ações -->
                <td class="px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <button
                      @click="viewingItem = item"
                      class="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Ver Detalhes"
                    >
                      <Eye class="w-4 h-4" />
                    </button>

                    <button
                      v-if="item.status === 'PENDENTE'"
                      @click="cancelItem(item)"
                      class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      title="Cancelar Solicitação"
                    >
                      <Ban class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginação -->
        <div v-if="totalPages > 1" class="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 text-xs">
          <span class="text-slate-500 font-medium">Página {{ currentPage }} de {{ totalPages }} ({{ totalCount }} registros)</span>
          <div class="flex gap-1.5">
            <button
              :disabled="currentPage <= 1"
              @click="loadRequisitions(currentPage - 1)"
              class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 disabled:opacity-40 font-bold hover:bg-slate-50"
            >
              Anterior
            </button>
            <button
              :disabled="currentPage >= totalPages"
              @click="loadRequisitions(currentPage + 1)"
              class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 disabled:opacity-40 font-bold hover:bg-slate-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Nova Solicitação -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200">
        <div class="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
          <div class="flex items-center gap-2">
            <ClipboardList class="w-5 h-5" />
            <h3 class="font-bold text-sm">Nova Solicitação de Reposição</h3>
          </div>
          <button @click="showCreateModal = false" class="text-white/80 hover:text-white font-bold text-lg">&times;</button>
        </div>

        <form @submit.prevent="submitRequisition" class="p-6 space-y-4 text-xs">
          <!-- Setor Solicitante -->
          <div>
            <label class="block font-bold text-slate-600 uppercase mb-1">Setor Solicitante *</label>
            <select
              v-model="form.requestSector"
              class="w-full border border-slate-200 p-2.5 rounded-xl font-medium outline-none focus:border-indigo-500 bg-white"
            >
              <option v-for="sec in sectorOptions" :key="sec.id" :value="sec.id">
                {{ sec.label }}
              </option>
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- COD. PRODUTO / SKU -->
            <div>
              <label class="block font-bold text-slate-600 uppercase mb-1">COD. PRODUTO / SKU *</label>
              <input
                v-model="form.sku"
                type="text"
                placeholder="Ex: NKE-PEG-38"
                class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500"
              />
            </div>

            <!-- NOME DO MODELO / LINHA -->
            <div>
              <label class="block font-bold text-slate-600 uppercase mb-1">NOME DO MODELO / LINHA *</label>
              <input
                v-model="form.modelName"
                type="text"
                placeholder="Ex: PEGASUS 40"
                class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <!-- Peça / Material -->
          <div>
            <label class="block font-bold text-slate-600 uppercase mb-1">Peça / Material Solicitado *</label>
            <input
              v-model="form.description"
              type="text"
              placeholder="Ex: Gáspea Externa, Sola de Borracha, Couro Bovino Preto..."
              class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <!-- Grade / Numeração -->
            <div>
              <label class="block font-bold text-slate-600 uppercase mb-1">Grade / Tamanho</label>
              <input
                v-model="form.sizeGrade"
                type="text"
                placeholder="Ex: 39/40"
                class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500"
              />
            </div>

            <!-- Lado do Pé -->
            <div>
              <label class="block font-bold text-slate-600 uppercase mb-1">Lado</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  @click="form.footSide = form.footSide === 'E' ? null : 'E'"
                  class="flex-1 py-2 rounded-xl font-bold border transition-all text-center"
                  :class="form.footSide === 'E'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'"
                >
                  Pé Esq. (E)
                </button>
                <button
                  type="button"
                  @click="form.footSide = form.footSide === 'D' ? null : 'D'"
                  class="flex-1 py-2 rounded-xl font-bold border transition-all text-center"
                  :class="form.footSide === 'D'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'"
                >
                  Pé Dir. (D)
                </button>
              </div>
            </div>

            <!-- Quantidade -->
            <div>
              <label class="block font-bold text-slate-600 uppercase mb-1">Quantidade *</label>
              <input
                v-model.number="form.quantityRequested"
                type="number"
                min="1"
                class="w-full border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <!-- Motivo do Defeito / Avaria -->
          <div>
            <label class="block font-bold text-slate-600 uppercase mb-1">Motivo da Avaria / Defeito *</label>
            <textarea
              v-model="form.reason"
              rows="2"
              placeholder="Ex: Quebra de agulha na costura, rasgo no corte, mancha de cola na montagem..."
              class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500"
            ></textarea>
          </div>

          <div class="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
            <button
              type="button"
              @click="showCreateModal = false"
              class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all"
            >
              Cancelar
            </button>

            <button
              type="submit"
              :disabled="isSubmitting"
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
            >
              <span v-if="isSubmitting">Processando...</span>
              <span v-else>Enviar Solicitação</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal Detalhes da Requisição -->
    <div
      v-if="viewingItem"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div class="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <div class="flex items-center gap-2">
            <FileText class="w-5 h-5 text-indigo-400" />
            <h3 class="font-bold text-sm">Detalhes da Requisição {{ viewingItem.code }}</h3>
          </div>
          <button @click="viewingItem = null" class="text-white/80 hover:text-white font-bold text-lg">&times;</button>
        </div>

        <div class="p-6 space-y-4 text-xs">
          <div class="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Setor Solicitante</span>
              <span class="font-bold text-slate-800">{{ formatSectorName(viewingItem.requestSector) }}</span>
            </div>
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Data de Abertura</span>
              <span class="font-bold text-slate-800">{{ formatDate(viewingItem.createdAt) }}</span>
            </div>
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Solicitante</span>
              <span class="font-bold text-slate-800">{{ viewingItem.requesterName || 'Operador' }}</span>
            </div>
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Status</span>
              <span class="font-bold text-indigo-600">{{ viewingItem.status }}</span>
            </div>
          </div>

          <div class="space-y-2">
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">COD. PRODUTO / SKU & Modelo</span>
              <p class="font-mono font-bold text-slate-900 text-sm">{{ viewingItem.sku }} — {{ viewingItem.modelName }}</p>
            </div>
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Peça / Material</span>
              <p class="font-medium text-slate-800">{{ viewingItem.description }}</p>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <span class="text-slate-400 font-bold uppercase block text-[10px]">Grade / Lado</span>
                <p class="font-bold text-slate-800">
                  {{ viewingItem.sizeGrade || 'N/A' }}
                  <span v-if="viewingItem.footSide">({{ viewingItem.footSide === 'E' ? 'Pé Esquerdo' : 'Pé Direito' }})</span>
                </p>
              </div>
              <div>
                <span class="text-slate-400 font-bold uppercase block text-[10px]">Qtd. Solicitada</span>
                <p class="font-black text-slate-900 text-sm">{{ viewingItem.quantityRequested }}</p>
              </div>
            </div>
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Motivo do Defeito</span>
              <p class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium">{{ viewingItem.reason }}</p>
            </div>
          </div>

          <!-- Disponibilidade no Estoque -->
          <div class="p-3 rounded-xl border" :class="viewingItem.stockAvailable > 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'">
            <div class="flex items-center justify-between">
              <span class="font-bold text-[11px]" :class="viewingItem.stockAvailable > 0 ? 'text-emerald-800' : 'text-rose-800'">
                Disponibilidade no Sobras DASS:
              </span>
              <span class="font-black text-sm" :class="viewingItem.stockAvailable > 0 ? 'text-emerald-700' : 'text-rose-700'">
                {{ viewingItem.stockAvailable }} un.
              </span>
            </div>
            <div v-if="viewingItem.locations.length > 0" class="mt-2 text-[11px] text-slate-600">
              <span class="font-bold block">Localizações / Prateleiras sugeridas:</span>
              <div class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="loc in viewingItem.locations"
                  :key="loc"
                  class="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono font-bold text-slate-700 text-[10.5px]"
                >
                  📍 {{ loc }}
                </span>
              </div>
            </div>
          </div>

          <div class="pt-2 flex justify-end">
            <button
              type="button"
              @click="viewingItem = null"
              class="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>
