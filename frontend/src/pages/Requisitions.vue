<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Layout from '@/components/Layout.vue';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/httpClient';
import { useToast } from '@/composables/useToast';
import { useSettings } from '@/composables/useSettings';
import { useRequisitions } from '@/composables/useRequisitions';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { useModalFocus } from '@/composables/useModalFocus';
import { formatDate } from '@/utils/format';
import PageState from '@/components/PageState.vue';
import ToastNotification from '@/components/ToastNotification.vue';
import RequisitionFilters from '@/components/RequisitionFilters.vue';
import { formatSectorName, SECTOR_OPTIONS } from '@/utils/domain';
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
  requestSector: 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'DISTRIBUICAO' | 'EXPEDICAO' | 'MONTAGEM';
  sourceSector?: 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'DISTRIBUICAO' | 'EXPEDICAO' | null;
  sourceMatchReason?: string | null;
  sourceStockItems?: Array<Record<string, any>>;
  type?: string;
  unit?: string;
  sku?: string;
  modelName?: string;
  description: string;
  sizeGrade?: string;
  color?: string;
  footSide?: 'E' | 'D' | 'PAR' | null;
  quantityRequested: number;
  quantityFulfilled: number;
  reason: string;
  status: 'PENDENTE' | 'ATENDIDA_TOTAL' | 'ATENDIDA_PARCIAL' | 'CANCELADA';
  requesterId?: string;
  requesterName?: string;
  createdAt: string;
  stockAvailable: number;
  locations: string[];
  pairsDetail?: { esq: number; dir: number };
}

interface RequisitionStockCandidate {
  id: string;
  sourceStockItemIds: number[];
  sourceCompatibilityIds: number[];
  sourceSector: string;
  sourceQuantityPerRequestUnit: number;
  quantity: number;
  unit: string;
  sourceUnits: string[];
  locations: string[];
  items: Array<Record<string, any>>;
  reason: string;
  requiresConfirmation: boolean;
  confirmationDetails: string[];
  rank: number;
}

interface UnverifiedRequisitionStockMatch {
  id: number;
  sourceSector: string;
  hasProductLink: boolean;
  matchReasons: string[];
  code?: string | null;
  pieceCode?: string | null;
  sku?: string | null;
  modelName?: string | null;
  description?: string | null;
  type?: string | null;
  componentType?: string | null;
  color?: string | null;
  sizeGrade?: string | null;
  footSide?: 'E' | 'D' | 'PAR' | null;
  unit: string;
  quantity: number;
  locations: string[];
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
  requestSector: 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'DISTRIBUICAO' | 'EXPEDICAO' | 'MONTAGEM';
  sourceCandidateId: string;
  confirmSourceSuggestion: boolean;
  sourceSector: string;
  sourceMatchReason: string;
  sku?: string;
  modelName?: string;
  description: string;
  type?: string;
  sizeGrade?: string;
  color?: string;
  footSide?: 'E' | 'D' | 'PAR' | null;
  quantityRequested: number;
  reason: string;
  unit?: string;
  stockAvailable: number;
  locations: string[];
  pairsDetail?: { esq: number; dir: number };
}

const isMasterAdmin = computed(() => {
  return authStore.user?.role === 'admin' || Boolean(authStore.user?.isGlobalAdmin);
});

const { notification, showToast } = useToast(4500);

const {
  requisitions,
  loading,
  error,
  totalCount,
  currentPage,
  totalPages,
  filterStatus,
  filterSector,
  search,
  onlyPendingWithStock,
  displayedRequisitions,
  stats,
  userAssignedSector,
  loadRequisitions,
  handleSearch,
  clearSearch,
} = useRequisitions({ route, authStore, notify: showToast });

// Modal de Nova Requisição Multi-Itens
const showCreateModal = ref(false);
const isSubmitting = ref(false);
const stagedItems = ref<StagedRequisitionItem[]>([]);
const reasonInput = ref<HTMLInputElement | null>(null);
const reasonErrorVisible = ref(false);

// Formulário do item corrente
const currentSector = ref<'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'DISTRIBUICAO' | 'EXPEDICAO' | 'MONTAGEM'>('MONTAGEM');
const formItem = ref({
  sku: '',
  modelName: '',
  description: '',
  type: '',
  color: '',
  unit: 'UN',
  sizeGrade: '',
  footSide: null as 'E' | 'D' | 'PAR' | null,
  quantityRequested: 1,
  reason: '',
});
const createInitial = ref('');

function isCreateDirty() {
  return showCreateModal.value && (
    stagedItems.value.length > 0 || JSON.stringify(formItem.value) !== createInitial.value
  );
}

function isFulfillDirty() {
  return showFulfillModal.value && JSON.stringify({
    quantity: fulfillQuantity.value,
    observation: fulfillObservation.value,
  }) !== fulfillInitial.value;
}

const { confirmDiscard } = useUnsavedChanges(() => (
  isCreateDirty() || isFulfillDirty()
));

async function closeCreateModal() {
  if (!isSubmitting.value && await confirmDiscard()) showCreateModal.value = false;
}

async function closeFulfillModal() {
  if (!isFulfilling.value && await confirmDiscard()) showFulfillModal.value = false;
}

function closeDetailsModal() {
  viewingItem.value = null;
}

// Verificação de Saldo em Tempo Real (Trava Saldo Zero)
type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'ambiguous' | 'error';

interface AvailabilityRequest {
  requestSector: typeof currentSector.value;
  sku?: string;
  modelName?: string;
  description: string;
  type?: string;
  sizeGrade?: string;
  color?: string;
  footSide?: 'E' | 'D' | 'PAR' | null;
}

const availabilityResult = ref<{
  status: AvailabilityStatus;
  identityKey?: string;
  quantity: number;
  locations: string[];
  candidates: RequisitionStockCandidate[];
  unverifiedStockMatches: UnverifiedRequisitionStockMatch[];
  selectedCandidateId: string | null;
  confirmedSourceCandidateId?: string | null;
  pairsDetail?: { esq: number; dir: number };
}>({
  status: 'idle',
  quantity: 0,
  locations: [],
  candidates: [],
  unverifiedStockMatches: [],
  selectedCandidateId: null,
  confirmedSourceCandidateId: null,
});

const selectedSourceCandidate = computed(() => availabilityResult.value.candidates
  .find(candidate => candidate.id === availabilityResult.value.selectedCandidateId) || null);

// Autocomplete
const suggestions = ref<SkuSuggestion[]>([]);
const showSuggestions = ref(false);
const availableGrades = ref<string[]>([]);
const availableFootSides = ref<Array<'E' | 'D' | 'PAR'>>([]);
let autocompleteTimer: ReturnType<typeof setTimeout> | null = null;
let availabilityDebounce: ReturnType<typeof setTimeout> | null = null;
let availabilityRequestVersion = 0;
let autocompleteRequestVersion = 0;

onUnmounted(() => {
  if (autocompleteTimer) clearTimeout(autocompleteTimer);
  if (availabilityDebounce) clearTimeout(availabilityDebounce);
  availabilityRequestVersion++;
  autocompleteRequestVersion++;
});

// Modal de Atendimento (Fulfill)
const showFulfillModal = ref(false);
const fulfillingItem = ref<RequisitionItem | null>(null);
const fulfillQuantity = ref(1);
const fulfillObservation = ref('');
const isFulfilling = ref(false);
const { units: measurementUnits, fetchUnits } = useSettings();
onMounted(fetchUnits);
function integerQuantity(unit: string | undefined, sector: string) {
  return sector !== 'CORTE' || Boolean(measurementUnits.value.find((entry: any) => entry.symbol === unit)?.integerOnly);
}
const requestIntegerOnly = computed(() => integerQuantity(selectedSourceCandidate.value?.unit || formItem.value.unit, currentSector.value));
const fulfillIntegerOnly = computed(() => integerQuantity(fulfillingItem.value?.unit, fulfillingItem.value?.requestSector || ''));
const fulfillInitial = ref('');

// Modal de Detalhes
const viewingItem = ref<RequisitionItem | null>(null);
const createDialog = ref<HTMLElement | null>(null);
const fulfillDialog = ref<HTMLElement | null>(null);
const detailsDialog = ref<HTMLElement | null>(null);

useModalFocus(() => showCreateModal.value, createDialog, closeCreateModal);
useModalFocus(() => showFulfillModal.value, fulfillDialog, closeFulfillModal);
useModalFocus(() => Boolean(viewingItem.value), detailsDialog, closeDetailsModal);

const sectorIcons = { CORTE: Scissors, APOIO: Wrench, PRE_FABRICADO: Layers, DISTRIBUICAO: Box, MONTAGEM: Footprints };
const sectorOptions = SECTOR_OPTIONS
  .filter(option => sectorIcons[option.id])
  .map(option => ({ ...option, icon: sectorIcons[option.id] }));

// Consulta de disponibilidade em tempo real. A resposta só vale para a identidade
// exata que iniciou a requisição; qualquer edição invalida o resultado anterior.
function buildAvailabilityRequest(): AvailabilityRequest {
  const sku = formItem.value.sku?.trim().toUpperCase();
  const modelName = formItem.value.modelName?.trim().toUpperCase();
  const type = formItem.value.type?.trim().toUpperCase();
  let description = formItem.value.description?.trim();

  if (currentSector.value === 'MONTAGEM') {
    description = 'CALÇADO COMPLETO';
  } else if (currentSector.value === 'PRE_FABRICADO') {
    const solaType = type || 'SOLA';
    description = `${solaType} - ${modelName || sku || 'SOLA'}`;
  } else if (currentSector.value === 'DISTRIBUICAO' || currentSector.value === 'EXPEDICAO') {
    const insumoType = type === 'SOLA_PROCESSADA' ? 'SOLA PROCESSADA' : 'CABEDAL';
    description = `${insumoType} - ${modelName || sku || 'INSUMO'}`;
  }

  return {
    requestSector: currentSector.value,
    sku: sku || undefined,
    modelName: modelName || undefined,
    description: (description || sku || 'CALÇADO COMPLETO').toUpperCase(),
    type: type || undefined,
    sizeGrade: formItem.value.sizeGrade?.trim().toUpperCase() || undefined,
    color: formItem.value.color?.trim().toUpperCase() || undefined,
    footSide: formItem.value.footSide || undefined,
  };
}

function availabilityIdentityKey(request: AvailabilityRequest) {
  return JSON.stringify([
    request.requestSector,
    request.sku || '',
    request.modelName || '',
    request.description,
    request.type || '',
    request.sizeGrade || '',
    request.color || '',
    request.footSide || '',
  ]);
}

function hasEnoughIdentityToCheck(request: AvailabilityRequest) {
  if (request.requestSector === 'CORTE') return Boolean(request.sku || formItem.value.description.trim());
  if (request.requestSector === 'APOIO') return Boolean(request.sku && formItem.value.description.trim());
  return Boolean(request.sku);
}

async function checkCurrentItemAvailability(request: AvailabilityRequest, identityKey: string, requestVersion: number) {
  try {
    const res = await api.post('/requisitions/check-availability', request);
    if (requestVersion !== availabilityRequestVersion || identityKey !== availabilityIdentityKey(buildAvailabilityRequest())) return;

    const candidates = (res.data?.candidates || []) as RequisitionStockCandidate[];
    const unverifiedStockMatches = (res.data?.unverifiedStockMatches || []) as UnverifiedRequisitionStockMatch[];
    availabilityResult.value = {
      status: candidates.length ? 'available' : 'unavailable',
      identityKey,
      quantity: 0,
      locations: [],
      candidates,
      unverifiedStockMatches,
      selectedCandidateId: null,
    };
  } catch {
    if (requestVersion !== availabilityRequestVersion || identityKey !== availabilityIdentityKey(buildAvailabilityRequest())) return;
    availabilityResult.value = { status: 'error', identityKey, quantity: 0, locations: [], candidates: [], unverifiedStockMatches: [], selectedCandidateId: null };
  }
}

function scheduleAvailabilityCheck() {
  if (availabilityDebounce) clearTimeout(availabilityDebounce);
  availabilityDebounce = null;
  const requestVersion = ++availabilityRequestVersion;
  const request = buildAvailabilityRequest();
  reasonErrorVisible.value = false;

  if (!hasEnoughIdentityToCheck(request)) {
    availabilityResult.value = { status: 'idle', quantity: 0, locations: [], candidates: [], unverifiedStockMatches: [], selectedCandidateId: null };
    return;
  }

  const identityKey = availabilityIdentityKey(request);
  availabilityResult.value = { status: 'checking', identityKey, quantity: 0, locations: [], candidates: [], unverifiedStockMatches: [], selectedCandidateId: null };
  availabilityDebounce = setTimeout(() => {
    void checkCurrentItemAvailability(request, identityKey, requestVersion);
  }, 300);
}

watch(
  () => [
    currentSector.value,
    formItem.value.sku,
    formItem.value.modelName,
    formItem.value.description,
    formItem.value.type,
    formItem.value.sizeGrade,
    formItem.value.color,
    formItem.value.footSide,
  ],
  scheduleAvailabilityCheck,
  { flush: 'sync' },
);

const currentAvailabilityMatches = computed(() =>
  availabilityResult.value.status === 'available'
  && availabilityResult.value.identityKey === availabilityIdentityKey(buildAvailabilityRequest())
  && Boolean(selectedSourceCandidate.value)
  && (!selectedSourceCandidate.value!.requiresConfirmation
    || availabilityResult.value.confirmedSourceCandidateId === selectedSourceCandidate.value!.id)
  && selectedSourceCandidate.value!.quantity > 0,
);

const currentQuantityIsValid = computed(() => {
  const quantity = formItem.value.quantityRequested;
  return Number.isFinite(quantity)
    && /^\d+(?:\.\d{1,3})?$/.test(String(quantity))
    && (!requestIntegerOnly.value || Number.isInteger(quantity))
    && quantity > 0;
});

const canAddCurrentItem = computed(() =>
  currentAvailabilityMatches.value
  && currentQuantityIsValid.value
  && formItem.value.quantityRequested <= availabilityResult.value.quantity,
);

const canSubmitRequisition = computed(() =>
  !isSubmitting.value && (stagedItems.value.length > 0 || canAddCurrentItem.value),
);

// Autocomplete ao digitar SKU / Código
function onSkuInput() {
  if (autocompleteTimer) clearTimeout(autocompleteTimer);
  const requestVersion = ++autocompleteRequestVersion;
  formItem.value.sizeGrade = '';
  formItem.value.color = '';
  formItem.value.footSide = null;
  availableGrades.value = [];
  availableFootSides.value = [];
  const q = formItem.value.sku.trim();
  if (q.length < 2) {
    suggestions.value = [];
    showSuggestions.value = false;
    return;
  }
  suggestions.value = [];
  showSuggestions.value = false;

  autocompleteTimer = setTimeout(async () => {
    try {
      const res = await api.get('/inventory/search-suggestions', {
        params: {
          sector: currentSector.value,
          q,
        },
      });
      if (requestVersion !== autocompleteRequestVersion) return;
      suggestions.value = res.data || [];
      showSuggestions.value = suggestions.value.length > 0;
    } catch {
      if (requestVersion !== autocompleteRequestVersion) return;
      suggestions.value = [];
      showSuggestions.value = false;
    }
  }, 250);
}

function selectSuggestion(sug: SkuSuggestion) {
  if (autocompleteTimer) clearTimeout(autocompleteTimer);
  autocompleteRequestVersion++;
  formItem.value.sku = sug.sku;
  formItem.value.modelName = sug.modelName;
  formItem.value.color = sug.color || '';
  formItem.value.sizeGrade = '';
  formItem.value.footSide = null;
  if (currentSector.value === 'APOIO' || currentSector.value === 'CORTE') {
    formItem.value.description = sug.description;
  }
  availableGrades.value = sug.sizeGrades || [];
  const suggestedSides = new Set(sug.footSides || []);
  availableFootSides.value = ['E', 'D'].filter(side => suggestedSides.has(side)) as Array<'E' | 'D'>;
  if (suggestedSides.has('E') && suggestedSides.has('D')) availableFootSides.value.push('PAR');
  if (availableFootSides.value.length === 1) formItem.value.footSide = availableFootSides.value[0];
  if (availableGrades.value.length === 1) {
    formItem.value.sizeGrade = availableGrades.value[0];
  }
  showSuggestions.value = false;
  scheduleAvailabilityCheck();
}

function onSectorChange() {
  if (autocompleteTimer) clearTimeout(autocompleteTimer);
  autocompleteRequestVersion++;
  formItem.value = {
    sku: '',
    modelName: '',
    description: '',
    type: currentSector.value === 'PRE_FABRICADO' ? 'EVA' : (currentSector.value === 'DISTRIBUICAO' ? 'CABEDAL' : ''),
    color: '',
    unit: currentSector.value === 'CORTE' ? 'M²' : 'UN',
    sizeGrade: '',
    footSide: null,
    quantityRequested: 1,
    reason: formItem.value.reason, // preserva o motivo comum se digitado
  };
  availableGrades.value = [];
  availableFootSides.value = [];
  suggestions.value = [];
  showSuggestions.value = false;
}

function selectSourceCandidate(candidate: RequisitionStockCandidate) {
  availabilityResult.value = {
    ...availabilityResult.value,
    selectedCandidateId: candidate.id,
    confirmedSourceCandidateId: null,
    quantity: candidate.quantity,
    locations: [...candidate.locations],
  };
  formItem.value.unit = candidate.unit;
}

function setSourceSuggestionConfirmation(candidate: RequisitionStockCandidate, event: Event) {
  if (availabilityResult.value.selectedCandidateId !== candidate.id) return;
  const checked = (event.target as HTMLInputElement).checked;
  availabilityResult.value = {
    ...availabilityResult.value,
    confirmedSourceCandidateId: checked ? candidate.id : null,
  };
}

function sourceCandidateItemLabel(candidate: RequisitionStockCandidate) {
  const item = candidate.items[0] || {};
  const label = item.code || item.pieceCode || item.sku || item.modelName || item.description || `Item #${item.id}`;
  const itemType = candidate.sourceSector === 'APOIO' ? formatSourceComponent(item) : item.type || formatSourceComponent(item);
  const details = [itemType, item.modelName && item.modelName !== label ? `Modelo ${item.modelName}` : '']
    .filter(Boolean).join(' · ');
  return `${label}${details ? ` · ${details}` : ''}`;
}

function formatSourceComponent(item: Record<string, any>) {
  const labels: Record<string, string> = {
    MATERIA_PRIMA: 'Matéria-prima',
    PECA_CORTADA: 'Peça cortada',
    SOLADO: 'Solado',
    CABEDAL: 'Cabedal',
    PE_PRONTO: 'Pé pronto',
  };
  const value = item.componentType || item.type || '';
  return labels[value] || String(value).replaceAll('_', ' ');
}

function sourceItemSummary(items?: Array<Record<string, any>>) {
  return (items || []).map(item => {
    const code = item.code || item.pieceCode || item.sku || item.modelName || `Item #${item.id}`;
    const description = item.description || item.modelName || item.name;
    return description && description !== code ? `${code} — ${description}` : code;
  }).join(' + ');
}

function openCreate() {
  stagedItems.value = [];
  reasonErrorVisible.value = false;
  currentSector.value = 'MONTAGEM';
  onSectorChange();
  createInitial.value = JSON.stringify(formItem.value);
  showCreateModal.value = true;
}

// Adicionar item à lista da requisição
function addCurrentItem() {
  let finalDesc = formItem.value.description?.trim();

  if (currentSector.value === 'MONTAGEM') {
    finalDesc = 'CALÇADO COMPLETO';
    if (!formItem.value.sku.trim()) {
      showToast('O COD. PRODUTO / SKU é obrigatório.', 'error');
      return;
    }
  } else if (currentSector.value === 'PRE_FABRICADO') {
    const solaType = formItem.value.type || 'SOLA';
    finalDesc = `${solaType} - ${formItem.value.modelName || formItem.value.sku || 'SOLA'}`.trim();
    if (!formItem.value.sku.trim()) {
      showToast('O COD. PRODUTO / SKU / Modelo é obrigatório.', 'error');
      return;
    }
  } else if (currentSector.value === 'DISTRIBUICAO' || currentSector.value === 'EXPEDICAO') {
    const insumoType = formItem.value.type === 'SOLA_PROCESSADA' ? 'SOLA PROCESSADA' : 'CABEDAL';
    finalDesc = `${insumoType} - ${formItem.value.modelName || formItem.value.sku || 'INSUMO'}`.trim();
    if (!formItem.value.sku.trim()) {
      showToast('O COD. PRODUTO / SKU é obrigatório.', 'error');
      return;
    }
  } else if (currentSector.value === 'APOIO') {
    if (!formItem.value.sku.trim()) {
      showToast('O COD. PRODUTO / SKU é obrigatório.', 'error');
      return;
    }
    if (!finalDesc) {
      showToast('A Peça / Molde Solicitado é obrigatório.', 'error');
      return;
    }
  } else if (currentSector.value === 'CORTE') {
    if (!finalDesc && !formItem.value.sku.trim()) {
      showToast('A Descrição / Tipo do material é obrigatória.', 'error');
      return;
    }
    finalDesc = finalDesc || formItem.value.sku.trim();
  }

  if (!Number.isFinite(formItem.value.quantityRequested) || !/^\d+(?:\.\d{1,3})?$/.test(String(formItem.value.quantityRequested)) || (requestIntegerOnly.value && !Number.isInteger(formItem.value.quantityRequested))) {
    showToast('Quantidade inválida: peças exigem inteiros; demais unidades permitem até três casas decimais.', 'error'); return;
  }
  if (formItem.value.quantityRequested <= 0) {
    showToast('A quantidade solicitada deve ser maior que zero.', 'error');
    return;
  }

  if (!formItem.value.reason.trim()) {
    reasonErrorVisible.value = true;
    reasonInput.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    reasonInput.value?.focus({ preventScroll: true });
    return;
  }

  if (!currentAvailabilityMatches.value) {
    if (availabilityResult.value.status === 'checking') {
      showToast('Aguarde a confirmação do saldo para o item selecionado.', 'error');
    } else if (availabilityResult.value.status === 'ambiguous') {
      showToast('Escolha a origem do estoque que atenderá esta requisição.', 'error');
    } else if (availabilityResult.value.status === 'error') {
      showToast('Não foi possível consultar o saldo. Tente novamente antes de continuar.', 'error');
    } else {
      showToast('Selecione uma origem compatível com saldo disponível para continuar.', 'error');
    }
    return;
  }

  if (!selectedSourceCandidate.value || formItem.value.quantityRequested > selectedSourceCandidate.value.quantity) {
    showToast(`Quantidade solicitada (${formItem.value.quantityRequested}) excede o saldo equivalente disponível (${selectedSourceCandidate.value?.quantity || 0} ${selectedSourceCandidate.value?.unit || ''}).`, 'error');
    return;
  }

  stagedItems.value.push({
    requestSector: currentSector.value,
    sourceCandidateId: selectedSourceCandidate.value!.id,
    confirmSourceSuggestion: selectedSourceCandidate.value!.requiresConfirmation
      && availabilityResult.value.confirmedSourceCandidateId === selectedSourceCandidate.value!.id,
    sourceSector: selectedSourceCandidate.value!.sourceSector,
    sourceMatchReason: selectedSourceCandidate.value!.reason,
    sku: formItem.value.sku.trim().toUpperCase() || undefined,
    modelName: formItem.value.modelName.trim().toUpperCase() || (currentSector.value === 'CORTE' ? 'CORTE' : (currentSector.value === 'MONTAGEM' ? 'CALÇADO' : 'GERAL')),
    description: (finalDesc || 'CALÇADO COMPLETO').toUpperCase(),
    type: formItem.value.type.trim().toUpperCase() || undefined,
    sizeGrade: formItem.value.sizeGrade.trim().toUpperCase() || undefined,
    color: formItem.value.color?.trim().toUpperCase() || undefined,
    footSide: formItem.value.footSide || null,
    quantityRequested: formItem.value.quantityRequested,
    reason: formItem.value.reason.trim().toUpperCase(),
    unit: selectedSourceCandidate.value!.unit,
    stockAvailable: selectedSourceCandidate.value!.quantity,
    locations: [...selectedSourceCandidate.value!.locations],
    pairsDetail: selectedSourceCandidate.value!.items.length > 1 ? {
      esq: Number(selectedSourceCandidate.value!.items.find(item => item.footSide === 'E')?.quantity || 0),
      dir: Number(selectedSourceCandidate.value!.items.find(item => item.footSide === 'D')?.quantity || 0),
    } : undefined,
  });

  // Limpar formulário mantendo o setor
  const lastReason = formItem.value.reason;
  formItem.value = {
    sku: '',
    modelName: '',
    description: '',
    type: currentSector.value === 'PRE_FABRICADO' ? 'EVA' : (currentSector.value === 'DISTRIBUICAO' ? 'CABEDAL' : ''),
    color: '',
    unit: currentSector.value === 'CORTE' ? 'M²' : 'UN',
    sizeGrade: '',
    footSide: null,
    quantityRequested: 1,
    reason: lastReason,
  };
  if (autocompleteTimer) clearTimeout(autocompleteTimer);
  autocompleteRequestVersion++;
  availableGrades.value = [];
  availableFootSides.value = [];
  suggestions.value = [];
  showSuggestions.value = false;
  showToast('Item adicionado à lista da requisição.', 'success');
}

function removeStagedItem(index: number) {
  stagedItems.value.splice(index, 1);
}

// Submeter a requisição completa
async function submitRequisition() {
  if (stagedItems.value.length === 0) {
    // Se o operador não clicou em "Adicionar", tenta adicionar o item atual se válido
    if (!canAddCurrentItem.value) {
      if (availabilityResult.value.status === 'checking') {
        showToast('Aguarde a confirmação do saldo para o item selecionado.', 'error');
      } else if (availabilityResult.value.status === 'error') {
        showToast('Não foi possível consultar o saldo. Tente novamente antes de continuar.', 'error');
      } else if (availabilityResult.value.status === 'ambiguous') {
        showToast('Há mais de um material compatível. Especifique a identificação antes de continuar.', 'error');
      } else {
        showToast('Adicione um item válido com saldo positivo no estoque de sobras.', 'error');
      }
      return;
    }
    addCurrentItem();
  }

  if (stagedItems.value.length === 0) return;

  isSubmitting.value = true;
  try {
    const payload = {
      items: stagedItems.value.map((item) => ({
        requestSector: item.requestSector,
        sourceCandidateId: item.sourceCandidateId,
        confirmSourceSuggestion: item.confirmSourceSuggestion,
        sku: item.sku,
        modelName: item.modelName,
        description: item.description,
        type: item.type,
        sizeGrade: item.sizeGrade,
        color: item.color,
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

// Permissões RBAC e Governança de Aprovação por Setor
function canFulfill(item: RequisitionItem) {
  if (item.status !== 'PENDENTE' && item.status !== 'ATENDIDA_PARCIAL') return false;
  if (!item.stockAvailable || item.stockAvailable <= 0) return false;
  if (isMasterAdmin.value) return true;
  if (authStore.user?.role === 'admin_setor') {
    const userSec = userAssignedSector.value;
    const sourceSec = (item.sourceSector || item.requestSector) === 'EXPEDICAO' ? 'DISTRIBUICAO' : (item.sourceSector || item.requestSector);
    return Boolean(userSec && userSec === sourceSec);
  }
  return false;
}

function canCancel(item: RequisitionItem) {
  if (item.status !== 'PENDENTE') return false;
  if (authStore.user?.role === 'leitor') return false;
  if (isMasterAdmin.value) return true;
  if (authStore.user?.role === 'admin_setor') {
    const userSec = userAssignedSector.value;
    const reqSec = (item.requestSector === 'EXPEDICAO' || item.requestSector === 'CABEDAIS') ? 'DISTRIBUICAO' : item.requestSector;
    return Boolean(userSec && userSec === reqSec);
  }
  if (authStore.user?.matricula && item.requesterId && String(authStore.user.matricula) === String(item.requesterId)) {
    const userSec = userAssignedSector.value;
    const reqSec = (item.requestSector === 'EXPEDICAO' || item.requestSector === 'CABEDAIS') ? 'DISTRIBUICAO' : item.requestSector;
    return Boolean(userSec && userSec === reqSec);
  }
  return false;
}

// Atendimento Rápido em 1 Clique
function openFulfill(item: RequisitionItem) {
  fulfillingItem.value = item;
  const pending = item.quantityRequested - item.quantityFulfilled;
  fulfillQuantity.value = Math.min(pending, item.stockAvailable || pending);
  fulfillObservation.value = '';
  fulfillInitial.value = JSON.stringify({ quantity: fulfillQuantity.value, observation: fulfillObservation.value });
  showFulfillModal.value = true;
}

async function executeFulfill() {
  if (!fulfillingItem.value) return;
  if (!Number.isFinite(fulfillQuantity.value) || !/^\d+(?:\.\d{1,3})?$/.test(String(fulfillQuantity.value)) || (fulfillIntegerOnly.value && !Number.isInteger(fulfillQuantity.value))) {
    showToast('Quantidade inválida: peças exigem inteiros; demais unidades permitem até três casas decimais.', 'error'); return;
  }
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
    fulfillInitial.value = '';
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

onMounted(() => {
  loadRequisitions(1);
});
</script>

<template>
  <Layout>
    <ToastNotification :notification="notification" />

    <div class="p-6 space-y-6 max-w-7xl mx-auto">
      <!-- Topbar / Cabeçalho -->
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div class="flex items-center gap-2.5">
            <div class="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ClipboardList class="w-6 h-6" />
            </div>
            <div>
              <h1 class="text-xl font-black text-slate-900 tracking-tight">Central de Requisições de Sobras</h1>
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
            <p class="text-[11px] font-bold text-rose-600 uppercase">Sem saldo compatível</p>
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
      <RequisitionFilters
        v-model:status="filterStatus"
        v-model:sector="filterSector"
        v-model:search="search"
        :sector-locked="false"
        @change="loadRequisitions(1)"
        @search="handleSearch"
        @clear-search="clearSearch"
      />

      <!-- Tabela de Requisições -->
      <PageState
        :loading="loading && displayedRequisitions.length === 0"
        :error="error"
        :empty="!loading && !error && displayedRequisitions.length === 0"
        empty-message="Nenhuma requisição de reposição encontrada."
        @retry="loadRequisitions(currentPage)"
      />
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
                  <span v-if="item.sourceSector" class="mt-1 block text-[10px] font-semibold text-indigo-700">
                    Fornecedor: {{ formatSectorName(item.sourceSector) }}
                  </span>
                </td>

                <!-- Item / SKU & Modelo -->
                <td class="px-4 py-3">
                  <div v-if="item.sku" class="font-bold text-slate-900 font-mono text-[11.5px]">{{ item.sku }}</div>
                  <div v-if="item.modelName" class="text-[11px] text-slate-700 font-medium">{{ item.modelName }}</div>
                  <div v-if="item.color" class="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded inline-block my-0.5 border border-indigo-100 font-mono">
                    {{ item.color }}
                  </div>
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
                      {{ item.stockAvailable }} {{ item.footSide === 'PAR' ? 'pares' : (item.unit || 'un.') }} em estoque
                    </span>
                    <span v-if="item.sourceMatchReason" class="max-w-[220px] truncate text-[10px] text-emerald-700">{{ item.sourceMatchReason }}</span>
                    <span v-if="item.locations.length > 0" class="text-[10px] text-emerald-600 mt-0.5 truncate max-w-[200px] flex items-center gap-0.5">
                      <MapPin class="w-3 h-3 shrink-0" />
                      {{ item.locations.join(', ') }}
                    </span>
                  </div>

                  <div v-else-if="item.stockAvailable > 0" class="inline-flex flex-col items-center">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-[10.5px]">
                      <Clock class="w-3.5 h-3.5 text-amber-600" />
                      Parcial: {{ item.stockAvailable }} {{ item.footSide === 'PAR' ? 'pares' : (item.unit || 'un.') }}
                    </span>
                    <span v-if="item.sourceMatchReason" class="max-w-[220px] truncate text-[10px] text-amber-700">{{ item.sourceMatchReason }}</span>
                    <span v-if="item.locations.length > 0" class="text-[10px] text-amber-600 mt-0.5 truncate max-w-[200px] flex items-center gap-0.5">
                      <MapPin class="w-3 h-3 shrink-0" />
                      {{ item.locations.join(', ') }}
                    </span>
                  </div>

                  <div v-else>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[10.5px]">
                      <AlertCircle class="w-3.5 h-3.5 text-rose-600" />
                      0 disponível compatível
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
                      v-if="canFulfill(item)"
                      @click="openFulfill(item)"
                      class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10.5px] flex items-center gap-1 shadow-xs transition-colors"
                      title="Atender Requisição (Aprovar e Baixar Estoque)"
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
                      v-if="canCancel(item)"
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
      ref="createDialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-requisition-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        <!-- Topo do Modal -->
        <div class="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <div class="flex items-center gap-2">
            <ClipboardList class="w-5 h-5" />
            <div>
              <h3 id="new-requisition-title" class="font-bold text-sm">Abertura Digital de Requisição de Reposição</h3>
              <p class="text-[11px] text-indigo-200">Adicione um ou mais itens com saldo disponível</p>
            </div>
          </div>
          <button @click="closeCreateModal" aria-label="Fechar nova solicitação" class="text-white/80 hover:text-white font-bold text-lg">&times;</button>
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
                    type="text"
                    placeholder="Ex: Couro Bovino Preto Premium..."
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Unidade</label>
                  <input v-model="formItem.unit" readonly class="w-full border border-slate-200 p-2.5 rounded-xl bg-slate-50" />
                </div>
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Quantidade *</label>
                  <input
                    v-model.number="formItem.quantityRequested"
                    type="number"
                    :min="requestIntegerOnly ? 1 : 0.001"
                    :step="requestIntegerOnly ? 1 : 0.001"
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
                    placeholder="Ex: RACER SPEEDZONE"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Peça / Molde Solicitado *</label>
                  <input
                    v-model="formItem.description"
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
                    :min="requestIntegerOnly ? 1 : 0.001"
                    :step="requestIntegerOnly ? 1 : 0.001"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <!-- CAMPOS PARA PRÉ-FABRICADO (SOLAS) -->
            <div v-else-if="currentSector === 'PRE_FABRICADO'" class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Tipo de Sola *</label>
                  <select
                    v-model="formItem.type"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="EVA">EVA</option>
                    <option value="BORRACHA">Borracha</option>
                    <option value="TPU">TPU</option>
                    <option value="PU">PU</option>
                  </select>
                </div>
                <div class="relative sm:col-span-2">
                  <label class="block font-bold text-slate-600 uppercase mb-1">COD. PRODUTO / Modelo Solado *</label>
                  <input
                    v-model="formItem.sku"
                    @input="onSkuInput"
                    type="text"
                    placeholder="Ex: SOLA-PEGASUS, PEG-40..."
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
                        <span class="text-slate-700 ml-1.5">{{ sug.modelName || sug.description }}</span>
                        <div v-if="sug.sizeGrades.length > 0" class="text-[10px] text-slate-400">Grades: {{ sug.sizeGrades.join(', ') }}</div>
                      </div>
                      <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {{ sug.availableQuantity }} un.
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Grade / Tamanho</label>
                  <input
                    v-model="formItem.sizeGrade"
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
                      @click="formItem.footSide = formItem.footSide === 'E' ? null : 'E'"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10.5px]"
                      :class="formItem.footSide === 'E'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Pé Esq.
                    </button>
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'D' ? null : 'D'"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10.5px]"
                      :class="formItem.footSide === 'D'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Pé Dir.
                    </button>
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'PAR' ? null : 'PAR'"
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
                    :min="requestIntegerOnly ? 1 : 0.001"
                    :step="requestIntegerOnly ? 1 : 0.001"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <!-- CAMPOS PARA DISTRIBUIÇÃO (CABEDAIS & SOLAS PROCESSADAS) -->
            <div v-else-if="currentSector === 'DISTRIBUICAO' || currentSector === 'EXPEDICAO'" class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Tipo de Insumo *</label>
                  <select
                    v-model="formItem.type"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="CABEDAL">Cabedal</option>
                    <option value="SOLA_PROCESSADA">Sola Processada</option>
                  </select>
                </div>
                <div class="relative">
                  <label class="block font-bold text-slate-600 uppercase mb-1">COD. PRODUTO / SKU *</label>
                  <input
                    v-model="formItem.sku"
                    @input="onSkuInput"
                    type="text"
                    placeholder="Ex: CAB-PEG-01..."
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
                        <span class="text-slate-700 ml-1.5">{{ sug.modelName || sug.description }}</span>
                        <div v-if="sug.sizeGrades.length > 0" class="text-[10px] text-slate-400">Grades: {{ sug.sizeGrades.join(', ') }}</div>
                      </div>
                      <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {{ sug.availableQuantity }} un.
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Nome do Modelo / Linha</label>
                  <input
                    v-model="formItem.modelName"
                    type="text"
                    placeholder="Ex: RACER SPEEDZONE"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Grade / Tamanho</label>
                  <input
                    v-model="formItem.sizeGrade"
                    type="text"
                    placeholder="Ex: 39/40"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Cor / Combinação</label>
                  <input
                    v-model="formItem.color"
                    @input="formItem.color = formItem.color.replace(/\s+/g, '').replace(/[^A-Za-z0-9\/\-]/g, '').toUpperCase()"
                    type="text"
                    placeholder="Ex: BRANCO/GOMA"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Lado / Tipo</label>
                  <div class="flex gap-1">
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'E' ? null : 'E'"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10px]"
                      :class="formItem.footSide === 'E'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Pé Esq.
                    </button>
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'D' ? null : 'D'"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10px]"
                      :class="formItem.footSide === 'D'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Pé Dir.
                    </button>
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'PAR' ? null : 'PAR'"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10px]"
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
                    :min="requestIntegerOnly ? 1 : 0.001"
                    :step="requestIntegerOnly ? 1 : 0.001"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <!-- CAMPOS PARA MONTAGEM (PÉS PRONTOS / CALÇADOS MONTADOS) -->
            <div v-else-if="currentSector === 'MONTAGEM'" class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="relative">
                  <label class="block font-bold text-slate-600 uppercase mb-1">COD. PRODUTO / SKU *</label>
                  <input
                    v-model="formItem.sku"
                    @input="onSkuInput"
                    type="text"
                    placeholder="Ex: NKE-PEG-38-BLK..."
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
                        <span class="text-slate-700 ml-1.5">{{ sug.modelName || sug.description }}</span>
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
                    placeholder="Ex: RACER SPEEDZONE"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Combinação / Cor</label>
                  <input
                    v-model="formItem.color"
                    @input="formItem.color = formItem.color.replace(/\s+/g, '').replace(/[^A-Za-z0-9\/\-]/g, '').toUpperCase()"
                    type="text"
                    placeholder="Ex: BRANCO/PRETO"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-indigo-500 bg-white"
                  />
                </div>

                <div>
                  <label class="block font-bold text-slate-600 uppercase mb-1">Grade / Tamanho</label>
                  <input
                    v-model="formItem.sizeGrade"
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
                      @click="formItem.footSide = formItem.footSide === 'E' ? null : 'E'"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10px]"
                      :class="formItem.footSide === 'E'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Pé Esq.
                    </button>
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'D' ? null : 'D'"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10px]"
                      :class="formItem.footSide === 'D'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'"
                    >
                      Pé Dir.
                    </button>
                    <button
                      type="button"
                      @click="formItem.footSide = formItem.footSide === 'PAR' ? null : 'PAR'"
                      class="flex-1 py-2 rounded-xl font-bold border transition-all text-center text-[10px]"
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
                    :min="requestIntegerOnly ? 1 : 0.001"
                    :step="requestIntegerOnly ? 1 : 0.001"
                    class="w-full border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <!-- Motivo do Defeito -->
            <div>
              <label class="block font-bold text-slate-600 uppercase mb-1">Motivo da Avaria / Defeito *</label>
              <input
                ref="reasonInput"
                v-model="formItem.reason"
                type="text"
                placeholder="Ex: Quebra de agulha na costura, rasgo no corte, mancha de cola..."
                :aria-invalid="reasonErrorVisible && !formItem.reason.trim()"
                :aria-describedby="reasonErrorVisible && !formItem.reason.trim() ? 'requisition-reason-error' : undefined"
                class="w-full border p-2.5 rounded-xl font-medium uppercase outline-none bg-white"
                :class="reasonErrorVisible && !formItem.reason.trim()
                  ? 'border-rose-500 focus:border-rose-600'
                  : 'border-slate-200 focus:border-indigo-500'"
              />
              <p
                v-if="reasonErrorVisible && !formItem.reason.trim()"
                id="requisition-reason-error"
                role="alert"
                class="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-rose-700"
              >
                <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                Informe o motivo da avaria ou do defeito para incluir este item.
              </p>
            </div>

            <!-- INDICADOR DE SALDO EM TEMPO REAL E AVISO INDUSTRIAL -->
            <div class="pt-2" aria-live="polite">
              <div
                v-if="availabilityResult.status === 'checking'"
                class="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5 text-blue-800"
              >
                <RefreshCw class="w-4 h-4 animate-spin shrink-0" />
                <p class="font-bold text-xs">Verificando o saldo do item selecionado...</p>
              </div>

              <div
                v-else-if="availabilityResult.status === 'ambiguous'"
                class="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900"
              >
                <AlertTriangle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div class="flex-1">
                  <p class="font-black tracking-tight text-xs uppercase">Identificação ambígua</p>
                  <p class="text-[11px] text-amber-800 mt-0.5">Mais de um material corresponde aos dados informados. Refine grade, cor ou lado; se não for possível diferenciá-los, solicite a regularização dos cadastros duplicados.</p>
                  <div v-if="availableGrades.length > 1 && currentSector !== 'CORTE' && currentSector !== 'APOIO'" class="flex flex-wrap gap-1.5 mt-2">
                    <span class="text-[10px] font-bold mr-1 self-center">Grade:</span>
                    <button
                      v-for="grade in availableGrades"
                      :key="grade"
                      type="button"
                      @click="formItem.sizeGrade = grade"
                      class="px-2 py-1 rounded-lg border text-[10px] font-bold"
                      :class="formItem.sizeGrade === grade ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-amber-900 border-amber-300'"
                    >{{ grade }}</button>
                  </div>
                  <div v-if="availableFootSides.length > 1" class="flex flex-wrap gap-1.5 mt-2">
                    <span class="text-[10px] font-bold mr-1 self-center">Lado:</span>
                    <button
                      v-for="side in availableFootSides"
                      :key="side"
                      type="button"
                      @click="formItem.footSide = side"
                      class="px-2 py-1 rounded-lg border text-[10px] font-bold"
                      :class="formItem.footSide === side ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-amber-900 border-amber-300'"
                    >{{ side === 'E' ? 'Pé esquerdo' : side === 'D' ? 'Pé direito' : 'Par completo' }}</button>
                  </div>
                </div>
              </div>

              <div
                v-else-if="availabilityResult.status === 'error'"
                class="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-800"
              >
                <AlertCircle class="w-5 h-5 text-rose-600 shrink-0" />
                <div class="flex-1">
                  <p class="font-bold text-xs">Não foi possível consultar o saldo.</p>
                  <p class="text-[11px] mt-0.5">O envio fica bloqueado até a confirmação do estoque de sobras.</p>
                </div>
                <button type="button" @click="scheduleAvailabilityCheck" class="px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white text-[10px] font-bold hover:bg-rose-100">
                  Tentar novamente
                </button>
              </div>

              <div
                v-else-if="availabilityResult.status === 'unavailable' && !availabilityResult.unverifiedStockMatches.length"
                class="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800"
              >
                <ShieldAlert class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p class="font-black tracking-tight text-xs uppercase">Nenhuma origem compatível com saldo positivo</p>
                  <p class="text-[11px] text-rose-700 mt-0.5">Confirme as variantes e o saldo no fornecedor. Para usar matéria-prima de Corte sem SKU compartilhado, é necessária uma regra especial em Configurações.</p>
                </div>
              </div>

              <div
                v-else-if="availabilityResult.status === 'available'"
                class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5"
              >
                <p class="font-black text-xs uppercase text-slate-800">Escolha a sobra que atende ao pedido</p>
                <div
                  v-for="candidate in availabilityResult.candidates"
                  :key="candidate.id"
                  class="space-y-1.5"
                >
                  <label
                    class="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-white p-3 transition"
                    :class="availabilityResult.selectedCandidateId === candidate.id ? 'border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-300' : 'border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30'"
                  >
                    <input
                      type="radio"
                      name="requisition-source-candidate"
                      :checked="availabilityResult.selectedCandidateId === candidate.id"
                      @change="selectSourceCandidate(candidate)"
                      class="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="flex flex-wrap items-center justify-between gap-1">
                        <strong class="text-xs text-slate-900">{{ formatSectorName(candidate.sourceSector) }} · {{ sourceCandidateItemLabel(candidate) }}</strong>
                        <strong class="text-xs text-emerald-700">{{ candidate.quantity }} {{ candidate.unit }}</strong>
                      </span>
                      <span class="mt-1 block text-[10.5px] text-slate-600">
                        <template v-for="(sourceItem, index) in candidate.items" :key="sourceItem.id">
                          <span v-if="index > 0"> + </span>
                          <span v-if="sourceItem.modelName">Modelo/linha: {{ sourceItem.modelName }}</span>
                          <span v-if="sourceItem.description">{{ sourceItem.modelName ? ' · ' : '' }}{{ sourceItem.description }}</span>
                          <span v-if="candidate.sourceSector === 'APOIO' && sourceItem.componentType"> · Componente: {{ formatSourceComponent(sourceItem) }}</span>
                          <span v-if="sourceItem.color"> · Cor: {{ sourceItem.color }}</span>
                          <span v-if="sourceItem.sizeGrade"> · Grade: {{ sourceItem.sizeGrade }}</span>
                          <span v-if="sourceItem.footSide"> · {{ sourceItem.footSide === 'E' ? 'pé esquerdo' : sourceItem.footSide === 'D' ? 'pé direito' : 'par' }}</span>
                        </template>
                        <span v-if="candidate.sourceQuantityPerRequestUnit !== 1 || candidate.sourceUnits.some(unit => unit !== candidate.unit)"> · consumo {{ candidate.sourceQuantityPerRequestUnit }} {{ candidate.sourceUnits.join('/') }} por {{ candidate.unit }}</span>
                      </span>
                      <span class="mt-1 block text-[10.5px] font-semibold text-indigo-700">Compatibilidade: {{ candidate.reason }}</span>
                      <span v-if="candidate.locations.length" class="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                        <MapPin class="size-3 shrink-0" /> {{ candidate.locations.join(', ') }}
                      </span>
                    </span>
                  </label>
                  <label v-if="candidate.requiresConfirmation" class="ml-8 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10.5px] text-amber-950">
                    <input
                      type="checkbox"
                      :checked="availabilityResult.confirmedSourceCandidateId === candidate.id"
                      :disabled="availabilityResult.selectedCandidateId !== candidate.id"
                      @change="setSourceSuggestionConfirmation(candidate, $event)"
                      class="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500 disabled:opacity-50"
                    />
                    <span>
                      Confirmo que este item do setor fornecedor atende ao produto pedido e que conferi o modelo, o componente e as variantes.
                      <span v-if="candidate.confirmationDetails.length" class="mt-1 block text-amber-800">Conferir: {{ candidate.confirmationDetails.join('; ') }}.</span>
                    </span>
                  </label>
                </div>
                <p v-if="selectedSourceCandidate && formItem.quantityRequested > selectedSourceCandidate.quantity" class="text-[11px] font-bold text-rose-700">
                  A quantidade solicitada excede o saldo equivalente da origem escolhida.
                </p>
              </div>

              <div
                v-if="availabilityResult.unverifiedStockMatches.length"
                class="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950"
              >
                <div class="flex items-start gap-2.5">
                  <AlertTriangle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div class="min-w-0 flex-1">
                    <p class="font-black tracking-tight text-xs uppercase">Estoque encontrado para conferência</p>
                    <p class="text-[11px] text-amber-900 mt-0.5">
                      Estas linhas coincidiram por código ou modelo, mas não passaram pela conferência automática de tipo, variantes ou unidade. Confira os dados. Para relações especiais entre componentes ou conversões, um Admin Master pode cadastrar uma regra em Configurações.
                    </p>
                  </div>
                </div>
                <ul class="mt-2.5 space-y-1.5" aria-label="Estoque encontrado para conferência de compatibilidade">
                  <li
                  v-for="match in availabilityResult.unverifiedStockMatches"
                    :key="match.id"
                    class="rounded-lg border border-amber-200/80 bg-white/80 px-2.5 py-2 text-[10.5px]"
                  >
                    <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <strong class="text-amber-950">{{ formatSectorName(match.sourceSector) }} · {{ match.description || match.modelName || match.type || 'Material' }}</strong>
                      <strong class="text-amber-800">Saldo: {{ match.quantity }} {{ match.unit }}</strong>
                    </div>
                    <div class="mt-0.5 flex flex-wrap gap-x-2 text-amber-900">
                      <span v-if="match.pieceCode">Cód. peça: {{ match.pieceCode }}</span>
                      <span v-if="match.code">Código: {{ match.code }}</span>
                      <span v-if="match.sku">SKU: {{ match.sku }}</span>
                      <span v-if="match.type">Tipo: {{ match.type }}</span>
                      <span v-if="match.componentType">Componente: {{ match.componentType }}</span>
                      <span v-if="match.color">Cor: {{ match.color }}</span>
                      <span v-if="match.sizeGrade">Grade: {{ match.sizeGrade }}</span>
                      <span v-if="match.footSide">{{ match.footSide === 'E' ? 'Pé esquerdo' : match.footSide === 'D' ? 'Pé direito' : 'Par' }}</span>
                    </div>
                    <span v-if="match.modelName" class="mt-0.5 block text-amber-900">Modelo/Linha: {{ match.modelName }}</span>
                    <span v-if="match.matchReasons.length" class="mt-0.5 block text-amber-800">Correspondência: {{ match.matchReasons.join('; ') }}</span>
                    <span class="mt-0.5 block text-amber-800">
                      {{ match.sourceSector === 'CORTE' && !match.hasProductLink
                        ? 'Para aproveitar matéria-prima de Corte sem SKU compartilhado, um Admin Master precisa cadastrar a relação especial em Configurações.'
                        : match.sourceSector === 'APOIO' && !match.hasProductLink
                          ? 'Peças Cortadas são sugeridas por modelo e variantes. Este item não passou nessa conferência; uma relação fora desse padrão pode ser cadastrada como regra especial.'
                        : match.hasProductLink
                          ? 'Há uma regra cadastrada, mas ela não correspondeu a todos os dados desta solicitação.'
                          : 'Não foi sugerido porque os dados cadastrados não confirmam todas as variantes e a unidade do pedido.' }}
                    </span>
                    <span v-if="match.locations.length" class="mt-0.5 flex items-center gap-1 text-amber-800">
                      <MapPin class="size-3 shrink-0" /> {{ match.locations.join(', ') }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- Botão Adicionar Item -->
            <div class="flex justify-end pt-1">
              <button
                type="button"
                @click="addCurrentItem"
                :disabled="!canAddCurrentItem"
                class="px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all text-xs"
                :class="!canAddCurrentItem
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
                      <span v-if="staged.color" class="font-bold text-indigo-600"> | Cor: {{ staged.color }}</span>
                      <span v-if="staged.sizeGrade" class="font-bold"> | Grade {{ staged.sizeGrade }}</span>
                      <span v-if="staged.footSide" class="font-bold"> ({{ staged.footSide === 'E' ? 'Pé Esq.' : staged.footSide === 'D' ? 'Pé Dir.' : 'Par' }})</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <div class="text-right">
                    <span class="font-black text-slate-900 text-xs block">Qtd: {{ staged.quantityRequested }}</span>
                    <span class="text-[10px] font-bold text-emerald-600">Origem: {{ formatSectorName(staged.sourceSector) }}</span>
                    <span class="text-[10px] font-bold text-emerald-600">Disp: {{ staged.stockAvailable }} {{ staged.footSide === 'PAR' ? 'pares' : (staged.unit || 'un.') }}</span>
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
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center gap-3 shrink-0">
          <button
            type="button"
            @click="closeCreateModal"
            class="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl font-bold transition-all text-xs"
          >
            Cancelar
          </button>

          <div class="flex items-center justify-end gap-3">
            <p
              v-if="stagedItems.length === 0 && canAddCurrentItem && !formItem.reason.trim()"
              class="max-w-52 text-right text-[10px] leading-snug text-rose-700"
            >
              O motivo da avaria/defeito é obrigatório. Clique para destacar o campo.
            </p>
            <button
              type="button"
              @click="submitRequisition"
              :disabled="!canSubmitRequisition"
              class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 text-xs"
            >
              <span v-if="isSubmitting">Emitindo Requisição...</span>
              <span v-else>Confirmar e Enviar Requisição ({{ stagedItems.length }} itens)</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Atendimento de Requisição (Baixa 1 Clique) -->
    <div
      v-if="showFulfillModal && fulfillingItem"
      ref="fulfillDialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fulfill-requisition-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        <div class="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white">
          <div class="flex items-center gap-2">
            <CheckCheck class="w-5 h-5" />
            <h3 id="fulfill-requisition-title" class="font-bold text-sm">Atender Requisição {{ fulfillingItem.code }}</h3>
          </div>
          <button @click="closeFulfillModal" aria-label="Fechar atendimento" class="text-white/80 hover:text-white font-bold text-lg">&times;</button>
        </div>

        <form @submit.prevent="executeFulfill" class="p-6 space-y-4 text-xs">
          <div class="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 space-y-1">
            <div class="font-bold text-emerald-900 text-sm font-mono">
              {{ fulfillingItem.sku || fulfillingItem.description }} — {{ fulfillingItem.modelName || 'GERAL' }}
            </div>
            <div class="text-emerald-800 font-medium">{{ fulfillingItem.description }}</div>
            <div class="text-[10.5px] font-semibold text-emerald-800">A baixa será feita diretamente neste estoque fornecedor; não haverá transferência para outro setor.</div>
            <div class="text-[11px] font-bold text-emerald-800">
              Estoque fornecedor: {{ formatSectorName(fulfillingItem.sourceSector || fulfillingItem.requestSector) }}
            </div>
            <div v-if="fulfillingItem.sourceStockItems?.length" class="text-[10.5px] text-emerald-800">
              Material que será baixado: {{ sourceItemSummary(fulfillingItem.sourceStockItems) }}
            </div>
            <div v-if="fulfillingItem.sourceMatchReason" class="text-[10.5px] text-emerald-700">
              Compatibilidade: {{ fulfillingItem.sourceMatchReason }}
            </div>
            <div class="text-[11px] text-emerald-700">
              Solicitado: <strong>{{ fulfillingItem.quantityRequested }}</strong> | 
              Disponível em Sobras: <strong>{{ fulfillingItem.stockAvailable }} {{ fulfillingItem.footSide === 'PAR' ? 'pares' : (fulfillingItem.unit || 'un.') }}</strong>
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
              :min="fulfillIntegerOnly ? 1 : 0.001"
              :step="fulfillIntegerOnly ? 1 : 0.001"
              :max="fulfillingItem.stockAvailable"
              class="w-full border border-slate-200 p-2.5 rounded-xl font-black text-sm outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label class="block font-bold text-slate-600 uppercase mb-1">Observação do Atendimento</label>
            <input
              v-model="fulfillObservation"
              type="text"
              placeholder="Ex: Material consumido diretamente pelo setor solicitante..."
              class="w-full border border-slate-200 p-2.5 rounded-xl font-medium uppercase outline-none focus:border-emerald-500"
            />
          </div>

          <div class="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
            <button
              type="button"
              @click="closeFulfillModal"
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
      ref="detailsDialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="requisition-details-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div class="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <div class="flex items-center gap-2">
            <FileText class="w-5 h-5 text-indigo-400" />
            <h3 id="requisition-details-title" class="font-bold text-sm">Detalhes da Requisição {{ viewingItem.code }}</h3>
          </div>
          <button @click="closeDetailsModal" aria-label="Fechar detalhes" class="text-white/80 hover:text-white font-bold text-lg">&times;</button>
        </div>

        <div class="p-6 space-y-4 text-xs">
          <div class="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Setor Solicitante</span>
              <span class="font-bold text-slate-800">{{ formatSectorName(viewingItem.requestSector) }}</span>
              <span v-if="viewingItem.sourceSector" class="block mt-1 text-[10px] text-indigo-700">Fornecedor: {{ formatSectorName(viewingItem.sourceSector) }}</span>
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
                {{ viewingItem.sku || '-' }} — {{ viewingItem.modelName || 'GERAL' }}<span v-if="viewingItem.type"> · {{ viewingItem.type }}</span>
              </p>
            </div>
            <div>
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Peça / Material</span>
              <p class="font-medium text-slate-800">{{ viewingItem.description }}</p>
            </div>
            <div v-if="viewingItem.color">
              <span class="text-slate-400 font-bold uppercase block text-[10px]">Cor / Combinação</span>
              <p class="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg inline-block border border-indigo-100 text-xs mt-0.5">
                {{ viewingItem.color }}
              </p>
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
                {{ viewingItem.stockAvailable }} {{ viewingItem.footSide === 'PAR' ? 'pares' : (viewingItem.unit || 'un.') }}
              </span>
            </div>
            <div v-if="viewingItem.sourceStockItems?.length || viewingItem.sourceMatchReason" class="mt-2 space-y-1 text-[10.5px] text-slate-700">
              <p v-if="viewingItem.sourceStockItems?.length"><strong>Origem baixada:</strong> {{ sourceItemSummary(viewingItem.sourceStockItems) }}</p>
              <p v-if="viewingItem.sourceMatchReason"><strong>Compatibilidade:</strong> {{ viewingItem.sourceMatchReason }}</p>
              <p class="font-semibold text-indigo-700">O atendimento baixa diretamente do estoque fornecedor.</p>
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
              @click="closeDetailsModal"
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
