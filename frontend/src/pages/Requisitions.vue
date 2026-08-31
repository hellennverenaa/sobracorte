<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Layout from '@/components/Layout.vue';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/httpClient';
import { 
  ClipboardList, Plus, Search, X, RefreshCw, CheckCircle2, AlertCircle, 
  Clock, CheckCircle, Ban, MapPin, Scissors, Wrench, Layers, Box, Footprints,
  Eye, FileText, CheckCheck, PackageCheck, Trash2, ShieldAlert, AlertTriangle
} from 'lucide-vue-next';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

interface RequisitionItem {
  id: string;
  code: string;
  requestSector: 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'EXPEDICAO' | 'MONTAGEM';
  sku?: string;
  modelName?: string;
  description: string;
  sizeGrade?: string;
  footSide?: 'E' | 'D' | 'PAR' | null;
  quantityRequested: number;
  quantityFulfilled: number;
  reason: string;
  status: 'PENDENTE' | 'ATENDIDA_TOTAL' | 'ATENDIDA_PARCIAL' | 'CANCELADA';
  requesterName?: string;
  createdAt: string;
  stockAvailable: number;
  locations: string[];
  pairsDetail?: { esq: number; dir: number };
}

interface SkuSuggestion {
  sku: string;
  modelName: string;
  description: string;
  sizeGrades: string[];
  color: string;
  footSides: string[];
  availableQuantity: number;
}

interface StagedRequisitionItem {
  requestSector: 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'EXPEDICAO' | 'MONTAGEM';
  sku?: string;
  modelName?: string;
  description: string;
  sizeGrade?: string;
  footSide?: 'E' | 'D' | 'PAR' | null;
  quantityRequested: number;
  reason: string;
  stockAvailable: number;
  locations: string[];
  pairsDetail?: { esq: number; dir: number };
}

const requisitions = ref<RequisitionItem[]>([]);
const totalCount = ref(0);
const currentPage = ref(1);
const totalPages = ref(1);
const loading = ref(false);

const filterStatus = ref(route.query.status ? String(route.query.status) : '');
const filterSector = ref('');
const search = ref('');
const appliedSearch = ref('');
const onlyPendingWithStock = ref(false);

// Modal de Nova Requisição Multi-Itens
const showCreateModal = ref(false);
const isSubmitting = ref(false);
const stagedItems = ref<StagedRequisitionItem[]>([]);

// Formulário do item corrente
const currentSector = ref<'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'EXPEDICAO' | 'MONTAGEM'>('MONTAGEM');
const formItem = ref({
  sku: '',
  modelName: '',
  description: '',
  unit: 'UN',
  sizeGrade: '',
  footSide: null as 'E' | 'D' | 'PAR' | null,
  quantityRequested: 1,
  reason: '',
});

// Verificação de Saldo em Tempo Real (Trava Saldo Zero)
const checkingAvailability = ref(false);
const availabilityResult = ref<{
  checked: boolean;
  quantity: number;
  locations: string[];
  pairsDetail?: { esq: number; dir: number };
}>({
  checked: false,
  quantity: 0,
  locations: [],
});

// Autocomplete
const suggestions = ref<SkuSuggestion[]>([]);
const showSuggestions = ref(false);
const availableGrades = ref<string[]>([]);
let autocompleteTimer: ReturnType<typeof setTimeout> | null = null;
let availabilityDebounce: ReturnType<typeof setTimeout> | null = null;

// Modal de Atendimento (Fulfill)
const showFulfillModal = ref(false);
const fulfillingItem = ref<RequisitionItem | null>(null);
const fulfillQuantity = ref(1);
const fulfillObservation = ref('');
const isFulfilling = ref(false);

// Modal de Detalhes
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
  }, 4500);
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

// Consulta de Disponibilidade em Tempo Real com Trava de Saldo Zero
async function checkCurrentItemAvailability() {
  const desc = formItem.value.description.trim();
  const sku = formItem.value.sku.trim();

  if (!desc && !sku) {
    availabilityResult.value = { checked: false, quantity: 0, locations: [] };
    return;
  }

  checkingAvailability.value = true;
  try {
    const res = await api.post('/requisitions/check-availability', {
      requestSector: currentSector.value,
      sku: sku.toUpperCase() || undefined,
      modelName: formItem.value.modelName.trim().toUpperCase() || undefined,
      description: (desc || sku).toUpperCase(),
      sizeGrade: formItem.value.sizeGrade.trim().toUpperCase() || undefined,
      footSide: formItem.value.footSide || undefined,
    });

    availabilityResult.value = {
      checked: true,
      quantity: res.data?.quantity || 0,
      locations: res.data?.locations || [],
      pairsDetail: res.data?.pairsDetail,
    };
  } catch (err) {
    availabilityResult.value = { checked: true, quantity: 0, locations: [] };
  } finally {
    checkingAvailability.value = false;
  }
}

function triggerAvailabilityCheck() {
  if (availabilityDebounce) clearTimeout(availabilityDebounce);
  availabilityDebounce = setTimeout(checkCurrentItemAvailability, 300);
}

// Autocomplete ao digitar SKU / Código
function onSkuInput() {
  if (autocompleteTimer) clearTimeout(autocompleteTimer);
  const q = formItem.value.sku.trim();
  if (q.length < 2) {
    suggestions.value = [];
    showSuggestions.value = false;
    triggerAvailabilityCheck();
    return;
  }

  autocompleteTimer = setTimeout(async () => {
    try {
      const res = await api.get('/inventory/search-suggestions', {
        params: {
          sector: currentSector.value,
          q,
        },
      });
      suggestions.value = res.data || [];
      showSuggestions.value = suggestions.value.length > 0;
    } catch {
      suggestions.value = [];
      showSuggestions.value = false;
    } finally {
      triggerAvailabilityCheck();
    }
  }, 250);
}

function selectSuggestion(sug: SkuSuggestion) {
  formItem.value.sku = sug.sku;
  formItem.value.modelName = sug.modelName;
  formItem.value.description = sug.description;
  availableGrades.value = sug.sizeGrades || [];
  if (availableGrades.value.length === 1) {
    formItem.value.sizeGrade = availableGrades.value[0];
  }
  showSuggestions.value = false;
  checkCurrentItemAvailability();
}

function onSectorChange() {
  formItem.value = {
    sku: '',
    modelName: '',
    description: '',
    unit: 'UN',
    sizeGrade: '',
    footSide: null,
    quantityRequested: 1,
    reason: formItem.value.reason, // preserva o motivo comum se digitado
  };
  availableGrades.value = [];
  suggestions.value = [];
  showSuggestions.value = false;
  availabilityResult.value = { checked: false, quantity: 0, locations: [] };
}

function openCreate() {
  stagedItems.value = [];
  currentSector.value = 'MONTAGEM';
  onSectorChange();
  showCreateModal.value = true;
}

// Adicionar item à lista da requisição
function addCurrentItem() {
  const desc = formItem.value.description.trim() || formItem.value.sku.trim();
  if (!desc) {
    showToast('A identificação do item/material é obrigatória.', 'error');
    return;
  }

  if (currentSector.value !== 'CORTE' && !formItem.value.sku.trim()) {
    showToast('O COD. PRODUTO / SKU é obrigatório.', 'error');
    return;
  }

  if (formItem.value.quantityRequested <= 0) {
    showToast('A quantidade solicitada deve ser maior que zero.', 'error');
    return;
  }

  if (!formItem.value.reason.trim()) {
    showToast('O motivo da avaria/defeito é obrigatório.', 'error');
    return;
  }

  // TRAVA DE SALDO ZERO
  if (availabilityResult.value.checked && availabilityResult.value.quantity <= 0) {
    showToast('MATERIAL INDISPONÍVEL EM SOBRAS DASS. Favor acionar a programação regular de corte/compra.', 'error');
    return;
  }

  if (formItem.value.quantityRequested > availabilityResult.value.quantity) {
    showToast(`Quantidade solicitada (${formItem.value.quantityRequested}) excede o saldo físico disponível (${availabilityResult.value.quantity}).`, 'error');
    return;
  }

  stagedItems.value.push({
    requestSector: currentSector.value,
    sku: formItem.value.sku.trim().toUpperCase() || undefined,
    modelName: formItem.value.modelName.trim().toUpperCase() || (currentSector.value === 'CORTE' ? 'CORTE' : 'GERAL'),
    description: formItem.value.description.trim().toUpperCase() || formItem.value.sku.trim().toUpperCase(),
    sizeGrade: formItem.value.sizeGrade.trim().toUpperCase() || undefined,
    footSide: formItem.value.footSide || null,
    quantityRequested: formItem.value.quantityRequested,
    reason: formItem.value.reason.trim().toUpperCase(),
    stockAvailable: availabilityResult.value.quantity,
    locations: [...availabilityResult.value.locations],
    pairsDetail: availabilityResult.value.pairsDetail,
  });

  // Limpar formulário mantendo o setor
  const lastReason = formItem.value.reason;
  formItem.value = {
    sku: '',
    modelName: '',
    description: '',
    unit: 'UN',
    sizeGrade: '',
    footSide: null,
    quantityRequested: 1,
    reason: lastReason,
  };
  availableGrades.value = [];
  suggestions.value = [];
  showSuggestions.value = false;
  availabilityResult.value = { checked: false, quantity: 0, locations: [] };
  showToast('Item adicionado à lista da requisição.', 'success');
}

function removeStagedItem(index: number) {
  stagedItems.value.splice(index, 1);
}

// Submeter a requisição completa
async function submitRequisition() {
  if (stagedItems.value.length === 0) {
    // Se o operador não clicou em "Adicionar", tenta adicionar o item atual se válido
    if (availabilityResult.value.checked && availabilityResult.value.quantity > 0) {
      addCurrentItem();
    } else {
      showToast('Adicione pelo menos 1 item com saldo disponível à requisição.', 'error');
      return;
    }
  }

  if (stagedItems.value.length === 0) return;

  isSubmitting.value = true;
  try {
    const payload = {
      items: stagedItems.value.map((item) => ({
        requestSector: item.requestSector,
        sku: item.sku,
        modelName: item.modelName,
        description: item.description,
        sizeGrade: item.sizeGrade,
        footSide: item.footSide,
        quantityRequested: item.quantityRequested,
        reason: item.reason,
      })),
    };

    const res = await api.post('/requisitions', payload);
    const code = res.data?.code || 'REQ';

    showToast(`Requisição ${code} aberta com sucesso contendo ${stagedItems.value.length} item(ns)!`, 'success');
    showCreateModal.value = false;
    stagedItems.value = [];
    await loadRequisitions(1);
  } catch (error: any) {
    console.error('Erro ao abrir requisição:', error);
    const msg = error.response?.data?.error || 'Erro ao processar a requisição.';
    showToast(msg, 'error');
  } finally {
    isSubmitting.value = false;
  }
}

// Atendimento Rápido em 1 Clique
function openFulfill(item: RequisitionItem) {
  fulfillingItem.value = item;
  const pending = item.quantityRequested - item.quantityFulfilled;
  fulfillQuantity.value = Math.min(pending, item.stockAvailable || pending);
  fulfillObservation.value = '';
  showFulfillModal.value = true;
}

async function executeFulfill() {
  if (!fulfillingItem.value) return;
  if (fulfillQuantity.value <= 0) {
    showToast('A quantidade a atender deve ser maior que zero.', 'error');
    return;
  }

  isFulfilling.value = true;
  try {
    await api.post(`/requisitions/${fulfillingItem.value.id}/fulfill`, {
      quantity: fulfillQuantity.value,
      observation: fulfillObservation.value.trim(),
    });

    showToast(`Requisição ${fulfillingItem.value.code} atendida com sucesso! Estoque debitado.`, 'success');
    showFulfillModal.value = false;
    fulfillingItem.value = null;
    await loadRequisitions();
  } catch (error: any) {
    console.error('Erro ao atender requisição:', error);
    const msg = error.response?.data?.error || 'Erro ao processar atendimento.';
    showToast(msg, 'error');
  } finally {
    isFulfilling.value = false;
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

const displayedRequisitions = computed(() => {
  if (!onlyPendingWithStock.value) return requisitions.value;
  return requisitions.value.filter(
    (r) => (r.status === 'PENDENTE' || r.status === 'ATENDIDA_PARCIAL') && r.stockAvailable > 0
  );
});

const stats = computed(() => {
  const total = totalCount.value;
  const pendingWithStock = requisitions.value.filter(
    (r) => (r.status === 'PENDENTE' || r.status === 'ATENDIDA_PARCIAL') && r.stockAvailable >= (r.quantityRequested - r.quantityFulfilled)
  ).length;
  const pendingNoStock = requisitions.value.filter(
    (r) => (r.status === 'PENDENTE' || r.status === 'ATENDIDA_PARCIAL') && r.stockAvailable === 0
  ).length;
  const fulfilled = requisitions.value.filter(
    (r) => r.status === 'ATENDIDA_TOTAL'
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

watch(() => route.query.status, (newStatus) => {
  if (newStatus) {
    filterStatus.value = String(newStatus);
    loadRequisitions(1);
  }
});

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
      class="fixed top-4 right-4 px-4 py-3 rounded-xl border shadow-lg z-50 flex items-center transition-all duration-300 max-w-md"
    >
      <span class="font-medium text-xs">{{ notification.message }}</span>
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
              <p class="text-xs text-slate-500 font-medium">Digitalização, multi-itens e verificação inteligente de sobras na fábrica</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
          <button
            @click="onlyPendingWithStock = !onlyPendingWithStock"
            class="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border"
            :class="onlyPendingWithStock
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'"
          >
            <PackageCheck class="w-4 h-4" />
            <span>Prontos p/ Atendimento</span>
          </button>

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
            <p class="text-[11px] font-bold text-slate-400 uppercase">Total de Itens Solicitados</p>
            <p class="text-lg font-black text-slate-900">{{ stats.total }}</p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex items-center gap-3.5 bg-emerald-50/20">
          <div class="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
            <CheckCircle2 class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[11px] font-bold text-emerald-600 uppercase">Com Saldo em Sobras</p>
            <p class="text-lg font-black text-emerald-800">{{ stats.pendingWithStock }} <span class="text-xs font-medium text-emerald-600">(Pronto p/ Baixa)</span></p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex items-center gap-3.5 bg-rose-50/20">
          <div class="w-10 h-10 bg-rose-100 text-rose-700 rounded-xl flex items-center justify-center font-bold">
            <AlertCircle class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[11px] font-bold text-rose-600 uppercase">Sem Saldo (Acionar Corte)</p>
            <p class="text-lg font-black text-rose-800">{{ stats.pendingNoStock }}</p>
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
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-right">QTD. SOLIC.</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">DISPONIBILIDADE EM SOBRAS</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">STATUS</th>
                <th class="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">AÇÕES</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-xs">
              <tr v-if="loading && displayedRequisitions.length === 0">
                <td colspan="8" class="text-center py-8 text-slate-400 font-medium">Carregando solicitações de reposição...</td>
              </tr>
              <tr v-else-if="displayedRequisitions.length === 0">
                <td colspan="8" class="text-center py-8 text-slate-400 font-medium">Nenhuma requisição de reposição encontrada.</td>
              </tr>
              <tr
                v-for="item in displayedRequisitions"
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
                  <div v-if="item.sku" class="font-bold text-slate-900 font-mono text-[11.5px]">{{ item.sku }}</div>
                  <div v-if="item.modelName" class="text-[11px] text-slate-700 font-medium">{{ item.modelName }}</div>
                  <div class="text-[10.5px] text-slate-500 italic truncate max-w-[180px]">{{ item.description }}</div>
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
                    :class="item.footSide === 'E'
                      ? 'bg-amber-100 text-amber-800'
                      : item.footSide === 'D'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-indigo-100 text-indigo-800'"
                  >
                    {{ item.footSide === 'E' ? 'Pé Esq.' : item.footSide === 'D' ? 'Pé Dir.' : 'Par Completo' }}
                  </span>
                </td>

                <!-- Quantidade -->
                <td class="px-4 py-3 text-right font-black text-slate-800 text-[12px]">
                  <span>{{ item.quantityRequested }}</span>
                  <span v-if="item.quantityFulfilled > 0" class="block text-[10px] text-slate-400 font-normal">
                    (Atendido: {{ item.quantityFulfilled }})
                  </span>
                </td>

                <!-- Disponibilidade em Tempo Real -->
                <td class="px-4 py-3 text-center">
                  <div v-if="item.stockAvailable >= (item.quantityRequested - item.quantityFulfilled)" class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10.5px]">
                      <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600" />
                      {{ item.stockAvailable }} {{ item.footSide === 'PAR' ? 'pares' : 'un.' }} em estoque
                    </span>
                    <span v-if="item.locations.length > 0" class="text-[10px] text-emerald-600 mt-0.5 truncate max-w-[200px] flex items-center gap-0.5">
                      <MapPin class="w-3 h-3 shrink-0" />
                      {{ item.locations.join(', ') }}
                    </span>
                  </div>

                  <div v-else-if="item.stockAvailable > 0" class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-[10.5px]">
                      <Clock class="w-3.5 h-3.5 text-amber-600" />
                      Parcial: {{ item.stockAvailable }} {{ item.footSide === 'PAR' ? 'pares' : 'un.' }}
                    </span>
                    <span v-if="item.locations.length > 0" class="text-[10px] text-amber-600 mt-0.5 truncate max-w-[200px] flex items-center gap-0.5">
                      <MapPin class="w-3 h-3 shrink-0" />
                      {{ item.locations.join(', ') }}
                    </span>
                  </div>

                  <div v-else>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[10.5px]">
                      <AlertCircle class="w-3.5 h-3.5 text-rose-600" />
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
                      v-if="(item.status === 'PENDENTE' || item.status === 'ATENDIDA_PARCIAL') && item.stockAvailable > 0 && authStore.can('cadastrar_materiais')"
                      @click="openFulfill(item)"
                      class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10.5px] flex items-center gap-1 shadow-xs transition-colors"
                      title="Atender Requisição"
                    >
                      <CheckCheck class="w-3.5 h-3.5" />
                      <span>Atender</span>
                    </button>

                    <button
                      @click="viewingItem = item"
                      class="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Ver Detalhes"
                    >
                      <Eye class="w-4 h-4" />
                    </button>

                    <button
                      v-if="item.status === 'PENDENTE' && authStore.can('cadastrar_materiais')"
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

    <!-- Modal Nova Solicitação Multi-Itens Adaptativo com Trava Saldo Zero -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        <!-- Topo do Modal -->
        <div class="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <div class="flex items-center gap-2">
            <ClipboardList class="w-5 h-5" />
            <div>
              <h3 class="font-bold text-sm">Abertura Digital de Requisição de Reposição</h3>
              <p class="text-[11px] text-indigo-200">Adicione um ou mais itens com saldo disponível</p>
            </div>
          </div>
          <button @click="showCreateModal = false" class="text-white/80 hover:text-white font-bold text-lg">&times;</button>
        </div>

        <div class="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          <!-- 1. Seleção de Setor Adaptativo -->
          <div>
            <label class="block font-bold text-slate-700 uppercase mb-1.5">1. Selecione o Setor Solicitante *</label>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                v-for="sec in sectorOptions"
                :key="sec.id"
                type="button"
                @click="currentSector = sec.id as any; onSectorChange()"
                class="p-2.5 rounded-xl border font-bold flex flex-col items-center gap-1.5 transition-all text-[11px]"
                :class="currentSector === sec.id
                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm ring-1 ring-indigo-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
              >
                <component :is="sec.icon" class="w-4 h-4" />
                <span class="truncate">{{ formatSectorName(sec.id) }}</span>
              </button>
            </div>
          </div>

          <!-- 2. Formulário Adaptativo por Setor -->
          <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
            <h4 class="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5 border-b border-slate-200 pb-2">
              <Plus class="w-3.5 h-3.5 text-indigo-600" />
              <span>Adicionar Item do Setor: {{ formatSectorName(currentSector) }}</span>
            </h4>

            <!-- CAMPOS PARA CORTE -->
            <div v-if="currentSector === 'CORTE'" class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="relative">
                  <label class="block font-bold text-slate-600 uppercase mb-1">Código / Material *</label>
                  <input
                    v-model="formItem.sku"
                    @input="onSkuInput"
                    type="text"
                    placeholder="Ex: COU-BOV-01, SINT-PTO..."
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />

                  <!-- Dropdown Sugestões Corte -->
                  <div
                    v-if="showSuggestions && suggestions.length > 0"
                    class="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto divide-y divide-slate-100"
                  >
                    <button
                      v-for="sug in suggestions"
                      :key="sug.sku"
                      type="button"
                      @click="selectSuggestion(sug)"
                      class="w-full p-2 text-left hover:bg-indigo-50 flex justify-between items-center"
                    >
                      <div>
                        <span class="font-bold text-indigo-600 font-mono">{{ sug.sku }}</span>
                        <span class="text-slate-700 ml-1.5">{{ sug.description }}</span>
                      </div>
                      <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {{ sug.availableQuantity }} UN/M²
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Descrição / Tipo *</label>
                  <input
                    v-model="formItem.description"
                    @input="triggerAvailabilityCheck"
                    type="text"
                    placeholder="Ex: Couro Bovino Preto Premium..."
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Unidade</label>
                  <input
                    v-model="formItem.unit"
                    type="text"
                    placeholder="M², Metros, Folhas..."
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Quantidade *</label>
                  <input
                    v-model.number="formItem.quantityRequested"
                    type="number"
                    min="1"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <!-- CAMPOS PARA APOIO -->
            <div v-else-if="currentSector === 'APOIO'" class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="relative">
                  <label class="block font-bold text-slate-600 uppercase mb-1">COD. PRODUTO / SKU *</label>
                  <input
                    v-model="formItem.sku"
                    @input="onSkuInput"
                    type="text"
                    placeholder="Ex: MOLDE-PEGASUS..."
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />

                  <div
                    v-if="showSuggestions && suggestions.length > 0"
                    class="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto divide-y divide-slate-100"
                  >
                    <button
                      v-for="sug in suggestions"
                      :key="sug.sku"
                      type="button"
                      @click="selectSuggestion(sug)"
                      class="w-full p-2 text-left hover:bg-indigo-50 flex justify-between items-center"
                    >
                      <div>
                        <span class="font-bold text-indigo-600 font-mono">{{ sug.sku }}</span>
                        <span class="text-slate-700 ml-1.5">{{ sug.description }}</span>
                      </div>
                      <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {{ sug.availableQuantity }} PÇS
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Nome do Modelo / Linha *</label>
                  <input
                    v-model="formItem.modelName"
                    type="text"
                    placeholder="Ex: PEGASUS 40"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Peça / Molde Solicitado *</label>
                  <input
                    v-model="formItem.description"
                    @input="triggerAvailabilityCheck"
                    type="text"
                    placeholder="Ex: Reforço Traseiro, Gáspea Cortada..."
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Quantidade *</label>
                  <input
                    v-model.number="formItem.quantityRequested"
                    type="number"
                    min="1"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <!-- CAMPOS PARA PRÉ-FABRICADO / CABEDAIS / MONTAGEM -->
            <div v-else class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="relative">
                  <label class="block font-bold text-slate-600 uppercase mb-1">COD. PRODUTO / SKU *</label>
                  <input
                    v-model="formItem.sku"
                    @input="onSkuInput"
                    type="text"
                    placeholder="Digite para buscar..."
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />

                  <div
                    v-if="showSuggestions && suggestions.length > 0"
                    class="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto divide-y divide-slate-100"
                  >
                    <button
                      v-for="sug in suggestions"
                      :key="sug.sku"
                      type="button"
                      @click="selectSuggestion(sug)"
                      class="w-full p-2 text-left hover:bg-indigo-50 flex justify-between items-center"
                    >
                      <div>
                        <span class="font-bold text-indigo-600 font-mono">{{ sug.sku }}</span>
                        <span class="text-slate-700 ml-1.5">{{ sug.modelName }} - {{ sug.description }}</span>
                        <div v-if="sug.sizeGrades.length > 0" class="text-[10px] text-slate-400">Grades: {{ sug.sizeGrades.join(', ') }}</div>
                      </div>
                      <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {{ sug.availableQuantity }} un.
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Nome do Modelo / Linha *</label>
                  <input
                    v-model="formItem.modelName"
                    type="text"
                    placeholder="Ex: PEGASUS 40"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-600 uppercase mb-1">Peça / Componente Solicitado *</label>
                <input
                  v-model="formItem.description"
                  @input="triggerAvailabilityCheck"
                  type="text"
                  placeholder="Ex: Sola Borracha, Cabedal Completo, Pé Montado..."
                  class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Grade / Tamanho</label>
                  <input
                    v-model="formItem.sizeGrade"
                    @input="triggerAvailabilityCheck"
                    type="text"
                    placeholder="Ex: 39/40"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Lado / Tipo</label>
                  <div class="flex gap-1">
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'E' ? null : 'E'; triggerAvailabilityCheck()"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10.5px]"
                      :class="formItem.footSide === 'E'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Pé Esq.
                    </button>
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'D' ? null : 'D'; triggerAvailabilityCheck()"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10.5px]"
                      :class="formItem.footSide === 'D'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Pé Dir.
                    </button>
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'PAR' ? null : 'PAR'; triggerAvailabilityCheck()"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10.5px]"
                      :class="formItem.footSide === 'PAR'
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Par
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Quantidade *</label>
                  <input
                    v-model.number="formItem.quantityRequested"
                    type="number"
                    min="1"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <!-- Motivo do Defeito -->
            <div>
              <label class="block font-bold text-slate-600 uppercase mb-1">Motivo da Avaria / Defeito *</label>
              <input
                v-model="formItem.reason"
                type="text"
                placeholder="Ex: Quebra de agulha na costura, rasgo no corte, mancha de cola..."
                class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
              />
            </div>

            <!-- INDICADOR DE SALDO EM TEMPO REAL E AVISO INDUSTRIAL -->
            <div class="pt-2">
              <!-- Sem Saldo / Trava Saldo Zero -->
              <div
                v-if="availabilityResult.checked && availabilityResult.quantity === 0"
                class="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800"
              >
                <ShieldAlert class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p class="font-black tracking-tight text-xs uppercase">MATERIAL INDISPONÍVEL EM SOBRAS DASS</p>
                  <p class="text-[11px] text-rose-700 mt-0.5">Favor acionar a programação regular de corte/compra. Requisições sem saldo físico em sobras não podem ser geradas.</p>
                </div>
              </div>

              <!-- Com Saldo -->
              <div
                v-else-if="availabilityResult.checked && availabilityResult.quantity > 0"
                class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800"
              >
                <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div class="flex-1">
                  <div class="flex justify-between items-center">
                    <p class="font-black text-xs uppercase">
                      DISPONÍVEL EM SOBRAS: {{ availabilityResult.quantity }} {{ formItem.footSide === 'PAR' ? 'PARES COMPLETOS' : 'UNIDADES' }}
                    </p>
                    <span v-if="availabilityResult.pairsDetail" class="text-[10.5px] font-bold text-emerald-700">
                      (E: {{ availabilityResult.pairsDetail.esq }} | D: {{ availabilityResult.pairsDetail.dir }})
                    </span>
                  </div>
                  <p v-if="availabilityResult.locations.length > 0" class="text-[11px] text-emerald-700 mt-0.5 flex items-center gap-1">
                    <MapPin class="w-3.5 h-3.5 shrink-0" />
                    <span>Prateleiras: {{ availabilityResult.locations.join(', ') }}</span>
                  </p>
                </div>
              </div>
            </div>

            <!-- Botão Adicionar Item -->
            <div class="flex justify-end pt-1">
              <button
                type="button"
                @click="addCurrentItem"
                :disabled="availabilityResult.checked && availabilityResult.quantity === 0"
                class="px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all text-xs"
                :class="availabilityResult.checked && availabilityResult.quantity === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'"
              >
                <Plus class="w-4 h-4" />
                <span>Adicionar Item à Requisição</span>
              </button>
            </div>
          </div>

          <!-- 3. Lista de Itens Adicionados (Multi-Itens) -->
          <div>
            <div class="flex justify-between items-center mb-2">
              <h4 class="font-bold text-slate-800 uppercase text-xs">
                Itens na Requisição ({{ stagedItems.length }})
              </h4>
              <span v-if="stagedItems.length > 0" class="text-[11px] font-bold text-indigo-600">
                Total de peças: {{ stagedItems.reduce((acc, i) => acc + i.quantityRequested, 0) }}
              </span>
            </div>

            <div v-if="stagedItems.length === 0" class="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400">
              Nenhum item adicionado ainda. Preencha o formulário acima e clique em "Adicionar Item".
            </div>

            <div v-else class="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
              <div
                v-for="(staged, idx) in stagedItems"
                :key="idx"
                class="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <span class="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[11px]">
                    {{ idx + 1 }}
                  </span>
                  <div>
                    <div class="font-bold text-slate-900 font-mono text-[11.5px]">
                      {{ staged.sku || staged.description }}
                      <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-sans bg-slate-100 text-slate-700">
                        {{ formatSectorName(staged.requestSector) }}
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-600">
                      {{ staged.description }}
                      <span v-if="staged.sizeGrade" class="font-bold"> | Grade {{ staged.sizeGrade }}</span>
                      <span v-if="staged.footSide" class="font-bold"> ({{ staged.footSide === 'E' ? 'Pé Esq.' : staged.footSide === 'D' ? 'Pé Dir.' : 'Par' }})</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <div class="text-right">
                    <span class="font-black text-slate-900 text-xs block">Qtd: {{ staged.quantityRequested }}</span>
                    <span class="text-[10px] font-bold text-emerald-600">Disp: {{ staged.stockAvailable }} un.</span>
                  </div>

                  <button
                    type="button"
                    @click="removeStagedItem(idx)"
                    class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Remover item"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Rodapé do Modal -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button
            type="button"
            @click="showCreateModal = false"
            class="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl font-bold transition-all text-xs"
          >
            Cancelar
          </button>

          <button
            type="button"
            @click="submitRequisition"
            :disabled="isSubmitting || (stagedItems.length === 0 && (!availabilityResult.checked || availabilityResult.quantity === 0))"
            class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 text-xs"
          >
            <span v-if="isSubmitting">Emitindo Requisição...</span>
            <span v-else>Confirmar e Enviar Requisição ({{ stagedItems.length }} itens)</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Atendimento de Requisição (Baixa 1 Clique) -->
    <div
      v-if="showFulfillModal && fulfillingItem"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        <div class="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white">
          <div class="flex items-center gap-2">
            <CheckCheck class="w-5 h-5" />
            <h3 class="font-bold text-sm">Atender Requisição {{ fulfillingItem.code }}</h3>
          </div>
          <button @click="showFulfillModal = false" class="text-white/80 hover:text-white font-bold text-lg">&times;</button>
        </div>

        <form @submit.prevent="executeFulfill" class="p-6 space-y-4 text-xs">
          <div class="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 space-y-1">
            <div class="font-bold text-emerald-900 text-sm font-mono">
              {{ fulfillingItem.sku || fulfillingItem.description }} — {{ fulfillingItem.modelName || 'GERAL' }}
            </div>
            <div class="text-emerald-800 font-medium">{{ fulfillingItem.description }}</div>
            <div class="text-[11px] text-emerald-700">
              Solicitado: <strong>{{ fulfillingItem.quantityRequested }}</strong> | 
              Disponível em Sobras: <strong>{{ fulfillingItem.stockAvailable }} {{ fulfillingItem.footSide === 'PAR' ? 'pares' : 'un.' }}</strong>
            </div>
            <div v-if="fulfillingItem.locations.length > 0" class="text-[10.5px] text-emerald-600 pt-1 flex items-center gap-1">
              <MapPin class="w-3.5 h-3.5 shrink-0" />
              <span>Prateleiras: {{ fulfillingItem.locations.join(', ') }}</span>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-600 uppercase mb-1">
              Quantidade a Atender / Baixar ({{ fulfillingItem.footSide === 'PAR' ? 'Pares Completos' : 'Unidades' }}) *
            </label>
            <input
              v-model.number="fulfillQuantity"
              type="number"
              min="1"
              :max="fulfillingItem.stockAvailable"
              class="w-full border border-slate-200 p-2.5 rounded-xl font-black text-sm outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label class="block font-bold text-slate-600 uppercase mb-1">Observação do Atendimento</label>
            <input
              v-model="fulfillObservation"
              type="text"
              placeholder="Ex: Entregue em mãos para o setor solicitante..."
              class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-emerald-500"
            />
          </div>

          <div class="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
            <button
              type="button"
              @click="showFulfillModal = false"
              class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all"
            >
              Cancelar
            </button>

            <button
              type="submit"
              :disabled="isFulfilling"
              class="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
            >
              <span v-if="isFulfilling">Processando...</span>
              <span v-else>Confirmar Baixa em Estoque</span>
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
              <p class="font-mono font-bold text-slate-900 text-sm">
                {{ viewingItem.sku || '-' }} — {{ viewingItem.modelName || 'GERAL' }}
              </p>
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
                  <span v-if="viewingItem.footSide">
                    ({{ viewingItem.footSide === 'E' ? 'Pé Esquerdo' : viewingItem.footSide === 'D' ? 'Pé Direito' : 'Par Completo' }})
                  </span>
                </p>
              </div>
              <div>
                <span class="text-slate-400 font-bold uppercase block text-[10px]">Qtd. Solicitada / Atendida</span>
                <p class="font-black text-slate-900 text-sm">{{ viewingItem.quantityRequested }} <span class="text-xs font-normal text-slate-500">(Atendido: {{ viewingItem.quantityFulfilled }})</span></p>
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
                {{ viewingItem.stockAvailable }} {{ viewingItem.footSide === 'PAR' ? 'pares' : 'un.' }}
              </span>
            </div>
            <div v-if="viewingItem.locations.length > 0" class="mt-2 text-[11px] text-slate-600">
              <span class="font-bold block">Localizações / Prateleiras sugeridas:</span>
              <div class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="loc in viewingItem.locations"
                  :key="loc"
                  class="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono font-bold text-slate-700 text-[10.5px] flex items-center gap-1"
                >
                  <MapPin class="w-3 h-3 text-slate-500" />
                  {{ loc }}
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
