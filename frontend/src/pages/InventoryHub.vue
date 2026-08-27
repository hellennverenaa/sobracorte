<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import Layout from '@/components/Layout.vue';
import { useStockStore, SectorType } from '@/stores/stockStore';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/httpClient';
import SectorFormInput from '@/components/SectorFormInput.vue';
import { 
  Plus, RefreshCw, ArrowLeftRight, X, Eye, 
  Scissors, Wrench, Layers, Box, Footprints
} from 'lucide-vue-next';

const stockStore = useStockStore();
const authStore = useAuthStore();

const showEntryForm = ref(false);
const activeTab = ref<SectorType>('CORTE');
const search = ref('');
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

// Modal de Movimentação Avulsa
const showMovementModal = ref(false);
const selectedItem = ref<any>(null);
const movementType = ref<'SAIDA' | 'REFUGO' | 'TRANSFERENCIA'>('SAIDA');
const movementQuantity = ref(1);
const movementReason = ref('');
const destinationLocation = ref('');
const movementLoading = ref(false);

// Modal de Detalhes
const viewingItem = ref<any>(null);

const tabs = [
  { id: 'CORTE' as SectorType, label: 'Corte', countKey: 'totalCorte', icon: Scissors },
  { id: 'APOIO' as SectorType, label: 'Apoio', countKey: 'totalApoio', icon: Wrench },
  { id: 'PRE_FABRICADO' as SectorType, label: 'Pré-Fabricado (Solas)', countKey: 'totalPreFabricado', icon: Layers },
  { id: 'EXPEDICAO' as SectorType, label: 'Expedição (Cabedais)', countKey: 'totalExpedicao', icon: Box },
  { id: 'MONTAGEM' as SectorType, label: 'Montagem (Pés Órfãos)', countKey: 'totalMontagem', icon: Footprints },
];

function selectTab(tab: SectorType) {
  activeTab.value = tab;
  stockStore.setActiveSector(tab);
}

async function fetchDynamicSettings() {
  try {
    const [locsRes, originsRes] = await Promise.all([
      api.get('/settings/locations'),
      api.get('/settings/origins'),
    ]);
    dbLocations.value = locsRes.data || [];
    dbOrigins.value = originsRes.data || [];
  } catch (err) {
    console.error('Erro ao carregar configurações dinâmicas no InventoryHub:', err);
  }
}

async function loadData() {
  await stockStore.fetchInventory({ q: search.value, sector: activeTab.value });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function handleSearch() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const query = search.value.trim();

  // Se o usuário limpou o campo, executa a busca imediatamente sem aguardar o debounce
  if (!query) {
    loadData();
    return;
  }

  // Debounce de 350ms para aguardar o término da digitação
  debounceTimer = setTimeout(() => {
    loadData();
  }, 350);
}

function openMovementModal(item: any) {
  selectedItem.value = item;
  movementQuantity.value = 1;
  movementReason.value = dbOrigins.value.length > 0 ? dbOrigins.value[0].name : '';
  movementType.value = 'SAIDA';
  destinationLocation.value = '';
  showMovementModal.value = true;
}

async function handleConfirmMovement() {
  if (!selectedItem.value) return;
  if (movementQuantity.value <= 0 || movementQuantity.value > selectedItem.value.quantity) {
    showToast(`Quantidade inválida. Saldo disponível: ${selectedItem.value.quantity}`, 'error');
    return;
  }

  movementLoading.value = true;
  try {
    await stockStore.createMovement({
      stockItemId: selectedItem.value.id,
      type: movementType.value,
      quantity: Number(movementQuantity.value),
      reason: movementReason.value,
    });
    showToast('Movimentação registrada com sucesso!');
    showMovementModal.value = false;
    selectedItem.value = null;
  } catch (err: any) {
    showToast(err.message || 'Erro ao registrar movimentação', 'error');
  } finally {
    movementLoading.value = false;
  }
}

function formatNumber(num: number) {
  return Number(num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

watch(activeTab, () => {
  loadData();
});

onMounted(() => {
  stockStore.setActiveSector('CORTE');
  fetchDynamicSettings();
  loadData();
});

onUnmounted(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
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
            @click="loadData"
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

      <!-- Barra de Filtros Padrão Materials.vue -->
      <div class="bg-white p-4 rounded shadow-sm border border-gray-200 mx-4 mb-4 flex flex-col md:flex-row gap-4">
        <div class="w-full md:w-1/4">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Setor Ativo</label>
          <select
            v-model="activeTab"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-medium"
          >
            <option v-for="t in tabs" :key="t.id" :value="t.id">
              {{ t.label }} ({{ (stockStore.metrics as any)[t.countKey] || 0 }})
            </option>
          </select>
        </div>

        <div class="w-full md:w-3/4">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar</label>
          <input
            v-model="search"
            @input="handleSearch"
            type="text"
            placeholder="Pesquise por código, nome, SKU, grade ou modelo..."
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 text-sm"
          />
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
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Cód. Peça</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Descrição da Peça</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Material / Cor</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Quantidade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers PRÉ-FABRICADO -->
              <tr v-if="activeTab === 'PRE_FABRICADO'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Produto / Linha</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Cor do Solado</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Saldo (Pares)</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers EXPEDIÇÃO -->
              <tr v-if="activeTab === 'EXPEDICAO'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">SKU Cabedal</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">Cor</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Grade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Prateleira</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-right">Quantidade</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b text-center">Ações</th>
              </tr>

              <!-- Headers MONTAGEM -->
              <tr v-if="activeTab === 'MONTAGEM'">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 uppercase border-b">SKU Calçado</th>
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
                  <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ item.pieceCode }}</td>
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
                  <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ item.productName }}</td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.color }}</td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
                      {{ item.locationDisplay }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-gray-800">
                    {{ formatNumber(item.quantity) }}
                    <span class="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded ml-1 border border-blue-100 font-mono font-semibold">
                      PARES
                    </span>
                  </td>
                </template>

                <!-- Colunas EXPEDIÇÃO -->
                <template v-if="activeTab === 'EXPEDICAO'">
                  <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ item.sku }}</td>
                  <td class="px-4 py-3 text-sm text-gray-700 font-medium">{{ item.color }}</td>
                  <td class="px-4 py-3 text-center font-bold text-gray-800">{{ item.sizeGrade }}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium">
                      {{ item.locationDisplay }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-gray-800">
                    {{ formatNumber(item.quantity) }}
                    <span class="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded ml-1 border border-blue-100 font-mono font-semibold">
                      UN
                    </span>
                  </td>
                </template>

                <!-- Colunas MONTAGEM -->
                <template v-if="activeTab === 'MONTAGEM'">
                  <td class="px-4 py-3 font-mono text-sm font-bold text-blue-600">{{ item.sku }}</td>
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
                  <div class="flex items-center justify-center gap-3">
                    <button
                      @click="viewingItem = item"
                      class="text-gray-400 hover:text-blue-600 transition-colors"
                      title="Visualizar Detalhes"
                    >
                      <Eye class="w-4 h-4" />
                    </button>

                    <button
                      v-if="authStore.can('movimentar')"
                      @click="openMovementModal(item)"
                      class="text-gray-400 hover:text-blue-600 transition-colors"
                      title="Registrar Movimentação"
                    >
                      <ArrowLeftRight class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-if="stockStore.currentSectorData.data.length === 0">
                <td colspan="7" class="p-8 text-center text-gray-400 font-medium text-sm">
                  Nenhum item encontrado para este setor.
                </td>
              </tr>
            </tbody>
          </table>
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

      <!-- Modal de Movimentação Padrão Materials.vue -->
      <div v-if="showMovementModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
            <h3 class="font-bold text-gray-800">Registrar Movimentação</h3>
            <button @click="showMovementModal = false" class="text-gray-400 hover:text-gray-600 font-bold text-xl">
              &times;
            </button>
          </div>

          <div class="p-6 space-y-4 text-xs">
            <div>
              <label class="block font-bold text-gray-500 uppercase mb-1">Tipo de Movimentação *</label>
              <select
                v-model="movementType"
                class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white font-bold text-gray-800 text-sm"
              >
                <option value="SAIDA">SAÍDA / CONSUMO</option>
                <option value="REFUGO">BAIXA POR REFUGO</option>
                <option value="TRANSFERENCIA">TRANSFERÊNCIA DE PRATELEIRA</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-gray-500 uppercase mb-1">Quantidade a Movimentar *</label>
              <input
                v-model.number="movementQuantity"
                type="number"
                min="0.01"
                step="any"
                class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 font-bold text-gray-800 text-sm"
              />
              <span class="text-[11px] text-gray-500 mt-1 block">Saldo disponível: {{ selectedItem?.quantity }}</span>
            </div>

            <div v-if="movementType === 'TRANSFERENCIA'">
              <label class="block font-bold text-gray-500 uppercase mb-1">Prateleira de Destino *</label>
              <select
                v-model="destinationLocation"
                class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white font-bold text-gray-800 text-sm"
                required
              >
                <option value="" disabled selected>Selecione a Prateleira de Destino...</option>
                <option v-for="loc in dbLocations" :key="loc.id" :value="loc.name">
                  {{ loc.name }}
                </option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-gray-500 uppercase mb-1">Motivo / Origem (Configurações)</label>
              <select
                v-model="movementReason"
                class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-gray-800 text-sm font-medium mb-1"
              >
                <option v-for="orig in dbOrigins" :key="orig.id" :value="orig.name">
                  {{ orig.name }}
                </option>
                <option value="Outros">Outros</option>
              </select>
              <input
                v-if="movementReason === 'Outros'"
                v-model="movementReason"
                type="text"
                placeholder="Especifique o motivo..."
                class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 text-gray-800 text-xs mt-1"
              />
            </div>
          </div>

          <div class="bg-gray-50 px-6 py-3 border-t flex justify-end gap-3">
            <button
              type="button"
              @click="showMovementModal = false"
              class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium px-4 py-2 rounded text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              :disabled="movementLoading"
              @click="handleConfirmMovement"
              class="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded text-xs shadow-sm disabled:opacity-50"
            >
              {{ movementLoading ? 'Salvando...' : 'Confirmar Movimentação' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>
