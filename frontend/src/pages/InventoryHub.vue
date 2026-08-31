<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Layout from '@/components/Layout.vue';
import { useStockStore, SectorType } from '@/stores/stockStore';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/httpClient';
import SectorFormInput from '@/components/SectorFormInput.vue';
import { 
  Plus, RefreshCw, ArrowLeftRight, X, Eye, 
  Scissors, Wrench, Layers, Box, Footprints,
  ArrowDownRight, ArrowUpRight, Trash2, User, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const stockStore = useStockStore();
const authStore = useAuthStore();

const validSectors: SectorType[] = ['CORTE', 'APOIO', 'PRE_FABRICADO', 'EXPEDICAO', 'MONTAGEM'];

function getSectorFromRoute(): SectorType {
  const sec = (route.query.sector as string)?.toUpperCase();
  if (validSectors.includes(sec as SectorType)) {
    return sec as SectorType;
  }
  return 'CORTE';
}

const showEntryForm = ref(false);
const activeTab = ref<SectorType>(getSectorFromRoute());
const search = ref((route.query.q as string) || '');
const currentPage = ref(Number(route.query.page) || 1);
const selectedLocationFilter = ref('');

// Configurações Dinâmicas
const dbLocations = ref<any[]>([]);
const dbOrigins = ref<any[]>([]);

// Notificação padrão
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

// Modal de Detalhes
const viewingItem = ref<any>(null);

const tabs = [
  { id: 'CORTE' as SectorType, label: 'Corte', countKey: 'totalCorte', icon: Scissors },
  { id: 'APOIO' as SectorType, label: 'Apoio', countKey: 'totalApoio', icon: Wrench },
  { id: 'PRE_FABRICADO' as SectorType, label: 'Pré-Fabricado (Solas)', countKey: 'totalPreFabricado', icon: Layers },
  { id: 'EXPEDICAO' as SectorType, label: 'Cabedais', countKey: 'totalExpedicao', icon: Box },
  { id: 'MONTAGEM' as SectorType, label: 'Montagem (Pés Órfãos)', countKey: 'totalMontagem', icon: Footprints },
];

async function selectTab(tab: SectorType) {
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

async function loadData(page: number = currentPage.value) {
  currentPage.value = page;
  await stockStore.fetchInventory({
    q: search.value,
    sector: activeTab.value,
    page,
    limit: 50,
  });
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
      quantity: locLink.quantity || 0,
    }));
});

// Prateleiras de destino disponíveis para transferência (exclui a prateleira de origem)
const availableDestinationLocations = computed(() => {
  return stockStore.filterLocations.filter((loc) => loc.id !== selectedLocationId.value);
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
  if (!movementReason.value?.trim()) return true;
  return false;
});

function openMovementModal(item: any) {
  selectedItem.value = item;
  movementQuantity.value = null;
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

  destinationLocationId.value = null;
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
  if (!item) return 'UN';
  switch (item.sector) {
    case 'CORTE':
      return item.unit || 'UN';
    case 'APOIO':
      return 'PÇS';
    case 'PRE_FABRICADO':
      return 'PARES';
    case 'EXPEDICAO':
      return 'UN';
    case 'MONTAGEM':
      return 'PÉS';
    default:
      return 'UN';
  }
}

function getItemIdentifier(item: any) {
  if (!item) return '-';
  return item.code || item.pieceCode || item.sku || item.productName || `Item #${item.id}`;
}

function getItemDescription(item: any) {
  if (!item) return '';
  return item.name || item.description || item.productName || item.sku || '';
}

function formatNumber(num: number) {
  return Number(num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

watch(
  () => route.query.sector,
  (newSec) => {
    if (newSec) {
      const secUpper = (newSec as string).toUpperCase() as SectorType;
      if (validSectors.includes(secUpper) && secUpper !== activeTab.value) {
        activeTab.value = secUpper;
        stockStore.setActiveSector(secUpper);
        loadData(1);
      }
    }
  }
);

onMounted(() => {
  const initialSector = getSectorFromRoute();
  activeTab.value = initialSector;
  stockStore.setActiveSector(initialSector);
  loadData(currentPage.value);
});
</script>

<template>
  <Layout>
    <!-- Notificação Toast Padrão Materials.vue -->
    <div
      v-if="notification.show"
      :class="notification.type === 'success'
        ? 'bg-green-100 border-green-400 text-green-700'
        : 'bg-red-100 border-red-400 text-red-700'"
      class="fixed top-4 right-4 px-4 py-3 rounded border shadow-lg z-50 flex items-center transition-all duration-300"
    >
      <span class="font-medium text-sm">{{ notification.message }}</span>
    </div>

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
            v-if="authStore.can('cadastrar_materiais')"
            @click="showEntryForm = !showEntryForm"
            class="bg-blue-600 hover:bg-blue-800 text-white px-5 py-2 rounded flex items-center gap-2 shadow-sm transition-colors text-xs font-medium"
          >
            <Plus class="w-4 h-4" />
            <span>{{ showEntryForm ? 'Fechar Formulário' : 'Nova Entrada Rápida' }}</span>
          </button>
        </div>
      </div>

      <!-- Formulário de Entrada Rápida (Expansível) -->
      <div v-if="showEntryForm" class="mx-4">
        <SectorFormInput @saved="() => { showToast('Entrada realizada com sucesso!'); loadData(); }" @cancel="showEntryForm = false" />
      </div>

      <!-- Barra de Filtros e Busca Multi-Itens Sob Demanda -->
      <div class="bg-white p-4 rounded shadow-sm border border-gray-200 mx-4 mb-4 flex flex-col md:flex-row gap-4 items-end">
        <div class="w-full md:w-1/4">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Setor Ativo</label>
          <select
            v-model="activeTab"
            @change="selectTab(activeTab)"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-medium"
          >
            <option v-for="t in tabs" :key="t.id" :value="t.id">
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
          v-for="t in tabs"
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
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">COMBINAÇÃO</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Lado do Pé</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo (Pares/Pés)</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers EXPEDIÇÃO -->
              <tr v-if="activeTab === 'EXPEDICAO'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">COD. PRODUTO / SKU</th>
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
                      {{ item.unit || 'UN' }}
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
                      PÇS
                    </span>
                  </td>
                </template>

                <!-- Colunas PRÉ-FABRICADO -->
                <template v-if="activeTab === 'PRE_FABRICADO'">
                  <td class="px-4 py-3">
                    <span class="font-mono text-sm font-bold text-blue-600 block">{{ item.sku || item.productName }}</span>
                    <span v-if="item.productName && item.productName !== item.sku" class="text-xs font-bold text-gray-700 block">{{ item.productName }}</span>
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
                      {{ item.footSide ? 'PÉS' : 'PARES' }}
                    </span>
                  </td>
                </template>

                <!-- Colunas EXPEDIÇÃO -->
                <template v-if="activeTab === 'EXPEDICAO'">
                  <td class="px-4 py-3">
                    <span class="font-mono text-sm font-bold text-blue-600 block">{{ item.sku }}</span>
                    <span v-if="item.productName" class="text-xs font-bold text-gray-700 block">{{ item.productName }}</span>
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
                      {{ item.footSide ? 'PÉS' : 'UN' }}
                    </span>
                  </td>
                </template>

                <!-- Colunas MONTAGEM -->
                <template v-if="activeTab === 'MONTAGEM'">
                  <td class="px-4 py-3">
                    <span class="font-mono text-sm font-bold text-blue-600 block">{{ item.sku }}</span>
                    <span v-if="item.productName" class="text-xs font-bold text-gray-700 block">{{ item.productName }}</span>
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
                      PÉS
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
                      v-if="authStore.can('movimentar')"
                      @click="openMovementModal(item)"
                      class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
                      title="Registrar Movimentação de Estoque"
                    >
                      <ArrowLeftRight class="w-3.5 h-3.5" />
                      <span>Movimentar</span>
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-if="stockStore.currentSectorData.data.length === 0">
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
      <div v-if="viewingItem" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
            <h3 class="font-bold text-gray-800">Detalhes do Item de Estoque</h3>
            <button @click="viewingItem = null" class="text-gray-400 hover:text-gray-600 font-bold text-xl">
              &times;
            </button>
          </div>
          <div class="p-6 space-y-3 text-sm">
            <div class="flex justify-center mb-2">
              <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded text-base font-mono font-bold border border-blue-200">
                {{ viewingItem.code || viewingItem.pieceCode || viewingItem.sku || viewingItem.productName }}
              </span>
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase">Setor</label>
              <div class="text-gray-900 font-bold">{{ viewingItem.sector }}</div>
            </div>

            <div v-if="viewingItem.name || viewingItem.description">
              <label class="block text-xs font-bold text-gray-500 uppercase">Descrição</label>
              <div class="text-gray-900 font-medium">{{ viewingItem.name || viewingItem.description }}</div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Saldo em Estoque</label>
                <div class="text-gray-900 font-bold">{{ viewingItem.quantity }} {{ viewingItem.unit || '' }}</div>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Prateleiras / Box</label>
                <div class="text-gray-900 font-bold">{{ viewingItem.locationDisplay }}</div>
              </div>
            </div>

            <div v-if="viewingItem.sizeGrade" class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase">Grade</label>
                <div class="text-gray-900 font-bold">{{ viewingItem.sizeGrade }}</div>
              </div>
              <div v-if="viewingItem.footSide">
                <label class="block text-xs font-bold text-gray-500 uppercase">Lado do Pé</label>
                <div class="text-gray-900 font-bold">{{ viewingItem.footSide === 'E' ? 'Esquerdo (E)' : 'Direito (D)' }}</div>
              </div>
            </div>

            <div v-if="viewingItem.observation">
              <label class="block text-xs font-bold text-gray-500 uppercase">Observações</label>
              <div class="text-gray-700 bg-gray-50 p-2 rounded text-xs">{{ viewingItem.observation }}</div>
            </div>
          </div>
          <div class="bg-gray-50 px-6 py-3 border-t flex justify-end">
            <button @click="viewingItem = null" class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium px-4 py-2 rounded text-xs">
              Fechar
            </button>
          </div>
        </div>
      </div>

      <!-- MODAL UNIFICADO ROBUSTO DE MOVIMENTAÇÃO DE ESTOQUE MULTI-SETOR -->
      <div v-if="showMovementModal && selectedItem" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
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
            <button @click="showMovementModal = false" class="text-gray-400 hover:text-gray-600 font-bold text-xl leading-none">
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
                  @click="movementType = 'ENTRADA'"
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
                  @click="movementType = 'SAIDA'"
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
                  @click="movementType = 'TRANSFERENCIA'"
                  :class="movementType === 'TRANSFERENCIA'
                    ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300 font-bold shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700'"
                  class="border rounded-lg p-3 flex flex-col items-center justify-center gap-1.5 transition-all text-center"
                >
                  <ArrowLeftRight class="w-4 h-4" />
                  <span class="text-xs font-semibold">TRANSFERÊNCIA</span>
                </button>
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
              <select
                v-model.number="destinationLocationId"
                class="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white font-bold text-blue-900 text-xs"
                required
              >
                <option :value="null" disabled>Selecione a prateleira de destino...</option>
                <option v-for="loc in availableDestinationLocations" :key="loc.id" :value="loc.id">
                  {{ loc.name }}
                </option>
              </select>
            </div>

            <!-- Origem / Motivo da Movimentação (Configurações) -->
            <div>
              <label class="block font-bold text-gray-600 uppercase mb-1 tracking-wide">
                Motivo / Origem da Sobra *
              </label>
              <select
                v-model="movementReason"
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
          <div class="bg-gray-50 px-6 py-3.5 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              @click="showMovementModal = false"
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
  </Layout>
</template>
