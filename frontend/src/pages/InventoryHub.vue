<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Layout from '@/components/Layout.vue';
import { useStockStore, SectorType } from '@/stores/stockStore';
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
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { useModalFocus } from '@/composables/useModalFocus';
import { normalizeSector, SECTOR_OPTIONS } from '@/utils/domain';
import { 
  Plus, RefreshCw, ArrowLeftRight, X, Eye, 
  Scissors, Wrench, Layers, Box, Footprints,
  ArrowDownRight, ArrowUpRight, Trash2, User, CheckCircle2, AlertCircle, Info,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const stockStore = useStockStore();
const authStore = useAuthStore();

const validSectors: SectorType[] = ['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'];

const userSector = computed(() => {
  const s = authStore.user?.assignedSector;
  if (!s || s === 'TODOS') return null;
  return normalizeSector(s) as SectorType;
});

const isSectorLocked = computed(() => {
  return authStore.userRole !== 'admin' && !authStore.isAdmin && !!userSector.value;
});

function getSectorFromRoute(): SectorType {
  if (isSectorLocked.value && userSector.value) {
    return userSector.value;
  }
  const rawSec = (route.query.sector as string)?.toUpperCase();
  const sec = rawSec === 'EXPEDICAO' || rawSec === 'CABEDAIS' ? 'DISTRIBUICAO' : rawSec;
  if (sec && validSectors.includes(sec as SectorType)) {
    return sec as SectorType;
  }
  return 'CORTE';
}

const showEntryForm = ref(false);
const entryForm = ref<any>(null);
function toggleEntryForm() {
  if (showEntryForm.value && entryForm.value?.confirmDiscard && !entryForm.value.confirmDiscard()) return;
  showEntryForm.value = !showEntryForm.value;
}
const { activeTab, search, currentPage, selectedLocationFilter, loadData } = useInventoryQuery(stockStore, authStore, route, getSectorFromRoute());

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
function closeMovementModal() {
  if (!movementLoading.value && confirmDiscard()) showMovementModal.value = false;
}
useModalFocus(() => showMovementModal.value, movementDialog, closeMovementModal);

// Modal de Detalhes
const viewingItem = ref<any>(null);

// Permissão para Excluir (apenas admin_master e admin_setor no respectivo setor)
const canDelete = computed(() => {
  const role = authStore.user?.role;
  if (role === 'admin' || authStore.isAdmin) return true;
  if (role === 'admin_setor') {
    const userSec = authStore.user?.assignedSector;
    if (!userSec || userSec === 'TODOS') return true;
    const normUserSec = userSec === 'EXPEDICAO' || userSec === 'CABEDAIS' ? 'DISTRIBUICAO' : userSec;
    const normActiveTab = activeTab.value === 'EXPEDICAO' || (activeTab.value as string) === 'CABEDAIS' ? 'DISTRIBUICAO' : activeTab.value;
    return normUserSec === normActiveTab;
  }
  return false;
});

// Modal de Confirmação Corporativo
const { confirmState, openConfirmModal, handleConfirmedAction } = useConfirmModal();

function confirmDelete(item: any) {
  const isCorte = activeTab.value === 'CORTE' || item.sector === 'CORTE';
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
  { id: 'CORTE' as SectorType, countKey: 'totalCorte', icon: Scissors },
  { id: 'APOIO' as SectorType, countKey: 'totalApoio', icon: Wrench },
  { id: 'PRE_FABRICADO' as SectorType, countKey: 'totalPreFabricado', icon: Layers },
  { id: 'DISTRIBUICAO' as SectorType, countKey: 'totalExpedicao', icon: Box },
  { id: 'MONTAGEM' as SectorType, countKey: 'totalMontagem', icon: Footprints },
].map((tab) => {
  const sector = SECTOR_OPTIONS.find((option) => option.id === tab.id);
  return { ...tab, label: sector?.shortLabel || sector?.label || tab.id };
});

const visibleTabs = computed(() => {
  if (isSectorLocked.value && userSector.value) {
    return allTabs.filter(t => t.id === userSector.value);
  }
  return allTabs;
});

async function selectTab(tab: SectorType) {
  if (isSectorLocked.value && userSector.value && tab !== userSector.value) {
    return;
  }
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
  selectedLocationFilter.value = '';
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
      quantity: locLink.quantity || 0,
    }));
});

// Prateleiras de destino disponíveis para transferência (exclui a prateleira de origem)
const availableDestinationLocations = computed(() => {
  const currentItemSector = selectedItem.value?.sector || activeTab.value;
  const isAdminMaster = authStore.user?.role === 'admin';

  return stockStore.filterLocations.filter((loc) => {
    // Exclui a prateleira de origem atual
    if (loc.id === selectedLocationId.value) return false;

    // Se for admin_master, exibe todas as prateleiras da fábrica
    if (isAdminMaster) return true;

    // Para líderes e operadores: exibe SOMENTE prateleiras do próprio setor
    if (!loc.sector) {
      return currentItemSector === 'CORTE';
    }
    const normLocSector = loc.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : loc.sector;
    const normItemSector = currentItemSector === 'EXPEDICAO' ? 'DISTRIBUICAO' : currentItemSector;
    return normLocSector === normItemSector;
  });
});

// Identifica se a prateleira de destino selecionada é de outro setor (exclusivo para Admin Master)
const selectedDestinationLocation = computed(() => {
  if (!destinationLocationId.value) return null;
  return stockStore.filterLocations.find((l) => l.id === destinationLocationId.value) || null;
});

const isCrossSectorTransfer = computed(() => {
  if (movementType.value !== 'TRANSFERENCIA') return false;
  if (!selectedDestinationLocation.value) return false;
  const currentItemSector = selectedItem.value?.sector || activeTab.value;
  const destSec = selectedDestinationLocation.value.sector;
  if (!destSec) return false;
  const normLocSector = destSec === 'EXPEDICAO' ? 'DISTRIBUICAO' : destSec;
  const normItemSector = currentItemSector === 'EXPEDICAO' ? 'DISTRIBUICAO' : currentItemSector;
  return normLocSector !== normItemSector;
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
  if (!qty || isNaN(qty) || qty <= 0) return true;
  if (movementType.value !== 'ENTRADA' && isExceedingBalance.value) return true;
  if (movementType.value === 'TRANSFERENCIA' && (!destinationLocationId.value || destinationLocationId.value === selectedLocationId.value)) return true;
  if (isCrossSectorTransfer.value && !movementObservation.value?.trim()) return true;
  if (!movementReason.value?.trim()) return true;
  return false;
});

// Dica amigável e dinâmica de validação para o operador
const formValidationHint = computed(() => {
  const qty = Number(movementQuantity.value);
  const unit = getItemUnitBadge(selectedItem.value);

  if (!qty || isNaN(qty) || qty <= 0) {
    return 'Digite a quantidade a movimentar.';
  }

  if (movementType.value !== 'ENTRADA' && isExceedingBalance.value) {
    return `Quantidade excede o saldo da prateleira (máx: ${formatNumber(maxAvailableBalance.value)} ${unit}).`;
  }

  if (movementType.value === 'TRANSFERENCIA') {
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
    if (isCrossSectorTransfer.value && !movementObservation.value?.trim()) {
      return 'Para transferência intersetorial, a justificativa nas observações é obrigatória.';
    }
  }

  if (!movementReason.value?.trim()) {
    return 'Selecione o motivo da movimentação.';
  }

  return '';
});

function setMovementType(type: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA') {
  movementType.value = type;

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

const canOperateCurrentSector = computed(() => {
  if (!authStore.user) return false;
  if (authStore.user.role === 'admin') return true;
  if (authStore.user.role === 'leitor') return false;
  if (!authStore.user.assignedSector || authStore.user.assignedSector === 'TODOS') return true;
  const userSec = authStore.user.assignedSector.toUpperCase().trim();
  const normUserSec = (userSec === 'EXPEDICAO' || userSec === 'CABEDAIS') ? 'DISTRIBUICAO' : userSec;
  const tabSec = activeTab.value.toUpperCase().trim();
  const normTabSec = (tabSec === 'EXPEDICAO' || tabSec === 'CABEDAIS') ? 'DISTRIBUICAO' : tabSec;
  return normUserSec === normTabSec;
});

function openMovementModal(item: any) {
  selectedItem.value = {
    ...item,
    sector: activeTab.value,
  };
  movementType.value = 'SAIDA';
  movementReason.value = stockStore.filterOrigins.length > 0 ? stockStore.filterOrigins[0].name : 'Consumo de Produção';
  movementObservation.value = '';

  if (item.locations && item.locations.length > 0) {
    selectedLocationId.value = item.locations[0].locationId || item.locations[0].location?.id || null;
  } else if (stockStore.filterLocations.length > 0) {
    selectedLocationId.value = stockStore.filterLocations[0].id;
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

  if (!movementReason.value.trim()) {
    showToast('Selecione o motivo/origem da movimentação.', 'error');
    return;
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
      origem: movementReason.value.trim(),
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
  if (!item) return 'UND';
  if (item.sector === 'CORTE') {
    return item.unit || 'UN';
  }
  return item.unit || 'UND';
}

function getItemIdentifier(item: any) {
  if (!item) return '-';
  return item.code || item.pieceCode || item.sku || item.productName || `Item #${item.id}`;
}

function getItemDescription(item: any) {
  if (!item) return '';
  return item.name || item.description || item.productName || item.sku || '';
}

watch(
  () => route.query.sector,
  (newSec) => {
    if (isSectorLocked.value && userSector.value) {
      if (newSec !== userSector.value) {
        router.replace({
          query: { ...route.query, sector: userSector.value }
        });
      }
      return;
    }
    if (newSec) {
      const rawUpper = (newSec as string).toUpperCase();
      const secUpper = (rawUpper === 'EXPEDICAO' || rawUpper === 'CABEDAIS' ? 'DISTRIBUICAO' : rawUpper) as SectorType;
      if (validSectors.includes(secUpper) && secUpper !== activeTab.value) {
        activeTab.value = secUpper;
        stockStore.setActiveSector(secUpper);
        loadData(1);
      }
    }
  }
);

onMounted(() => {
  const initialSector = isSectorLocked.value ? getSectorFromRoute() : (validSectors.includes(activeTab.value) ? activeTab.value : getSectorFromRoute());
  activeTab.value = initialSector;
  stockStore.setActiveSector(initialSector);
  if (isSectorLocked.value && route.query.sector !== initialSector) {
    router.replace({
      query: { ...route.query, sector: initialSector }
    });
  }
  loadData(currentPage.value);
});
</script>

<template>
  <Layout>
    <ToastNotification :notification="notification" />
    <PageState :loading="stockStore.loading" :error="stockStore.error || ''" @retry="loadData(currentPage)" />

    <div class="flex flex-col h-full">
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
            @click="toggleEntryForm"
            class="bg-blue-600 hover:bg-blue-800 text-white px-5 py-2 rounded flex items-center gap-2 shadow-sm transition-colors text-xs font-medium"
          >
            <Plus class="w-4 h-4" />
            <span>{{ showEntryForm ? 'Fechar Formulário' : 'Nova Entrada Rápida' }}</span>
          </button>
        </div>
      </div>

      <!-- Formulário de Entrada Rápida (Expansível) -->
      <div v-if="showEntryForm" class="mx-4">
        <SectorFormInput ref="entryForm" @saved="() => { showToast('Entrada realizada com sucesso!'); loadData(); }" @cancel="showEntryForm = false" />
      </div>

      <!-- Barra de Filtros e Busca Multi-Itens Sob Demanda -->
      <div class="bg-white p-4 rounded shadow-sm border border-gray-200 mx-4 mb-4 flex flex-col md:flex-row gap-4 items-end">
        <div class="w-full md:w-1/4">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Setor Ativo</label>
          <select
            v-model="activeTab"
            aria-label="Setor do estoque"
            :disabled="isSectorLocked"
            @change="selectTab(activeTab)"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-medium disabled:bg-gray-100 disabled:text-gray-500"
          >
            <option v-for="t in visibleTabs" :key="t.id" :value="t.id">
              {{ t.label }} ({{ (stockStore.metrics as any)[t.countKey] || 0 }})
            </option>
          </select>
        </div>

        <div class="w-full md:w-3/4">
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-bold text-gray-500 uppercase">
              Busca Multi-Itens (Cole SKUs / Códigos)
            </label>
            <span
              v-if="searchTermsCount > 1"
              class="text-[11px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200"
            >
              {{ searchTermsCount }} códigos filtrados
            </span>
          </div>

          <div class="flex gap-2">
            <div class="relative flex-1">
              <input
                v-model="search"
                aria-label="Buscar itens do estoque"
                @keydown.enter="handleExplicitSearch"
                type="text"
                placeholder="Cole múltiplos SKUs separados por vírgula, espaço ou quebra de linha..."
                class="w-full border border-gray-200 py-2 pl-3 pr-8 rounded outline-none focus:border-blue-500 text-sm uppercase bg-white"
              />
              <button
                v-if="search"
                type="button"
                @click="clearSearch"
                class="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                title="Limpar Filtro (X)"
              >
                <X class="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              @click="handleExplicitSearch"
              class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded text-xs flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap"
            >
              <Search class="w-4 h-4" />
              <span>Buscar</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Abas Setoriais Integradas no Topo da Tabela -->
      <div class="mx-4 flex border-b border-gray-200 space-x-2 overflow-x-auto bg-white px-3 pt-2 rounded-t border-t border-l border-r">
        <button
          v-for="t in visibleTabs"
          :key="t.id"
          @click="selectTab(t.id)"
          class="flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all border-b-2 whitespace-nowrap"
          :class="activeTab === t.id
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
        >
          <component :is="t.icon" class="w-3.5 h-3.5" />
          <span>{{ t.label }}</span>
          <span class="ml-1 text-[11px] px-1.5 py-0.2 bg-gray-100 rounded-full font-mono font-bold text-gray-600">
            {{ (stockStore.metrics as any)[t.countKey] || 0 }}
          </span>
        </button>
      </div>

      <!-- Tabela Padrão Materials.vue -->
      <div class="flex-1 overflow-auto px-4 pb-4">
        <div class="bg-white rounded-b shadow border-b border-l border-r border-gray-200">
          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <!-- Headers CORTE -->
              <tr v-if="activeTab === 'CORTE'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Código</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Descrição / Material</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Tipo</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo / Unidade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers APOIO -->
              <tr v-if="activeTab === 'APOIO'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">COD. PRODUTO / SKU</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Descrição da Peça</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Material / Cor</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Quantidade</th>
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
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo (Pares/Pés)</th>
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
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Quantidade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers MONTAGEM -->
              <tr v-if="activeTab === 'MONTAGEM'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">COD. PRODUTO / SKU</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Combinação</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Lado do Pé</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo (Pés)</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="item in stockStore.currentSectorData.data"
                :key="item.id"
                class="hover:bg-gray-50 border-b last:border-b-0 transition-colors"
              >
                <!-- Colunas CORTE -->
                <template v-if="activeTab === 'CORTE'">
                  <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ item.code }}</td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.name }}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="px-2 py-0.5 text-xs bg-gray-100 rounded-full font-bold text-gray-600 border border-gray-200">
                      {{ item.type }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
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
                    <span class="font-mono text-sm font-bold text-blue-600 block">{{ item.pieceCode }}</span>
                    <span v-if="item.productName" class="text-xs font-bold text-gray-700 block">{{ item.productName }}</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.description }}</td>
                  <td class="px-4 py-3 text-sm text-gray-600">{{ item.materialColor }}</td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
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
                    <span
                      v-if="item.type === 'BORRACHA'"
                      class="px-2.5 py-1 text-xs rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs"
                    >
                      Borracha
                    </span>
                    <span
                      v-else
                      class="px-2.5 py-1 text-xs rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs"
                    >
                      EVA (Não Processada)
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.color }}</td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center">
                    <span
                      v-if="item.footSide"
                      class="px-2 py-0.5 text-xs rounded-full font-bold border"
                      :class="item.footSide === 'E'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-orange-50 text-orange-700 border-orange-200'"
                    >
                      {{ item.footSide === 'E' ? 'PÉ ESQUERDO (E)' : 'PÉ DIREITO (D)' }}
                    </span>
                    <span v-else class="text-xs text-gray-400 font-medium">
                      PAR COMPLETO
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
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
                    <span
                      v-if="item.type === 'SOLA_PROCESSADA'"
                      class="px-2.5 py-1 text-xs rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-200"
                    >
                      Sola Processada
                    </span>
                    <span
                      v-else
                      class="px-2.5 py-1 text-xs rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                    >
                      Cabedal
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.color }}</td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center">
                    <span
                      v-if="item.footSide"
                      class="px-2 py-0.5 text-xs rounded-full font-bold border"
                      :class="item.footSide === 'E'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-orange-50 text-orange-700 border-orange-200'"
                    >
                      {{ item.footSide === 'E' ? 'PÉ ESQUERDO (E)' : 'PÉ DIREITO (D)' }}
                    </span>
                    <span v-else class="text-xs text-gray-400 font-medium">
                      PAR / GERAL
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
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
                      class="px-2 py-0.5 text-xs rounded-full font-bold border"
                      :class="item.footSide === 'E'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-orange-50 text-orange-700 border-orange-200'"
                    >
                      {{ item.footSide === 'E' ? 'PÉ ESQUERDO (E)' : 'PÉ DIREITO (D)' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
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
                      class="text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors"
                      title="Visualizar Detalhes"
                    >
                      <Eye class="w-3.5 h-3.5" />
                      <span class="hidden xl:inline">Detalhes</span>
                    </button>

                    <button
                      v-if="authStore.can('movimentar') && canOperateCurrentSector"
                      @click="openMovementModal(item)"
                      class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
                      title="Registrar Movimentação de Estoque"
                    >
                      <ArrowLeftRight class="w-3.5 h-3.5" />
                      <span>Movimentar</span>
                    </button>

                    <button
                      v-if="canDelete"
                      @click="confirmDelete(item)"
                      class="text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors"
                      title="Excluir Item do Estoque (Apenas Saldo Zerado)"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                      <span class="hidden xl:inline">Excluir</span>
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-if="!stockStore.loading && !stockStore.error && stockStore.currentSectorData.data.length === 0">
                <td colspan="8" class="p-8 text-center text-gray-400 font-medium text-sm">
                  Nenhum item encontrado para este setor.
                </td>
              </tr>
            </tbody>
          </table>

          <!-- BARRA DE PAGINAÇÃO DE ALTA ESCALA (>3.000 ITENS) -->
          <div
            v-if="stockStore.pagination.total > 0"
            class="px-4 py-3 bg-gray-50/90 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600 rounded-b"
          >
            <div class="flex items-center gap-1.5">
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
              <span>itens no setor {{ activeTab }}</span>
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
                  SETOR {{ selectedItem.sector }}
                </span>
              </div>

              <div class="text-xs font-semibold text-gray-800 mb-2">
                {{ getItemDescription(selectedItem) }}
                <span v-if="selectedItem.sector === 'PRE_FABRICADO' && selectedItem.type" class="text-emerald-700 font-bold ml-1">
                  [{{ selectedItem.type === 'BORRACHA' ? 'Borracha' : 'EVA' }}]
                </span>
                <span v-if="(selectedItem.sector === 'DISTRIBUICAO' || selectedItem.sector === 'EXPEDICAO') && selectedItem.type" class="text-indigo-700 font-bold ml-1">
                  [{{ selectedItem.type === 'SOLA_PROCESSADA' ? 'Sola Processada' : 'Cabedal' }}]
                </span>
                <span v-if="selectedItem.sizeGrade" class="text-gray-600 font-normal">
                  - Grade: <strong>{{ selectedItem.sizeGrade }}</strong>
                </span>
                <span v-if="selectedItem.footSide" class="text-gray-600 font-normal ml-1">
                  ({{ selectedItem.footSide === 'E' ? 'Pé Esquerdo' : 'Pé Direito' }})
                </span>
              </div>

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
                <span>A transferência física redistribui o saldo entre prateleiras sem alterar o saldo total em estoque na fábrica.</span>
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
                  min="0.01"
                  step="any"
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
                <option v-for="loc in stockStore.filterLocations" :key="loc.id" :value="loc.id">
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
                <option v-for="loc in (itemAllocatedLocations.length > 0 ? itemAllocatedLocations : stockStore.filterLocations)" :key="loc.id" :value="loc.id">
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
                <span>Não há outra prateleira cadastrada no setor <strong>{{ selectedItem?.sector || activeTab }}</strong> para transferir. Cadastre prateleiras adicionais no menu <strong>Configurações</strong>.</span>
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
                    {{ loc.name }} {{ loc.sector ? `[${loc.sector}]` : '' }}
                  </option>
                </select>

                <!-- Alerta de Transferência Intersetorial (Autorização Admin Master) -->
                <div
                  v-if="isCrossSectorTransfer"
                  class="p-2.5 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2 text-amber-900 text-xs"
                >
                  <AlertCircle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span class="font-bold block">⚠️ Transferência Intersetorial (Autorização Admin Master)</span>
                    <span>O item sairá do setor <strong>{{ selectedItem?.sector || activeTab }}</strong> para o setor <strong>{{ selectedDestinationLocation?.sector }}</strong>. A justificativa detalhada nas observações é obrigatória.</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Origem / Motivo da Movimentação (Configurações) -->
            <div>
              <label class="block font-bold text-gray-600 uppercase mb-1 tracking-wide">
                Motivo / Origem da Sobra *
              </label>
              <select
                v-model="movementReason"
                aria-label="Motivo da movimentação"
                class="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white text-gray-800 text-xs font-medium"
              >
                <option v-for="orig in stockStore.filterOrigins" :key="orig.id" :value="orig.name">
                  {{ orig.name }}
                </option>
                <option value="Consumo de Produção">Consumo de Produção</option>
                <option value="Baixa por Refugo">Baixa por Refugo</option>
                <option value="Ajuste de Inventário">Ajuste de Inventário</option>
                <option value="Devolução de Setor">Devolução de Setor</option>
                <option value="Outros">Outros (especificar nas observações)</option>
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
