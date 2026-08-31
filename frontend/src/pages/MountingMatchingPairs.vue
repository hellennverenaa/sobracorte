<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Layout from '@/components/Layout.vue';
import { useStockStore, MatchingPair, SectorType } from '@/stores/stockStore';
import { useAuthStore } from '@/stores/auth';
import { 
  Footprints, Layers, Box, RefreshCw, CheckCircle2, AlertCircle, 
  MapPin, Check, ArrowRight
} from 'lucide-vue-next';

const stockStore = useStockStore();
const authStore = useAuthStore();

const pairSectors: Array<{ id: SectorType; label: string; sublabel: string; icon: any }> = [
  { id: 'MONTAGEM', label: 'Montagem', sublabel: 'Pés Órfãos', icon: Footprints },
  { id: 'PRE_FABRICADO', label: 'Pré-Fabricado', sublabel: 'Solas', icon: Layers },
  { id: 'EXPEDICAO', label: 'Cabedais', sublabel: 'Cabedais Avulsos', icon: Box },
];

const activeSector = ref<SectorType>('MONTAGEM');
const selectedPair = ref<MatchingPair | null>(null);
const matchQuantity = ref(1);
const matchReason = ref('');
const isSubmitting = ref(false);
const showConfirmModal = ref(false);

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

async function loadPairs() {
  await stockStore.fetchMatchingPairs(activeSector.value);
}

function selectSectorTab(sector: SectorType) {
  activeSector.value = sector;
  loadPairs();
}

function openConfirmModal(pair: MatchingPair) {
  selectedPair.value = pair;
  matchQuantity.value = Math.min(1, pair.formablePairs);
  const sectorLabel = activeSector.value === 'PRE_FABRICADO' ? 'Solas' : activeSector.value === 'EXPEDICAO' ? 'Cabedais' : 'Montagem';
  matchReason.value = `Pares de ${sectorLabel} retirados fisicamente das prateleiras e encaminhados para a produção`;
  showConfirmModal.value = true;
}

async function handleExecuteMatch() {
  if (!selectedPair.value) return;

  if (matchQuantity.value <= 0 || matchQuantity.value > selectedPair.value.formablePairs) {
    showToast(`Quantidade inválida. Pares formáveis: ${selectedPair.value.formablePairs}`, 'error');
    return;
  }

  isSubmitting.value = true;
  try {
    await stockStore.executeMatch({
      leftStockItemId: selectedPair.value.leftFootStockItemId,
      rightStockItemId: selectedPair.value.rightFootStockItemId,
      quantity: Number(matchQuantity.value),
      sector: activeSector.value,
      reason: matchReason.value,
    });
    showToast(`${matchQuantity.value} par(es) casado(s) e baixado(s) com sucesso no setor ${activeSector.value}!`);
    showConfirmModal.value = false;
    selectedPair.value = null;
  } catch (err: any) {
    showToast(err.message || 'Erro ao efetuar casamento de pares.', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(() => {
  loadPairs();
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
      <!-- Top Bar -->
      <div class="flex flex-col sm:flex-row gap-3 items-center justify-between mx-4 my-4">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Casamento de Pares Multi-Setor</h1>
          <p class="text-xs text-gray-500">Localização física inteligente de lados esquerdo e direito (Solas, Cabedais e Montagem)</p>
        </div>

        <div class="flex items-center gap-3">
          <button
            @click="loadPairs"
            class="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-2 rounded flex items-center gap-1.5 shadow-sm text-xs font-medium transition-colors"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': stockStore.loading }" />
            <span>Atualizar Pares</span>
          </button>
        </div>
      </div>

      <!-- Seletor de Setores (Tabs Industriais) -->
      <div class="mx-4 mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <button
          v-for="sec in pairSectors"
          :key="sec.id"
          @click="selectSectorTab(sec.id)"
          type="button"
          class="flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-all border"
          :class="activeSector === sec.id
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900'"
        >
          <component :is="sec.icon" class="w-4 h-4" />
          <span>{{ sec.label }}</span>
          <span class="text-[10px] font-normal opacity-80">({{ sec.sublabel }})</span>
        </button>
      </div>

      <!-- Banner de Resumo -->
      <div class="bg-white p-4 rounded shadow-sm border border-gray-200 mx-4 mb-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded font-bold border border-blue-200">
              OPORTUNIDADE DE RECUPERAÇÃO — {{ activeSector }}
            </span>
            <span class="text-sm font-bold text-gray-800">
              {{ stockStore.matchingPairsCount }} combinações prontas para casar
            </span>
          </div>
          <p class="text-xs text-gray-500">
            Localize os itens nas prateleiras indicadas, retire fisicamente e confirme para liberar o par completo.
          </p>
        </div>

        <div class="bg-gray-50 border border-gray-200 px-5 py-2.5 rounded text-center min-w-[140px]">
          <span class="text-[11px] uppercase font-bold text-gray-500 block">Pares Formáveis</span>
          <span class="text-2xl font-bold text-blue-600 font-mono">
            {{ stockStore.matchingPairs.reduce((acc, p) => acc + p.formablePairs, 0) }}
          </span>
        </div>
      </div>

      <!-- Grid de Pares Casáveis -->
      <div class="flex-1 overflow-auto px-4 pb-4">
        <div v-if="stockStore.matchingPairs.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="pair in stockStore.matchingPairs"
            :key="pair.sku + pair.sizeGrade + (pair.color || '')"
            class="bg-white rounded shadow-sm border border-gray-200 p-4 space-y-3 hover:border-blue-300 transition-colors"
          >
            <!-- Topo do Card -->
            <div class="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div>
                <span class="text-[11px] font-bold text-gray-400 uppercase">COD. PRODUTO / SKU</span>
                <h3 class="font-mono text-base font-bold text-blue-600">{{ pair.sku }}</h3>
                <span v-if="pair.color" class="text-xs text-gray-500 font-medium block">
                  Cor: {{ pair.color }}
                </span>
              </div>
              <div class="text-right">
                <span class="text-[11px] font-bold text-gray-400 uppercase">Grade</span>
                <p class="text-base font-bold text-gray-800">{{ pair.sizeGrade }}</p>
              </div>
            </div>

            <!-- Comparativo dos Lados -->
            <div class="grid grid-cols-2 gap-3 text-xs">
              <!-- Pé Esquerdo -->
              <div class="bg-blue-50/60 border border-blue-200 rounded p-2.5 space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-blue-900 text-[11px]">PÉ ESQUERDO (E)</span>
                  <span class="px-1.5 py-0.2 bg-blue-200 text-blue-900 rounded font-mono font-bold text-[10px]">
                    Qtd: {{ pair.leftQuantity }}
                  </span>
                </div>
                <div class="text-gray-600 flex items-start gap-1 text-[11px]">
                  <MapPin class="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span class="text-gray-500 font-medium">Prateleira:</span>
                    <p class="font-bold text-blue-950">{{ pair.leftLocations }}</p>
                  </div>
                </div>
              </div>

              <!-- Pé Direito -->
              <div class="bg-orange-50/60 border border-orange-200 rounded p-2.5 space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-orange-900 text-[11px]">PÉ DIREITO (D)</span>
                  <span class="px-1.5 py-0.2 bg-orange-200 text-orange-900 rounded font-mono font-bold text-[10px]">
                    Qtd: {{ pair.rightQuantity }}
                  </span>
                </div>
                <div class="text-gray-600 flex items-start gap-1 text-[11px]">
                  <MapPin class="w-3.5 h-3.5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span class="text-gray-500 font-medium">Prateleira:</span>
                    <p class="font-bold text-orange-950">{{ pair.rightLocations }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer do Card com Botão de Ação -->
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center gap-1.5 text-green-700 font-medium text-xs">
                <CheckCircle2 class="w-4 h-4 text-green-600" />
                <span>Forma <strong>{{ pair.formablePairs }} par(es) completo(s)</strong></span>
              </div>

              <button
                v-if="authStore.can('movimentar')"
                @click="openConfirmModal(pair)"
                class="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-1.5 rounded flex items-center gap-1.5 text-xs shadow-sm transition-colors"
              >
                <span>Casar e Baixar</span>
                <ArrowRight class="w-3.5 h-3.5" />
              </button>
              <span v-else class="text-[11px] text-gray-400 font-medium">Somente Leitura</span>
            </div>
          </div>
        </div>

        <!-- Estado Vazio -->
        <div
          v-else-if="!stockStore.loading"
          class="bg-white rounded shadow-sm border border-gray-200 p-12 text-center space-y-2"
        >
          <component :is="activeSector === 'PRE_FABRICADO' ? Layers : activeSector === 'EXPEDICAO' ? Box : Footprints" class="w-10 h-10 text-gray-300 mx-auto" />
          <h3 class="text-sm font-bold text-gray-700">Nenhum par casável no momento para o setor {{ activeSector }}</h3>
          <p class="text-xs text-gray-500 max-w-md mx-auto">
            Assim que itens de lados esquerdo e direito correspondentes (mesmo COD. PRODUTO / SKU e numeração) derem entrada no setor selecionado, eles aparecerão aqui para casamento.
          </p>
        </div>
      </div>

      <!-- Modal de Confirmação Padrão Materials.vue -->
      <div v-if="showConfirmModal && selectedPair" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
            <h3 class="font-bold text-gray-800">Confirmar Casamento de Par ({{ activeSector }})</h3>
            <button @click="showConfirmModal = false" class="text-gray-400 hover:text-gray-600 font-bold text-xl">
              &times;
            </button>
          </div>

          <div class="p-6 space-y-4 text-xs">
            <div class="bg-gray-50 border border-gray-200 p-3 rounded space-y-2">
              <div class="flex justify-between font-bold">
                <span class="text-gray-500 uppercase">COD. PRODUTO / SKU:</span>
                <span class="text-blue-600 font-mono">{{ selectedPair.sku }}</span>
              </div>
              <div v-if="selectedPair.color" class="flex justify-between font-bold">
                <span class="text-gray-500 uppercase">Cor:</span>
                <span class="text-gray-800">{{ selectedPair.color }}</span>
              </div>
              <div class="flex justify-between font-bold">
                <span class="text-gray-500 uppercase">Grade:</span>
                <span class="text-gray-800">{{ selectedPair.sizeGrade }}</span>
              </div>
            </div>

            <div class="space-y-2">
              <p class="font-bold text-gray-700 uppercase">Localização das Prateleiras:</p>
              <div class="grid grid-cols-2 gap-2">
                <div class="p-2 bg-blue-50 border border-blue-200 rounded">
                  <span class="text-[10px] text-blue-700 uppercase font-bold block">Pé Esquerdo (E)</span>
                  <span class="font-bold text-blue-950 text-sm">{{ selectedPair.leftLocations }}</span>
                </div>
                <div class="p-2 bg-orange-50 border border-orange-200 rounded">
                  <span class="text-[10px] text-orange-700 uppercase font-bold block">Pé Direito (D)</span>
                  <span class="font-bold text-orange-950 text-sm">{{ selectedPair.rightLocations }}</span>
                </div>
              </div>
            </div>

            <div>
              <label class="block font-bold text-gray-500 uppercase mb-1">Quantidade a Casar *</label>
              <input
                v-model.number="matchQuantity"
                type="number"
                min="1"
                :max="selectedPair.formablePairs"
                class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 font-bold text-gray-800 text-sm"
              />
              <span class="text-[11px] text-gray-500 mt-1 block">Máximo disponível: {{ selectedPair.formablePairs }} par(es)</span>
            </div>

            <div>
              <label class="block font-bold text-gray-500 uppercase mb-1">Observação / Destino</label>
              <input
                v-model="matchReason"
                type="text"
                class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 text-gray-800 text-sm"
              />
            </div>
          </div>

          <div class="bg-gray-50 px-6 py-3 border-t flex justify-end gap-3">
            <button
              type="button"
              @click="showConfirmModal = false"
              class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium px-4 py-2 rounded text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              :disabled="isSubmitting"
              @click="handleExecuteMatch"
              class="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded text-xs shadow-sm disabled:opacity-50"
            >
              {{ isSubmitting ? 'Processando...' : 'Confirmar Retirada e Baixar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>
