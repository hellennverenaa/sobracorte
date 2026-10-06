<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Layout from '@/components/Layout.vue';
import { useStockStore, SectorType, InventorySectorFilter } from '@/stores/stockStore';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/httpClient';
import SectorFormInput from '@/components/SectorFormInput.vue';
import InventoryItemDetails from '@/components/InventoryItemDetails.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirmModal } from '@/composables/useConfirmModal';
import { useToast } from '@/composables/useToast';
import { formatNumber } from '@/utils/format';
import PageState from '@/components/PageState.vue';
import ToastNotification from '@/components/ToastNotification.vue';
import { useInventoryQuery } from '@/composables/useInventoryQuery';
import { useSettings } from '@/composables/useSettings';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { useModalFocus } from '@/composables/useModalFocus';
import { formatSectorName, normalizeSector, SECTOR_OPTIONS } from '@/utils/domain';
import { 
  Plus, RefreshCw, ArrowLeftRight, X, Eye, 
  Scissors, Wrench, Layers, Box, Footprints,
  ArrowDownRight, ArrowUpRight, Trash2, User, CheckCircle2, AlertCircle, Info,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, SlidersHorizontal, ChevronDown
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const stockStore = useStockStore();
const authStore = useAuthStore();
const currentSectorItems = computed(() => stockStore.currentSectorData?.data ?? []);

const validSectors: SectorType[] = SECTOR_OPTIONS.filter(option => option.id !== 'TODOS').map(option => option.id as SectorType);
const validSectorFilters: InventorySectorFilter[] = ['TODOS', ...validSectors];

function getSectorFromRoute(): InventorySectorFilter {
  const sec = normalizeSector(route.query.sector);
  if (sec && validSectorFilters.includes(sec as InventorySectorFilter)) {
    return sec as InventorySectorFilter;
  }
  return 'TODOS';
}

const showEntryForm = ref(false);
const entryForm = ref<any>(null);
const entryDialog = ref<HTMLElement | null>(null);
const isClosingEntryForm = ref(false);
function openEntryForm() {
  showEntryForm.value = true;
}
async function closeEntryForm() {
  if (!showEntryForm.value || isClosingEntryForm.value) return;
  isClosingEntryForm.value = true;
  try {
    if (entryForm.value?.confirmDiscard && !(await entryForm.value.confirmDiscard())) return;
    showEntryForm.value = false;
  } finally {
    isClosingEntryForm.value = false;
  }
}
function handleEntrySaved() {
  showToast('Entrada realizada com sucesso!');
  loadData(currentPage.value);
}
const {
  activeTab,
  search,
  currentPage,
  selectedLocationFilter,
  selectedTypeFilter,
  stockStatusFilter,
  modelNameFilter,
  materialColorFilter,
  pageSize,
  loadData,
} = useInventoryQuery(stockStore, authStore, route, getSectorFromRoute());
const showInventoryFilters = ref(false);

const inventoryTypeOptions = computed(() => {
  if (activeTab.value === 'TODOS') {
    return [...new Set([
      ...stockStore.filterCategories.map(category => category.name),
      'EVA', 'BORRACHA', 'CABEDAL', 'SOLA_PROCESSADA',
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  const configured = stockStore.filterCategories
    .filter(category => {
      const scopes = Array.isArray(category.sectors) && category.sectors.length
        ? category.sectors
        : category.sector ? [category.sector] : [];
      return scopes.length === 0 || scopes.some(sector => normalizeSector(sector) === normalizeSector(activeTab.value));
    })
    .map(category => category.name)
    .filter(Boolean);
  const fallback = activeTab.value === 'PRE_FABRICADO'
    ? ['BORRACHA', 'EVA']
    : activeTab.value === 'DISTRIBUICAO' || activeTab.value === 'EXPEDICAO'
      ? ['CABEDAL', 'SOLA_PROCESSADA']
      : [];
  return [...new Set(configured.length ? configured : fallback)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
});

function getInventoryTypeLabel(type: string) {
  const labels: Record<string, string> = {
    EVA: 'EVA (Sola não processada)',
    SOLA_PROCESSADA: 'Sola processada',
    CABEDAL: 'Cabedal',
    BORRACHA: 'Borracha',
  };
  return labels[type] || type;
}

const activeInventoryFilterSummary = computed(() => {
  const summary: string[] = [];
  const query = search.value.trim();

  if (query) summary.push(`Busca: ${query}`);
  if (modelNameFilter.value.trim()) summary.push(`Modelo/linha: ${modelNameFilter.value.trim()}`);
  if (materialColorFilter.value.trim()) summary.push(`Material/cor: ${materialColorFilter.value.trim()}`);
  if (selectedLocationFilter.value) {
    const location = stockStore.filterLocations.find(
      (item) => String(item.id) === String(selectedLocationFilter.value),
    );
    summary.push(`Localização: ${location?.name || 'Selecionada'}`);
  }
  if (selectedTypeFilter.value) summary.push(`Tipo: ${getInventoryTypeLabel(selectedTypeFilter.value)}`);
  if (stockStatusFilter.value) {
    summary.push(`Saldo: ${stockStatusFilter.value === 'zero_balance' ? 'Zerado' : 'Com saldo'}`);
  }

  return summary;
});

const activeInventoryFilterCount = computed(() => activeInventoryFilterSummary.value.length);
const hasInventoryFilters = computed(() => activeInventoryFilterCount.value > 0);

function applyInventoryFilters() {
  currentPage.value = 1;
  router.replace({ query: { ...route.query, page: 1 } });
  loadData(1);
}

function clearInventoryFilters() {
  search.value = '';
  selectedLocationFilter.value = '';
  selectedTypeFilter.value = '';
  stockStatusFilter.value = '';
  modelNameFilter.value = '';
  materialColorFilter.value = '';
  currentPage.value = 1;
  router.replace({ query: { ...route.query, q: undefined, page: 1 } });
  loadData(1);
}

function handleSectorSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value as InventorySectorFilter;
  if (validSectorFilters.includes(value)) void selectTab(value);
}

// Configurações Dinâmicas
const dbLocations = ref<any[]>([]);
const dbOrigins = ref<any[]>([]);

// Notificação padrão
const { notification, showToast } = useToast(4000);

// Modal de Movimentação Unificado
const showMovementModal = ref(false);
const selectedItem = ref<any>(null);
const movementType = ref<'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA'>('SAIDA');
const movementQuantity = ref<number | null>(null);
const selectedLocationId = ref<number | null>(null);
const destinationLocationId = ref<number | null>(null);
const movementReason = ref('');
const movementObservation = ref('');
const movementLoading = ref(false);
const movementDialog = ref(null);
const movementSnapshot = ref('');
const movementValues = () => JSON.stringify([movementType.value, movementQuantity.value, selectedLocationId.value, destinationLocationId.value, movementReason.value, movementObservation.value]);
const { confirmDiscard } = useUnsavedChanges(() => showMovementModal.value && movementValues() !== movementSnapshot.value);
async function closeMovementModal() {
  if (!movementLoading.value && await confirmDiscard()) showMovementModal.value = false;
}
useModalFocus(() => showMovementModal.value, movementDialog, closeMovementModal);
useModalFocus(() => showEntryForm.value, entryDialog, closeEntryForm);

// Modal de Detalhes
const viewingItem = ref<any>(null);

// Permissão para Excluir (apenas admin_master e admin_setor no respectivo setor)
function canOperateSector(sector: string | null | undefined) {
  if (!authStore.user) return false;
  if (authStore.user.role === 'admin' || authStore.user.isGlobalAdmin === true) return true;
  if (authStore.user.role === 'leitor' || !authStore.user.assignedSector || authStore.user.assignedSector === 'TODOS') return false;
  return normalizeSector(authStore.user.assignedSector) === normalizeSector(sector);
}

function canDeleteItem(item: any) {
  const role = authStore.user?.role;
  if (role === 'admin' || authStore.user?.isGlobalAdmin === true) return true;
  return role === 'admin_setor' && canOperateSector(item?.sector);
}

// Modal de Confirmação Corporativo
const { confirmState, openConfirmModal, handleConfirmedAction } = useConfirmModal();

function confirmDelete(item: any) {
  const isCorte = item.sector === 'CORTE';
  const itemName = isCorte ? item.name : (item.description || item.productName || item.sku || `Item #${item.id}`);
  const itemCode = isCorte ? item.code : (item.sku || item.pieceCode || item.code || '-');

  openConfirmModal({
    title: 'Excluir Item do Estoque',
    message: `Tem certeza que deseja excluir "${itemName}" (${itemCode})? Esta ação é irreversível e só é permitida quando todo o estoque estiver zerado.`,
    confirmText: 'Sim, Excluir Item',
    variant: 'danger',
    action: async () => {
      try {
        await api.delete(`/inventory/stock-items/${item.id}`);
        showToast('Item excluído com sucesso!');
        await loadData(currentPage.value);
      } catch (error: any) {
        console.error('Erro ao excluir item:', error);
        const errorMsg = error.response?.data?.error || error.message || 'Erro ao tentar excluir item.';
        showToast(errorMsg, 'error');
      }
    },
  });
}

const allTabs = [
  { id: 'TODOS' as InventorySectorFilter, countKey: 'totalItems', icon: Layers },
  { id: 'CORTE' as SectorType, countKey: 'totalCorte', icon: Scissors },
  { id: 'APOIO' as SectorType, countKey: 'totalApoio', icon: Wrench },
  { id: 'PRE_FABRICADO' as SectorType, countKey: 'totalPreFabricado', icon: Layers },
  { id: 'DISTRIBUICAO' as SectorType, countKey: 'totalExpedicao', icon: Box },
  { id: 'MONTAGEM' as SectorType, countKey: 'totalMontagem', icon: Footprints },
].map((tab) => {
  const sector = SECTOR_OPTIONS.find((option) => option.id === tab.id);
  return { ...tab, label: sector?.shortLabel || sector?.label || tab.id };
});

const visibleTabs = computed(() => allTabs);

async function selectTab(tab: InventorySectorFilter) {
  activeTab.value = tab;
  currentPage.value = 1;
  stockStore.setActiveSector(tab);
  router.replace({
    query: {
      ...route.query,
      sector: tab,
      page: 1,
    },
  });
  await loadData(1);
}

async function changePage(page: number) {
  if (page < 1 || page > stockStore.pagination.totalPages) return;
  if (page === currentPage.value && stockStore.pagination.page === page) return;
  currentPage.value = page;
  router.replace({
    query: {
      ...route.query,
      page: page > 1 ? page : undefined,
    },
  });
  await loadData(page);
}

function handleExplicitSearch() {
  currentPage.value = 1;
  const query = search.value.trim();
  router.replace({
    query: {
      ...route.query,
      q: query || undefined,
      page: 1,
    },
  });
  loadData(1);
}

function clearSearch() {
  search.value = '';
  currentPage.value = 1;
  router.replace({
    query: {
      ...route.query,
      q: undefined,
      page: 1,
    },
  });
  loadData(1);
}

const searchTermsCount = computed(() => {
  if (!search.value) return 0;
  return search.value.split(/[,\s\n;]+/).map((t) => t.trim()).filter(Boolean).length;
});

// Opções de prateleiras onde o item selecionado possui vínculo
const itemAllocatedLocations = computed(() => {
  if (!selectedItem.value || !selectedItem.value.locations) return [];
  return selectedItem.value.locations
    .filter((locLink: any) => locLink.location)
    .map((locLink: any) => ({
      id: locLink.locationId || locLink.location.id,
      name: locLink.location.name,
      sector: locLink.location.sector,
      subsectorId: locLink.location.subsectorId ?? null,
      quantity: locLink.quantity || 0,
    }));
});

const itemSectorLocations = computed(() => {
  const itemSector = selectedItem.value?.sector || activeTab.value;
  const itemCategoryId = Number(selectedItem.value?.categoryId || 0);
  return stockStore.filterLocations.filter(location => {
    if (Number(location.subsectorId || 0) !== Number(selectedItem.value?.subsectorId || 0)) return false;
    const sameSector = !location.sector
      ? authStore.user?.role === 'admin' || authStore.user?.isGlobalAdmin === true
      : normalizeSector(location.sector) === normalizeSector(itemSector);
    if (!sameSector) return false;
    if (!itemCategoryId) return true;
    return Number(location.categoryId) === itemCategoryId
      || location.categoryLinks?.some(link => Number(link.categoryId) === itemCategoryId) === true;
  });
});

const itemSectorOrigins = computed(() => {
  const itemSector = selectedItem.value?.sector || activeTab.value;
  return stockStore.filterOrigins.filter(origin => !origin.sector || normalizeSector(origin.sector) === normalizeSector(itemSector));
});

const transferSourceLocations = computed(() => itemAllocatedLocations.value.filter(loc => {
  if (Number(loc.subsectorId || 0) !== Number(selectedItem.value?.subsectorId || 0)) return false;
  if (!loc.sector) return authStore.user?.role === 'admin' || authStore.user?.isGlobalAdmin === true;
  return normalizeSector(loc.sector) === normalizeSector(selectedItem.value?.sector || activeTab.value);
}));

// Prateleiras de destino disponíveis para transferência (exclui a prateleira de origem)
const availableDestinationLocations = computed(() => {
  return itemSectorLocations.value.filter(location => location.id !== selectedLocationId.value);
});

// Saldo disponível na prateleira de origem selecionada
const selectedLocationBalance = computed(() => {
  if (!selectedItem.value) return 0;
  if (!selectedLocationId.value) return selectedItem.value.quantity || 0;
  const found = itemAllocatedLocations.value.find((l: any) => l.id === selectedLocationId.value);
  return found ? (found.quantity || 0) : (selectedItem.value.quantity || 0);
});

const maxAvailableBalance = computed(() => {
  return selectedLocationBalance.value;
});

const { units: measurementUnits, fetchUnits } = useSettings({ notify: message => showToast(message, 'error') });
onMounted(fetchUnits);
const movementIntegerOnly = computed(() => selectedItem.value?.sector !== 'CORTE' || Boolean(measurementUnits.value.find(unit => unit.symbol === getItemUnitBadge(selectedItem.value))?.integerOnly));
const movementQuantityInvalid = computed(() => {
  const qty = Number(movementQuantity.value);
  return !Number.isFinite(qty) || qty <= 0 || (movementIntegerOnly.value ? !Number.isInteger(qty) : !/^\d+(?:\.\d{1,3})?$/.test(String(qty)));
});
// Trava reativa de quantidade excedente
const isExceedingBalance = computed(() => {
  if (movementType.value === 'ENTRADA') return false;
  const qty = Number(movementQuantity.value);
  if (!qty || isNaN(qty) || qty <= 0) return false;
  return qty > maxAvailableBalance.value;
});

// Validação completa para desabilitar o botão
const isFormInvalid = computed(() => {
  const qty = Number(movementQuantity.value);
  if (movementQuantityInvalid.value) return true;
  if (movementType.value !== 'ENTRADA' && isExceedingBalance.value) return true;
  if (!selectedLocationId.value) return true;
  if (movementType.value === 'ENTRADA' && !itemSectorLocations.value.some(loc => loc.id === selectedLocationId.value)) return true;
  if (movementType.value === 'TRANSFERENCIA' && !transferSourceLocations.value.some(loc => loc.id === selectedLocationId.value)) return true;
  if (movementType.value === 'TRANSFERENCIA' && (!destinationLocationId.value || destinationLocationId.value === selectedLocationId.value)) return true;
  if (movementType.value === 'ENTRADA' && !movementReason.value?.trim()) return true;
  return false;
});

// Dica amigável e dinâmica de validação para o operador
const formValidationHint = computed(() => {
  const qty = Number(movementQuantity.value);
  const unit = getItemUnitBadge(selectedItem.value);

  if (!qty || isNaN(qty) || qty <= 0) {
    return 'Digite a quantidade a movimentar.';
  }

  if (movementQuantityInvalid.value) return movementIntegerOnly.value ? 'A unidade exige uma quantidade inteira.' : 'Use até três casas decimais.';
  if (movementType.value !== 'ENTRADA' && isExceedingBalance.value) {
    return `Quantidade excede o saldo da prateleira (máx: ${formatNumber(maxAvailableBalance.value)} ${unit}).`;
  }

  if (movementType.value === 'TRANSFERENCIA') {
    if (!selectedLocationId.value) return 'Não há localização de origem permitida para esta transferência.';
    if (availableDestinationLocations.value.length === 0) {
      const currentItemSector = selectedItem.value?.sector || activeTab.value;
      return `Não há outra prateleira cadastrada no setor ${currentItemSector} para transferir.`;
    }
    if (!destinationLocationId.value) {
      return 'Selecione a prateleira de destino para transferir.';
    }
    if (destinationLocationId.value === selectedLocationId.value) {
      return 'A prateleira de destino deve ser diferente da origem.';
    }
  }

  if (movementType.value === 'ENTRADA' && !movementReason.value?.trim()) {
    return 'Selecione o motivo da movimentação.';
  }

  return '';
});

function setMovementType(type: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA') {
  movementType.value = type;
  if (type === 'ENTRADA' && !itemSectorLocations.value.some(loc => loc.id === selectedLocationId.value)) {
    selectedLocationId.value = itemSectorLocations.value[0]?.id || null;
  }
  movementReason.value = type === 'ENTRADA'
    ? (movementReason.value || itemSectorOrigins.value[0]?.name || '')
    : '';

  // Se a quantidade estiver vazia ou zero, sugere 1 ou o saldo disponível
  const currentQty = Number(movementQuantity.value);
  if (!currentQty || isNaN(currentQty) || currentQty <= 0) {
    if (type === 'ENTRADA') {
      movementQuantity.value = 1;
    } else {
      movementQuantity.value = maxAvailableBalance.value > 0 ? Math.min(1, maxAvailableBalance.value) : 1;
    }
  }

  // Na transferência, se houver apenas uma prateleira de destino válida, pré-seleciona
  if (type === 'TRANSFERENCIA') {
    if (!transferSourceLocations.value.some(loc => loc.id === selectedLocationId.value)) selectedLocationId.value = transferSourceLocations.value[0]?.id || null;
    if (!destinationLocationId.value && availableDestinationLocations.value.length === 1) {
      destinationLocationId.value = availableDestinationLocations.value[0].id;
    }
  }
}

watch(selectedLocationId, () => {
  if (movementType.value === 'TRANSFERENCIA') {
    if (destinationLocationId.value === selectedLocationId.value) {
      destinationLocationId.value = null;
    }
    if (!destinationLocationId.value && availableDestinationLocations.value.length === 1) {
      destinationLocationId.value = availableDestinationLocations.value[0].id;
    }
  }
});

const canOperateCurrentSector = computed(() => canOperateSector(activeTab.value));

function openMovementModal(item: any) {
  if (!canOperateSector(item?.sector)) return;
  selectedItem.value = {
    ...item,
    sector: item.sector || activeTab.value,
  };
  movementType.value = 'SAIDA';
  movementReason.value = '';
  movementObservation.value = '';

  if (item.locations && item.locations.length > 0) {
    selectedLocationId.value = item.locations[0].locationId || item.locations[0].location?.id || null;
  } else if (itemSectorLocations.value.length > 0) {
    selectedLocationId.value = itemSectorLocations.value[0].id;
  } else {
    selectedLocationId.value = null;
  }

  const initialMax = selectedLocationBalance.value;
  movementQuantity.value = initialMax > 0 ? Math.min(1, initialMax) : 1;

  if (availableDestinationLocations.value.length === 1) {
    destinationLocationId.value = availableDestinationLocations.value[0].id;
  } else {
    destinationLocationId.value = null;
  }

  movementSnapshot.value = movementValues();
  showMovementModal.value = true;
}

async function handleConfirmMovement() {
  if (!selectedItem.value || isFormInvalid.value) return;

  const qty = Number(movementQuantity.value);
  if (isNaN(qty) || qty <= 0) {
    showToast('A quantidade deve ser maior que zero.', 'error');
    return;
  }

  if (movementType.value !== 'ENTRADA' && qty > maxAvailableBalance.value) {
    showToast(`Quantidade excede o saldo disponível (${maxAvailableBalance.value})`, 'error');
    return;
  }

  if (movementType.value === 'TRANSFERENCIA') {
    if (!destinationLocationId.value) {
      showToast('Selecione a prateleira de destino para a transferência.', 'error');
      return;
    }
    if (selectedLocationId.value && selectedLocationId.value === destinationLocationId.value) {
      showToast('A prateleira de destino deve ser diferente da prateleira de origem.', 'error');
      return;
    }
  }

  movementLoading.value = true;
  try {
    await stockStore.createMovement({
      stockItemId: selectedItem.value.id,
      sector: selectedItem.value.sector || activeTab.value,
      type: movementType.value,
      quantity: qty,
      locationId: selectedLocationId.value ? Number(selectedLocationId.value) : undefined,
      destinationLocationId: destinationLocationId.value ? Number(destinationLocationId.value) : undefined,
      origem: movementReason.value.trim() || undefined,
      reason: movementObservation.value.trim() || undefined,
    });
    showToast(`Movimentação (${movementType.value}) registrada com sucesso!`);
    showMovementModal.value = false;
    selectedItem.value = null;
    loadData(currentPage.value);
  } catch (err: any) {
    showToast(err.message || 'Erro ao registrar movimentação', 'error');
  } finally {
    movementLoading.value = false;
  }
}

function getItemUnitBadge(item: any) {
  if (!item) return 'UN';
  if (item.sector === 'CORTE') {
    return item.unit || 'UN';
  }
  return item.unit || 'UN';
}

function getItemIdentifier(item: any) {
  if (!item) return '-';
  return item.code || item.pieceCode || item.sku || item.productName || `Item #${item.id}`;
}

function getItemDescription(item: any) {
  if (!item) return '';
  return item.name || item.description || item.productName || item.sku || '';
}

function getInventoryCardTitle(item: any) {
  const sector = normalizeSector(item?.sector || activeTab.value);
  if (sector === 'APOIO') return item.componentType === 'CABEDAL' ? item.sku || item.productName : item.pieceCode || item.sku;
  if (sector === 'CORTE') return item.code || item.sku || getItemIdentifier(item);
  return item.sku || item.productName || getItemIdentifier(item);
}

function getInventoryCardSubtitle(item: any) {
  const sector = normalizeSector(item?.sector || activeTab.value);
  if (activeTab.value === 'TODOS') return getItemDescription(item);
  if (sector === 'APOIO') return item.productName || '';
  if (sector === 'CORTE') return item.name || item.productName || item.description || '';
  return item.productName && item.productName !== getInventoryCardTitle(item) ? item.productName : '';
}

function getInventoryCardSide(item: any, emptyLabel = '—') {
  if (item?.footSide === 'E') return 'Pé esquerdo (E)';
  if (item?.footSide === 'D') return 'Pé direito (D)';
  if (item?.footSide === 'PAR') return 'Par completo';
  return emptyLabel;
}

function getInventoryCardFields(item: any) {
  const sector = normalizeSector(item?.sector || activeTab.value);
  const fields: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: unknown) => {
    const displayValue = value === null || value === undefined || String(value).trim() === '' ? '—' : String(value);
    fields.push({ label, value: displayValue });
  };
  const location = item.locationDisplay || '—';

  if (activeTab.value === 'TODOS') {
    add('Setor', SECTOR_OPTIONS.find(option => option.id === sector)?.label || formatSectorName(sector));
    add('Tipo / variação', item.type || item.materialColor || item.color || '—');
    if (item.sizeGrade) add('Grade', item.sizeGrade);
    if (item.footSide) add('Lado', getInventoryCardSide(item));
    add('Prateleira', location);
    return fields;
  }

  switch (sector) {
    case 'CORTE':
      add('Tipo', item.type);
      add('Prateleira', location);
      break;
    case 'APOIO':
      add('Material / categoria', `${item.description || item.name || '—'} · ${getInventoryTypeLabel(item.type || (item.componentType === 'CABEDAL' ? 'CABEDAL' : 'PECA_CORTADA'))}`);
      add('Combinação / cor', item.color || item.materialColor);
      add('Grade', item.sizeGrade);
      add('Lado', getInventoryCardSide(item));
      add('Prateleira', location);
      break;
    case 'PRE_FABRICADO':
      add('Material', getInventoryTypeLabel(item.type || '—'));
      add('Combinação', item.color);
      add('Grade', item.sizeGrade);
      add('Lado', getInventoryCardSide(item, 'Par completo'));
      add('Prateleira', location);
      break;
    case 'DISTRIBUICAO':
    case 'EXPEDICAO':
      add('Material', getInventoryTypeLabel(item.type || '—'));
      add('Cor', item.color);
      add('Grade', item.sizeGrade);
      add('Lado', getInventoryCardSide(item, 'Par / geral'));
      add('Prateleira', location);
      break;
    case 'MONTAGEM':
      add('Combinação', item.color);
      add('Grade', item.sizeGrade);
      add('Lado', getInventoryCardSide(item));
      add('Prateleira', location);
      break;
  }

  return fields;
}

watch(
  () => route.query.sector,
  (newSec) => {
    if (newSec) {
      const secUpper = normalizeSector(newSec) as InventorySectorFilter;
      const validFilter = validSectorFilters.includes(secUpper);
      if (validFilter && secUpper !== activeTab.value) {
        activeTab.value = secUpper;
        stockStore.setActiveSector(secUpper);
        loadData(1);
      }
    }
  }
);

onMounted(() => {
  const initialSector = validSectorFilters.includes(activeTab.value as InventorySectorFilter) ? activeTab.value as InventorySectorFilter : getSectorFromRoute();
  activeTab.value = initialSector;
  stockStore.setActiveSector(initialSector);
  if (route.query.sector !== initialSector) router.replace({ query: { ...route.query, sector: initialSector } });
  loadData(currentPage.value);
});
</script>

<template>
  <Layout>
    <ToastNotification :notification="notification" />
    <PageState :loading="stockStore.loading" :error="stockStore.error || ''" @retry="loadData(currentPage)" />

    <div class="flex flex-col min-h-full">
      <!-- Top Bar com Botão Novo Item e Atualizar -->
      <div class="flex flex-col sm:flex-row gap-3 items-center justify-between mx-4 my-4">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Estoque Multi-Setor</h1>
          <p class="text-xs text-gray-500">Gestão centralizada de saldos e sobras nos 5 setores industriais</p>
        </div>

        <div class="flex items-center gap-3">
          <button
            @click="() => loadData()"
            class="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-2 rounded flex items-center gap-1.5 shadow-sm text-xs font-medium transition-colors"
            title="Atualizar estoque"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': stockStore.loading }" />
            <span>Atualizar</span>
          </button>

          <button
            v-if="authStore.can('cadastrar_materiais') && canOperateCurrentSector"
            @click="openEntryForm"
            class="bg-blue-600 hover:bg-blue-800 text-white px-5 py-2 rounded flex items-center gap-2 shadow-sm transition-colors text-xs font-medium"
          >
            <Plus class="w-4 h-4" />
            <span>Nova Entrada Rápida</span>
          </button>
        </div>
      </div>

      <!-- Entrada Rápida em diálogo para preservar o contexto da consulta -->
      <div
        v-if="showEntryForm"
        ref="entryDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-entry-title"
        tabindex="-1"
        class="fixed inset-0 z-50 flex items-center justify-center overscroll-none bg-slate-950/60 p-0 backdrop-blur-[2px] sm:p-4"
        @click.self="closeEntryForm"
        @wheel.stop
        @touchmove.stop
      >
        <section class="flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[90vh] sm:max-h-[780px] sm:rounded-2xl sm:border sm:border-slate-200">
          <header class="flex shrink-0 items-center justify-between gap-4 border-b border-blue-700 bg-blue-600 px-4 py-3 text-white sm:px-6">
            <div class="flex min-w-0 items-center gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Plus class="h-5 w-5" />
              </div>
              <div class="min-w-0">
                <h2 id="quick-entry-title" class="truncate text-sm font-bold sm:text-base">Nova Entrada Rápida</h2>
                <p class="text-[11px] text-blue-100">Cadastre saldo no setor escolhido</p>
              </div>
            </div>
            <button
              type="button"
              @click="closeEntryForm"
              aria-label="Fechar entrada rápida"
              class="shrink-0 rounded-lg p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/80"
            >
              <X class="h-4 w-4" />
            </button>
          </header>

          <div class="min-h-0 flex-1 bg-slate-50 p-2 sm:p-4">
            <SectorFormInput
              ref="entryForm"
              @saved="handleEntrySaved"
              @cancel="showEntryForm = false"
            />
          </div>
        </section>
      </div>

      <!-- Busca sempre visível; filtros complementares recolhidos sob demanda. -->
      <div class="mx-4 mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4" @keydown.esc="showInventoryFilters = false">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center justify-between gap-2">
              <label class="block text-xs font-bold uppercase text-gray-500">
                Buscar por código, descrição ou característica
              </label>
              <span
                v-if="searchTermsCount > 1"
                class="shrink-0 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700"
              >
                {{ searchTermsCount }} termos pesquisados
              </span>
            </div>

            <div class="flex gap-2">
              <div class="relative min-w-0 flex-1">
                <input
                  v-model="search"
                  aria-label="Buscar itens do estoque"
                  @keydown.enter="handleExplicitSearch"
                  type="text"
                  placeholder="Código, descrição, modelo, cor..."
                  class="w-full rounded border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm outline-none placeholder:text-gray-500 focus:border-blue-500"
                />
                <button
                  v-if="search"
                  type="button"
                  @click="clearSearch"
                  class="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  title="Limpar busca"
                  aria-label="Limpar busca"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                @click="handleExplicitSearch"
                class="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Search class="h-4 w-4" />
                <span>Buscar</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            @click="showInventoryFilters = !showInventoryFilters"
            :aria-expanded="showInventoryFilters"
            aria-controls="inventory-filter-panel"
            class="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            <SlidersHorizontal class="h-4 w-4 text-gray-500" />
            <span>Filtros</span>
            <span
              v-if="activeInventoryFilterCount"
              class="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-700"
            >
              {{ activeInventoryFilterCount }}
            </span>
            <ChevronDown class="h-4 w-4 text-gray-400 transition-transform" :class="showInventoryFilters ? 'rotate-180' : ''" />
          </button>
        </div>

        <div v-if="hasInventoryFilters" class="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3" role="status" aria-live="polite">
          <span class="text-[11px] font-semibold text-gray-500">Selecionados:</span>
          <span
            v-for="filter in activeInventoryFilterSummary"
            :key="filter"
            :title="filter"
            class="max-w-[22rem] truncate rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700"
          >
            {{ filter }}
          </span>
          <button
            type="button"
            @click="clearInventoryFilters"
            class="ml-auto text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
          >
            Limpar filtros
          </button>
        </div>

        <div
          v-show="showInventoryFilters"
          id="inventory-filter-panel"
          class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4"
          role="region"
          aria-label="Filtros adicionais do estoque"
        >
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div class="min-w-0">
              <label for="inventory-model-filter" class="mb-1 block text-xs font-bold uppercase text-gray-500">Modelo / linha</label>
              <input
                id="inventory-model-filter"
                v-model="modelNameFilter"
                type="text"
                maxlength="100"
                placeholder="Ex.: Racer Speedzone"
                @change="applyInventoryFilters"
                @keydown.enter.prevent="applyInventoryFilters"
                class="w-full rounded border border-gray-200 bg-white p-2 text-sm outline-none placeholder:text-gray-500 focus:border-blue-500"
              />
            </div>

            <div class="min-w-0">
              <label for="inventory-material-color-filter" class="mb-1 block text-xs font-bold uppercase text-gray-500">Material / cor</label>
              <input
                id="inventory-material-color-filter"
                v-model="materialColorFilter"
                type="text"
                maxlength="100"
                placeholder="Ex.: Napa sintética preta"
                @change="applyInventoryFilters"
                @keydown.enter.prevent="applyInventoryFilters"
                class="w-full rounded border border-gray-200 bg-white p-2 text-sm outline-none placeholder:text-gray-500 focus:border-blue-500"
              />
            </div>

            <div class="min-w-0">
              <label for="inventory-location-filter" class="mb-1 block text-xs font-bold uppercase text-gray-500">Prateleira / Localização</label>
              <select id="inventory-location-filter" v-model="selectedLocationFilter" @change="applyInventoryFilters"
                class="w-full rounded border border-gray-200 bg-white p-2 text-sm outline-none focus:border-blue-500">
                <option value="">Todas as localizações</option>
                <option v-for="location in stockStore.filterLocations" :key="location.id" :value="String(location.id)">
                  {{ location.name }}
                </option>
              </select>
            </div>

            <div v-if="inventoryTypeOptions.length" class="min-w-0">
              <label for="inventory-type-filter" class="mb-1 block text-xs font-bold uppercase text-gray-500">Tipo / Categoria</label>
              <select id="inventory-type-filter" v-model="selectedTypeFilter" @change="applyInventoryFilters"
                class="w-full rounded border border-gray-200 bg-white p-2 text-sm outline-none focus:border-blue-500">
                <option value="">Todos os tipos</option>
                <option v-for="type in inventoryTypeOptions" :key="type" :value="type">
                  {{ getInventoryTypeLabel(type) }}
                </option>
              </select>
            </div>

            <div class="min-w-0">
              <label for="inventory-balance-filter" class="mb-1 block text-xs font-bold uppercase text-gray-500">Situação do saldo</label>
              <select id="inventory-balance-filter" v-model="stockStatusFilter" @change="applyInventoryFilters"
                class="w-full rounded border border-gray-200 bg-white p-2 text-sm outline-none focus:border-blue-500">
                <option value="">Todos os saldos</option>
                <option value="with_balance">Com saldo</option>
                <option value="zero_balance">Saldo zerado</option>
              </select>
            </div>

            <div class="min-w-0">
              <span class="mb-1 block text-xs font-bold uppercase text-gray-500">Exibição</span>
              <label for="inventory-page-size" class="sr-only">Itens por página</label>
              <select id="inventory-page-size" v-model.number="pageSize" @change="applyInventoryFilters"
                class="w-full rounded border border-gray-200 bg-white p-2 text-sm outline-none focus:border-blue-500">
                <option :value="50">50 itens por página</option>
                <option :value="100">100 itens por página</option>
                <option :value="200">200 itens por página</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Seletor único de setor: abas em telas largas e select em telas estreitas -->
      <div class="mx-4 rounded-t border-x border-t border-gray-200 bg-white px-3 pt-2">
        <label for="inventory-sector-mobile" class="sr-only">Setor do estoque</label>
        <select
          id="inventory-sector-mobile"
          :value="activeTab"
          @change="handleSectorSelect"
          class="mb-2 block w-full rounded border border-gray-200 bg-white p-2 text-sm font-medium outline-none focus:border-blue-500 sm:hidden"
        >
          <option v-for="t in visibleTabs" :key="t.id" :value="t.id">
            {{ t.label }} ({{ (stockStore.metrics as any)[t.countKey] || 0 }})
          </option>
        </select>

        <div class="hidden flex-wrap gap-x-2 gap-y-1 sm:flex" role="group" aria-label="Filtrar estoque por setor">
          <button
            v-for="t in visibleTabs"
            :key="t.id"
            type="button"
            @click="selectTab(t.id)"
            :aria-pressed="activeTab === t.id"
            class="flex max-w-full items-center gap-1.5 rounded-t px-3 py-2 text-xs font-bold transition-colors sm:whitespace-nowrap"
            :class="activeTab === t.id
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'"
          >
            <component :is="t.icon" class="h-3.5 w-3.5 shrink-0" />
            <span>{{ t.label }}</span>
            <span class="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-gray-600">
              {{ (stockStore.metrics as any)[t.countKey] || 0 }}
            </span>
          </button>
        </div>
      </div>

      <!-- Inventário por setor -->
      <div class="px-4 pb-4">
        <div class="overflow-hidden rounded-b border border-gray-200 bg-white shadow-sm">
          <div class="hidden overflow-x-auto xl:block">
          <table class="inventory-stock-table w-full text-left border-collapse">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr v-if="activeTab === 'TODOS'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Código / SKU</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Material / Descrição</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Setor</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Tipo / Variação</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>
              <!-- Headers CORTE -->
              <tr v-if="activeTab === 'CORTE'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Código</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Descrição / Material</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Tipo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers APOIO -->
              <tr v-if="activeTab === 'APOIO'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">CÓD. PEÇA / SKU · MODELO</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Peça / Cabedal</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Combinação / Cor</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Lado</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers PRÉ-FABRICADO -->
              <tr v-if="activeTab === 'PRE_FABRICADO'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">COD. PRODUTO / SKU</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Material</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">COMBINAÇÃO</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Lado do Pé</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers DISTRIBUIÇÃO -->
              <tr v-if="activeTab === 'DISTRIBUICAO' || activeTab === 'EXPEDICAO'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">COD. PRODUTO / SKU</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Material</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Cor</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Lado do Pé</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers MONTAGEM -->
              <tr v-if="activeTab === 'MONTAGEM'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">COD. PRODUTO / SKU</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Combinação</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Lado do Pé</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="item in currentSectorItems"
                :key="item.id"
                class="hover:bg-gray-50 border-b last:border-b-0 transition-colors"
              >
                <template v-if="activeTab === 'TODOS'">
                  <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ getItemIdentifier(item) }}</td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ getItemDescription(item) }}</td>
                  <td class="px-4 py-3 text-xs font-semibold text-slate-700">{{ SECTOR_OPTIONS.find(option => option.id === item.sector)?.label || item.sector }}</td>
                  <td class="px-4 py-3 text-xs text-gray-600">
                    <span>{{ item.type || item.materialColor || item.color || '—' }}</span>
                    <span v-if="item.sizeGrade" class="block text-[10px] text-gray-400">Grade {{ item.sizeGrade }}</span>
                    <span v-if="item.footSide" class="block text-[10px] text-gray-400">Pé {{ item.footSide }}</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                  <span class="whitespace-nowrap text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">{{ item.locationDisplay }}</span>
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-gray-800">
                    {{ formatNumber(item.quantity) }}
                    <span class="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded ml-1 border border-blue-100 font-mono font-semibold">{{ getItemUnitBadge(item) }}</span>
                  </td>
                </template>
                <!-- Colunas CORTE -->
                <template v-if="activeTab === 'CORTE'">
                  <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ item.code || item.sku }}</td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.name || item.productName }}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="px-2 py-0.5 text-xs bg-gray-100 rounded-full font-bold text-gray-600 border border-gray-200">
                      {{ item.type || '—' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="whitespace-nowrap text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
                      {{ item.locationDisplay }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-gray-800">
                    {{ formatNumber(item.quantity) }}
                    <span class="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded ml-1 border border-blue-100 font-mono font-semibold">
                      {{ getItemUnitBadge(item) }}
                    </span>
                  </td>
                </template>

                <!-- Colunas APOIO -->
                <template v-if="activeTab === 'APOIO'">
                  <td class="px-4 py-3">
                    <span class="font-mono text-sm font-bold text-blue-600 block">{{ item.componentType === 'CABEDAL' ? item.sku : item.pieceCode }}</span>
                    <span v-if="item.productName" class="text-xs font-bold text-gray-700 block"><span class="font-medium text-gray-500">Modelo/Linha:</span> {{ item.productName }}</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">
                    <span class="block">{{ item.description || item.type || '—' }}</span>
                    <span class="text-[10px] uppercase text-gray-400">{{ item.componentType === 'CABEDAL' ? 'Cabedal' : 'Peça cortada' }}</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600">{{ item.color || item.materialColor || '—' }}</td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center text-xs font-semibold text-gray-700">
                    {{ item.footSide === 'E' ? 'Esquerdo' : item.footSide === 'D' ? 'Direito' : item.footSide === 'PAR' ? 'Par' : '—' }}
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="whitespace-nowrap text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
                      {{ item.locationDisplay }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-gray-800">
                    {{ formatNumber(item.quantity) }}
                    <span class="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded ml-1 border border-blue-100 font-mono font-semibold">
                      {{ getItemUnitBadge(item) }}
                    </span>
                  </td>
                </template>

                <!-- Colunas PRÉ-FABRICADO -->
                <template v-if="activeTab === 'PRE_FABRICADO'">
                  <td class="px-4 py-3">
                    <span class="font-mono text-sm font-bold text-blue-600 block">{{ item.sku || item.productName }}</span>
                    <span v-if="item.productName && item.productName !== item.sku" class="text-xs font-bold text-gray-700 block">{{ item.productName }}</span>
                  </td>
                  <td class="px-4 py-3 text-center whitespace-nowrap">
                    <span class="px-2.5 py-1 text-xs rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                      {{ getInventoryTypeLabel(item.type || '—') }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.color }}</td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center">
                    <span
                      v-if="item.footSide"
                      class="whitespace-nowrap px-2 py-0.5 text-xs rounded-full font-bold border bg-slate-50 text-slate-700 border-slate-200"
                    >
                      {{ item.footSide === 'E' ? 'PÉ ESQUERDO (E)' : 'PÉ DIREITO (D)' }}
                    </span>
                    <span v-else class="text-xs text-gray-400 font-medium">
                      PAR COMPLETO
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="whitespace-nowrap text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
                      {{ item.locationDisplay }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-gray-800">
                    {{ formatNumber(item.quantity) }}
                    <span class="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded ml-1 border border-blue-100 font-mono font-semibold">
                      {{ getItemUnitBadge(item) }}
                    </span>
                  </td>
                </template>

                <!-- Colunas DISTRIBUIÇÃO -->
                <template v-if="activeTab === 'DISTRIBUICAO' || activeTab === 'EXPEDICAO'">
                  <td class="px-4 py-3">
                    <span class="font-mono text-sm font-bold text-blue-600 block">{{ item.sku }}</span>
                    <span v-if="item.productName" class="text-xs font-bold text-gray-700 block">{{ item.productName }}</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="px-2.5 py-1 text-xs rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {{ getInventoryTypeLabel(item.type || '—') }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.color }}</td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center">
                    <span
                      v-if="item.footSide"
                      class="whitespace-nowrap px-2 py-0.5 text-xs rounded-full font-bold border bg-slate-50 text-slate-700 border-slate-200"
                    >
                      {{ item.footSide === 'E' ? 'PÉ ESQUERDO (E)' : 'PÉ DIREITO (D)' }}
                    </span>
                    <span v-else class="text-xs text-gray-400 font-medium">
                      PAR / GERAL
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="whitespace-nowrap text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
                      {{ item.locationDisplay }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-gray-800">
                    {{ formatNumber(item.quantity) }}
                    <span class="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded ml-1 border border-blue-100 font-mono font-semibold">
                      {{ getItemUnitBadge(item) }}
                    </span>
                  </td>
                </template>

                <!-- Colunas MONTAGEM -->
                <template v-if="activeTab === 'MONTAGEM'">
                  <td class="px-4 py-3">
                    <span class="font-mono text-sm font-bold text-blue-600 block">{{ item.sku }}</span>
                    <span v-if="item.productName" class="text-xs font-bold text-gray-700 block">{{ item.productName }}</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span v-if="item.color" class="px-2 py-0.5 text-xs bg-slate-100 text-slate-800 font-semibold font-mono rounded border border-slate-200">
                      {{ item.color }}
                    </span>
                    <span v-else class="text-xs text-gray-400 font-mono">-</span>
                  </td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center">
                    <span
                      class="whitespace-nowrap px-2 py-0.5 text-xs rounded-full font-bold border bg-slate-50 text-slate-700 border-slate-200"
                    >
                      {{ item.footSide === 'E' ? 'PÉ ESQUERDO (E)' : 'PÉ DIREITO (D)' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="whitespace-nowrap text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
                      {{ item.locationDisplay }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-gray-800">
                    {{ formatNumber(item.quantity) }}
                    <span class="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded ml-1 border border-blue-100 font-mono font-semibold">
                      {{ getItemUnitBadge(item) }}
                    </span>
                  </td>
                </template>

                <!-- Ações -->
                <td class="px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-2">
                    <button
                      @click="viewingItem = item"
                      class="min-h-9 whitespace-nowrap text-gray-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-200 px-2.5 rounded text-xs flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      title="Visualizar Detalhes"
                    >
                      <Eye class="w-3.5 h-3.5" />
                      <span class="hidden xl:inline">Detalhes</span>
                    </button>

                    <span
                      v-if="!canOperateSector(item.sector)"
                      class="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded"
                      title="Você pode consultar este setor, mas suas permissões de alteração não incluem este setor."
                    >
                      Somente leitura
                    </span>

                    <button
                      v-if="authStore.can('movimentar') && canOperateSector(item.sector)"
                      @click="openMovementModal(item)"
                      class="min-h-9 whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white px-3 rounded text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      title="Registrar Movimentação de Estoque"
                    >
                      <ArrowLeftRight class="w-3.5 h-3.5" />
                      <span>Movimentar</span>
                    </button>

                    <button
                      v-if="canDeleteItem(item)"
                      @click="confirmDelete(item)"
                      class="min-h-9 whitespace-nowrap text-gray-500 hover:text-red-700 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 px-2.5 rounded text-xs flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      title="Excluir Item do Estoque (Apenas Saldo Zerado)"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                      <span class="hidden xl:inline">Excluir</span>
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-if="!stockStore.loading && !stockStore.error && currentSectorItems.length === 0">
                <td colspan="8" class="p-8 text-center text-gray-400 font-medium text-sm">
                  {{ activeTab === 'TODOS' ? 'Nenhum item encontrado na unidade.' : 'Nenhum item encontrado para este setor.' }}
                </td>
              </tr>
            </tbody>
          </table>
          </div>

          <div class="p-3 sm:p-4 xl:hidden">
            <p
              v-if="!stockStore.loading && !stockStore.error && currentSectorItems.length === 0"
              class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm font-medium text-gray-500"
            >
              {{ activeTab === 'TODOS' ? 'Nenhum item encontrado na unidade.' : 'Nenhum item encontrado para este setor.' }}
            </p>

            <div v-else-if="currentSectorItems.length > 0" class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <article
                v-for="item in currentSectorItems"
                :key="`card-${item.id}`"
                class="min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/20 sm:p-4"
              >
                <header class="flex min-w-0 items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="break-all font-mono text-sm font-bold text-blue-700">
                      {{ getInventoryCardTitle(item) || 'Item sem código' }}
                    </p>
                    <p v-if="getInventoryCardSubtitle(item)" class="mt-1 break-words text-sm font-semibold text-gray-700">
                      {{ getInventoryCardSubtitle(item) }}
                    </p>
                  </div>
                  <div class="shrink-0 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-right">
                    <span class="block text-[10px] font-bold uppercase tracking-wide text-blue-700">Saldo</span>
                    <span class="font-mono text-sm font-bold text-gray-900">
                      {{ formatNumber(item.quantity) }}
                      <span class="text-xs text-blue-800">{{ getItemUnitBadge(item) }}</span>
                    </span>
                  </div>
                </header>

                <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-gray-100 pt-3">
                  <div v-for="field in getInventoryCardFields(item)" :key="`${item.id}-${field.label}`" class="min-w-0">
                    <dt class="text-[10px] font-bold uppercase tracking-wide text-gray-500">{{ field.label }}</dt>
                    <dd class="mt-0.5 break-words text-xs font-medium leading-snug text-gray-800">{{ field.value }}</dd>
                  </div>
                </dl>

                <footer class="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    @click="viewingItem = item"
                    class="inline-flex min-h-10 min-w-[7.25rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    title="Visualizar Detalhes"
                    aria-label="Visualizar detalhes do item"
                  >
                    <Eye class="h-4 w-4" />
                    <span>Detalhes</span>
                  </button>

                  <span
                    v-if="!canOperateSector(item.sector)"
                    class="inline-flex min-h-10 min-w-[7.25rem] flex-1 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-3 text-center text-[11px] font-medium text-slate-600"
                    title="Você pode consultar este setor, mas suas permissões de alteração não incluem este setor."
                  >
                    Somente leitura
                  </span>

                  <button
                    v-if="authStore.can('movimentar') && canOperateSector(item.sector)"
                    type="button"
                    @click="openMovementModal(item)"
                    class="inline-flex min-h-10 min-w-[7.25rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    title="Registrar Movimentação de Estoque"
                  >
                    <ArrowLeftRight class="h-4 w-4" />
                    <span>Movimentar</span>
                  </button>

                  <button
                    v-if="canDeleteItem(item)"
                    type="button"
                    @click="confirmDelete(item)"
                    class="inline-flex min-h-10 min-w-[7.25rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    title="Excluir Item do Estoque (Apenas Saldo Zerado)"
                  >
                    <Trash2 class="h-4 w-4" />
                    <span>Excluir</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>

          <!-- BARRA DE PAGINAÇÃO DE ALTA ESCALA (>3.000 ITENS) -->
          <div
            v-if="stockStore.pagination.total > 0"
            class="px-4 py-3 bg-gray-50/90 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600 rounded-b"
          >
            <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>Mostrando</span>
              <span class="font-bold text-gray-900">
                {{ (stockStore.pagination.page - 1) * stockStore.pagination.limit + 1 }}
              </span>
              <span>a</span>
              <span class="font-bold text-gray-900">
                {{ Math.min(stockStore.pagination.page * stockStore.pagination.limit, stockStore.pagination.total) }}
              </span>
              <span>de</span>
              <span class="font-bold text-gray-900">{{ formatNumber(stockStore.pagination.total) }}</span>
              <span>{{ activeTab === 'TODOS' ? 'itens encontrados em todos os setores' : `itens encontrados no setor ${formatSectorName(activeTab)}` }}</span>
            </div>

            <div class="flex items-center gap-1">
              <button
                @click="changePage(1)"
                :disabled="stockStore.pagination.page <= 1"
                class="px-2 py-1 rounded border bg-white border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Primeira Página"
              >
                <ChevronsLeft class="w-3.5 h-3.5" />
              </button>

              <button
                @click="changePage(stockStore.pagination.page - 1)"
                :disabled="stockStore.pagination.page <= 1"
                class="px-2.5 py-1 rounded border bg-white border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors font-medium"
              >
                <ChevronLeft class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">Anterior</span>
              </button>

              <span class="px-3 py-1 font-bold text-gray-800 bg-white border border-gray-200 rounded shadow-2xs">
                {{ stockStore.pagination.page }} / {{ stockStore.pagination.totalPages }}
              </span>

              <button
                @click="changePage(stockStore.pagination.page + 1)"
                :disabled="stockStore.pagination.page >= stockStore.pagination.totalPages"
                class="px-2.5 py-1 rounded border bg-white border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors font-medium"
              >
                <span class="hidden sm:inline">Próxima</span>
                <ChevronRight class="w-3.5 h-3.5" />
              </button>

              <button
                @click="changePage(stockStore.pagination.totalPages)"
                :disabled="stockStore.pagination.page >= stockStore.pagination.totalPages"
                class="px-2 py-1 rounded border bg-white border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Última Página"
              >
                <ChevronsRight class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal de Detalhes Padrão Materials.vue -->
      <InventoryItemDetails :item="viewingItem" :unit="viewingItem ? getItemUnitBadge(viewingItem) : ''" @close="viewingItem = null" />

      <!-- MODAL UNIFICADO ROBUSTO DE MOVIMENTAÇÃO DE ESTOQUE MULTI-SETOR -->
      <div v-if="showMovementModal && selectedItem" ref="movementDialog" role="dialog" aria-modal="true" aria-label="Movimentação de estoque" tabindex="-1" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
          <!-- Cabeçalho do Modal -->
          <div class="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h3 class="font-bold text-gray-800 text-base flex items-center gap-2">
                <ArrowLeftRight class="w-5 h-5 text-blue-600" />
                <span>Movimentar Estoque</span>
              </h3>
              <p class="text-xs text-gray-500">Registro com rastreabilidade auditável e controle por prateleira</p>
            </div>
            <button @click="closeMovementModal" aria-label="Fechar movimentação" class="text-gray-400 hover:text-gray-600 font-bold text-xl leading-none">
              &times;
            </button>
          </div>

          <div class="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
            <!-- Card de Resumo do Item Selecionado -->
            <div class="bg-blue-50/60 border border-blue-100 rounded-lg p-3.5">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <span class="font-mono font-bold text-blue-800 text-sm bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                  {{ getItemIdentifier(selectedItem) }}
                </span>
                <span class="px-2 py-0.5 text-[11px] rounded-full font-bold bg-blue-100 text-blue-900 border border-blue-200 uppercase">
                  SETOR {{ formatSectorName(selectedItem.sector, selectedItem.sector) }}
                </span>
              </div>

              <div class="text-xs font-semibold text-gray-800 mb-2">
                {{ getItemDescription(selectedItem) }}
                <span v-if="selectedItem.sector === 'PRE_FABRICADO' && selectedItem.type" class="text-emerald-700 font-bold ml-1">
                  [{{ getInventoryTypeLabel(selectedItem.type) }}]
                </span>
                <span v-if="(selectedItem.sector === 'DISTRIBUICAO' || selectedItem.sector === 'EXPEDICAO') && selectedItem.type" class="text-indigo-700 font-bold ml-1">
                  [{{ getInventoryTypeLabel(selectedItem.type) }}]
                </span>
                <span v-if="selectedItem.sizeGrade" class="text-gray-600 font-normal">
                  - Grade: <strong>{{ selectedItem.sizeGrade }}</strong>
                </span>
                <span v-if="selectedItem.footSide" class="text-gray-600 font-normal ml-1">
                  ({{ selectedItem.footSide === 'E' ? 'Pé Esquerdo' : 'Pé Direito' }})
                </span>
              </div>

              <div class="flex items-center justify-between border-t border-blue-100/80 pt-2 text-xs">
                <span class="text-gray-600">Subsetor do item:</span>
                <span class="font-semibold text-gray-800">{{ selectedItem.subsector?.name || 'Sem subsetor (fluxo legado do setor)' }}</span>
              </div>
              <p class="mt-1 text-[10px] text-gray-500">A movimentação mantém o subsetor do item; somente localizações desse mesmo escopo são aceitas.</p>

              <div class="flex items-center justify-between text-xs pt-2 border-t border-blue-100/80">
                <span class="text-gray-600">Saldo Atual Total:</span>
                <span class="font-bold text-gray-900 text-sm">
                  {{ formatNumber(selectedItem.quantity) }}
                  <span class="text-xs font-mono text-blue-700 bg-blue-100/70 px-1 py-0.5 rounded">
                    {{ getItemUnitBadge(selectedItem) }}
                  </span>
                </span>
              </div>
            </div>

            <!-- Seletor Visual de Tipo de Operação (3 Botões Simplificados) -->
            <div>
              <label class="block font-bold text-gray-600 uppercase mb-1.5 tracking-wide">
                Tipo de Operação *
              </label>
              <div class="grid grid-cols-3 gap-2">
                <!-- ENTRADA -->
                <button
                  type="button"
                  @click="setMovementType('ENTRADA')"
                  :class="movementType === 'ENTRADA'
                    ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-300 font-bold shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700'"
                  class="border rounded-lg p-3 flex flex-col items-center justify-center gap-1.5 transition-all text-center"
                >
                  <ArrowDownRight class="w-4 h-4" />
                  <span class="text-xs font-semibold">ENTRADA</span>
                </button>

                <!-- SAÍDA -->
                <button
                  type="button"
                  @click="setMovementType('SAIDA')"
                  :class="movementType === 'SAIDA'
                    ? 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-300 font-bold shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-amber-50 hover:text-amber-700'"
                  class="border rounded-lg p-3 flex flex-col items-center justify-center gap-1.5 transition-all text-center"
                >
                  <ArrowUpRight class="w-4 h-4" />
                  <span class="text-xs font-semibold">SAÍDA</span>
                </button>

                <!-- TRANSFERÊNCIA -->
                <button
                  type="button"
                  @click="setMovementType('TRANSFERENCIA')"
                  :class="movementType === 'TRANSFERENCIA'
                    ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300 font-bold shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700'"
                  class="border rounded-lg p-3 flex flex-col items-center justify-center gap-1.5 transition-all text-center"
                >
                  <ArrowLeftRight class="w-4 h-4" />
                  <span class="text-xs font-semibold">TRANSFERÊNCIA</span>
                </button>
              </div>

              <!-- Nota explicativa da Transferência -->
              <div v-if="movementType === 'TRANSFERENCIA'" class="p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-blue-800 text-xs mt-2">
                <Info class="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>A transferência física redistribui o saldo entre prateleiras do mesmo setor, sem alterar o saldo total do item.</span>
              </div>
            </div>

            <!-- Quantidade a Movimentar -->
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="font-bold text-gray-600 uppercase tracking-wide">
                  Quantidade a Movimentar *
                </label>
                <span v-if="movementType !== 'ENTRADA'" class="text-[11px] text-gray-500 font-medium">
                  Saldo disponível na prateleira: <strong class="text-gray-700">{{ formatNumber(maxAvailableBalance) }} {{ getItemUnitBadge(selectedItem) }}</strong>
                </span>
                <span v-else class="text-[11px] text-emerald-600 font-semibold">
                  Soma ao estoque existente
                </span>
              </div>
              <div class="relative">
                <input
                  v-model.number="movementQuantity"
                  aria-label="Quantidade da movimentação"
                  type="number"
                  :min="movementIntegerOnly ? 1 : 0.001"
                  :step="movementIntegerOnly ? 1 : 0.001"
                  :class="isExceedingBalance ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500 bg-rose-50/40 text-rose-900' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-gray-900 bg-white'"
                  class="w-full border p-2.5 rounded-lg outline-none focus:ring-1 font-bold text-sm"
                  placeholder="0.00"
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                  {{ getItemUnitBadge(selectedItem) }}
                </span>
              </div>

              <!-- Alerta Visual em Vermelho quando ultrapassa o saldo disponível -->
              <p v-if="isExceedingBalance" class="text-rose-600 font-bold text-xs mt-1.5 flex items-center gap-1">
                <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                <span>Quantidade excede o saldo disponível ({{ formatNumber(maxAvailableBalance) }} {{ getItemUnitBadge(selectedItem) }})</span>
              </p>
            </div>

            <!-- Prateleira de Origem / Alocada -->
            <div>
              <label class="block font-bold text-gray-600 uppercase mb-1 tracking-wide">
                {{ movementType === 'TRANSFERENCIA' ? 'Prateleira de Origem *' : (movementType === 'ENTRADA' ? 'Prateleira de Destino/Entrada *' : 'Prateleira de Saída *') }}
              </label>

              <!-- Para Entrada: Todas as localizações da fábrica -->
              <select
                v-if="movementType === 'ENTRADA'"
                v-model.number="selectedLocationId"
                aria-label="Prateleira da movimentação"
                class="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white font-medium text-gray-800 text-xs"
              >
                <option v-for="loc in itemSectorLocations" :key="loc.id" :value="loc.id">
                  {{ loc.name }}
                </option>
              </select>

              <!-- Para Saída e Transferência: Prateleiras onde o item já está alocado -->
              <select
                v-else
                v-model.number="selectedLocationId"
                aria-label="Prateleira de origem"
                class="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white font-medium text-gray-800 text-xs"
              >
                <option v-for="loc in (movementType === 'TRANSFERENCIA' ? transferSourceLocations : (itemAllocatedLocations.length > 0 ? itemAllocatedLocations : itemSectorLocations))" :key="loc.id" :value="loc.id">
                  {{ loc.name }} {{ loc.quantity !== undefined ? `(Saldo: ${formatNumber(loc.quantity)} ${getItemUnitBadge(selectedItem)})` : '' }}
                </option>
              </select>
            </div>

            <!-- Prateleira de Destino (Somente Transferência) -->
            <div v-if="movementType === 'TRANSFERENCIA'">
              <label class="block font-bold text-gray-600 uppercase mb-1 tracking-wide">
                Prateleira de Destino *
              </label>
              <div
                v-if="availableDestinationLocations.length === 0"
                class="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-800 text-xs"
              >
                <AlertCircle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Não há outra prateleira cadastrada no setor <strong>{{ formatSectorName(selectedItem?.sector || activeTab) }}</strong> para transferir. Cadastre prateleiras adicionais no menu <strong>Configurações</strong>.</span>
              </div>
              <div v-else class="space-y-2">
                <select
                  v-model.number="destinationLocationId"
                  aria-label="Prateleira de destino"
                  class="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white font-bold text-blue-900 text-xs"
                  required
                >
                  <option :value="null" disabled>Selecione a prateleira de destino...</option>
                  <option v-for="loc in availableDestinationLocations" :key="loc.id" :value="loc.id">
                    {{ loc.name }} {{ loc.sector ? `[${formatSectorName(loc.sector)}]` : '' }}
                  </option>
                </select>


              </div>
            </div>

            <!-- Origem / Motivo opcional para entradas -->
            <div v-if="movementType === 'ENTRADA'">
              <label class="block font-bold text-gray-600 uppercase mb-1 tracking-wide">
                Motivo / Origem da Sobra (opcional)
              </label>
              <select
                v-model="movementReason"
                aria-label="Motivo da movimentação"
                class="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white text-gray-800 text-xs font-medium"
              >
                <option value="" disabled>
                  {{ itemSectorOrigins.length ? 'Selecione um motivo (opcional)...' : 'Nenhuma origem cadastrada (opcional)' }}
                </option>
                <option v-for="orig in itemSectorOrigins" :key="orig.id" :value="orig.name">
                  {{ orig.name }}
                </option>
              </select>
            </div>

            <!-- Observações Operacionais -->
            <div>
              <label class="block font-bold text-gray-600 uppercase mb-1 tracking-wide">
                Observações / Justificativa
              </label>
              <textarea
                v-model="movementObservation"
                aria-label="Observações da movimentação"
                rows="2"
                placeholder="Detalhes operacionais sobre a movimentação..."
                class="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 text-gray-800 text-xs resize-none"
              ></textarea>
            </div>

            <!-- Identificação do Operador Responsável -->
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-2.5 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <User class="w-4 h-4 text-gray-500" />
                <div>
                  <span class="text-[11px] text-gray-500 block">Operador Responsável</span>
                  <span class="font-bold text-gray-800 text-xs">
                    {{ authStore.user?.nome || authStore.user?.usuario || 'Operador Logado' }}
                  </span>
                </div>
              </div>
              <span class="text-[11px] font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 font-semibold">
                Matrícula: {{ authStore.user?.registration || authStore.user?.matricula || authStore.user?.matriculaDass || authStore.user?.id || '-' }}
              </span>
            </div>
          </div>

          <!-- Rodapé do Modal -->
          <div class="bg-gray-50 px-6 py-3.5 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div class="text-xs text-amber-700 font-medium flex items-center gap-1.5 w-full sm:w-auto">
              <span v-if="isFormInvalid && formValidationHint" class="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1.5 rounded-lg font-medium text-[11px]">
                <AlertCircle class="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>{{ formValidationHint }}</span>
              </span>
            </div>
            <div class="flex justify-end gap-3 w-full sm:w-auto shrink-0">
              <button
                type="button"
                @click="closeMovementModal"
                class="bg-white hover:bg-gray-100 text-gray-700 font-medium px-4 py-2 rounded-lg text-xs border border-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                :disabled="movementLoading || isFormInvalid"
                @click="handleConfirmMovement"
                class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg text-xs shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw v-if="movementLoading" class="w-3.5 h-3.5 animate-spin" />
                <span>{{ movementLoading ? 'Registrando...' : `Confirmar ${movementType}` }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de Confirmação Corporativo -->
    <ConfirmModal
      :show="confirmState.show"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-text="confirmState.confirmText"
      :variant="confirmState.variant"
      :loading="confirmState.loading"
      @confirm="handleConfirmedAction"
      @cancel="confirmState.show = false"
    />
  </Layout>
</template>

<style scoped>
.inventory-stock-table {
  min-width: 76rem;
  table-layout: auto;
}

.inventory-stock-table th {
  white-space: nowrap;
}

.inventory-stock-table td {
  vertical-align: middle;
}

.inventory-stock-table th:not(:first-child):not(:last-child),
.inventory-stock-table td:not(:first-child):not(:last-child) {
  min-width: 7.5rem;
}

.inventory-stock-table th:first-child,
.inventory-stock-table td:first-child {
  min-width: 12rem;
}

.inventory-stock-table th:nth-child(2):not(:first-child):not(:last-child),
.inventory-stock-table td:nth-child(2):not(:first-child):not(:last-child) {
  min-width: 9rem;
}

.inventory-stock-table th:last-child,
.inventory-stock-table td:last-child {
  min-width: 14.5rem;
}

.inventory-stock-table td:nth-last-child(2) {
  min-width: 7.5rem;
  white-space: nowrap;
}
</style>
