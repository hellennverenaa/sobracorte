<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed } from 'vue';
import { useStockStore, SectorType } from '@/stores/stockStore';
import { api } from '@/services/httpClient';
import { 
  Scissors, Wrench, Layers, Box, Footprints, 
  Plus, Check, AlertCircle, Lock
} from 'lucide-vue-next';

const emit = defineEmits(['saved', 'cancel']);
const stockStore = useStockStore();

const activeSector = ref<SectorType>('CORTE');
const isSubmitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const firstInputRef = ref<HTMLInputElement | null>(null);

// Dados Dinâmicos carregados do módulo de Configurações
const dbCategories = ref<any[]>([]);
const dbUnits = ref<any[]>([]);
const dbLocations = ref<any[]>([]);
const loadingSettings = ref(false);

const formData = reactive({
  location: '',
  quantity: 1,
  observation: '',
  sizeGrade: '',
  color: '',
  code: '',
  name: '',
  unit: 'M2',
  type: '',
  pieceCode: '',
  description: '',
  materialColor: '',
  productName: '',
  sku: '',
  footSide: 'E' as 'E' | 'D',
});

const isUnitLocked = computed(() => {
  if (activeSector.value !== 'CORTE' || !formData.type) return false;
  const cat = dbCategories.value.find(c => c.name === formData.type);
  return Boolean(cat?.unitLocked);
});

const sectors = [
  { id: 'CORTE' as SectorType, label: 'Corte (Matéria-Prima)', icon: Scissors },
  { id: 'APOIO' as SectorType, label: 'Apoio (Peças / Moldes)', icon: Wrench },
  { id: 'PRE_FABRICADO' as SectorType, label: 'Pré-Fabricado (Solas)', icon: Layers },
  { id: 'EXPEDICAO' as SectorType, label: 'Expedição (Cabedais)', icon: Box },
  { id: 'MONTAGEM' as SectorType, label: 'Montagem (Pés Órfãos)', icon: Footprints },
];

async function fetchDynamicSettings() {
  loadingSettings.value = true;
  try {
    const [catsRes, unitsRes, locsRes] = await Promise.all([
      api.get('/settings/categories'),
      api.get('/settings/units'),
      api.get('/settings/locations'),
    ]);

    dbCategories.value = catsRes.data || [];
    dbUnits.value = unitsRes.data || [];
    dbLocations.value = locsRes.data || [];

    if (dbCategories.value.length > 0 && !formData.type) {
      formData.type = dbCategories.value[0].name;
      onCategoryChange();
    }
  } catch (err) {
    console.error('Erro ao carregar configurações dinâmicas:', err);
  } finally {
    loadingSettings.value = false;
  }
}

function onCategoryChange() {
  const selected = dbCategories.value.find(c => c.name === formData.type);
  if (selected && selected.defaultUnit) {
    formData.unit = selected.defaultUnit.symbol;
  }
}

function selectSector(sector: SectorType) {
  activeSector.value = sector;
  errorMessage.value = '';
  successMessage.value = '';
  nextTick(() => {
    firstInputRef.value?.focus();
  });
}

function resetForm() {
  formData.location = '';
  formData.quantity = 1;
  formData.observation = '';
  formData.sizeGrade = '';
  formData.color = '';
  formData.code = '';
  formData.name = '';
  formData.unit = dbUnits.value.length > 0 ? dbUnits.value[0].symbol : 'M2';
  formData.type = dbCategories.value.length > 0 ? dbCategories.value[0].name : '';
  formData.pieceCode = '';
  formData.description = '';
  formData.materialColor = '';
  formData.productName = '';
  formData.sku = '';
  formData.footSide = 'E';

  onCategoryChange();

  nextTick(() => {
    firstInputRef.value?.focus();
  });
}

async function handleSubmit() {
  errorMessage.value = '';
  successMessage.value = '';

  if (!formData.location.trim()) {
    errorMessage.value = 'Informe a prateleira / localização física.';
    return;
  }

  if (Number(formData.quantity) <= 0) {
    errorMessage.value = 'A quantidade deve ser maior que zero.';
    return;
  }

  let payloadItem: any = {
    sector: activeSector.value,
    location: formData.location.trim().toUpperCase(),
    quantity: Number(formData.quantity),
    observation: formData.observation.trim(),
  };

  switch (activeSector.value) {
    case 'CORTE':
      if (!formData.code.trim() || !formData.name.trim()) {
        errorMessage.value = 'Código e Nome da matéria-prima são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim().toUpperCase(),
        unit: (formData.unit || 'M2').trim().toUpperCase(),
        type: (formData.type || 'OUTROS').trim().toUpperCase(),
      };
      break;

    case 'APOIO':
      if (!formData.pieceCode.trim() || !formData.description.trim() || !formData.sizeGrade.trim()) {
        errorMessage.value = 'Código da Peça, Descrição e Grade são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        pieceCode: formData.pieceCode.trim().toUpperCase(),
        description: formData.description.trim().toUpperCase(),
        materialColor: (formData.materialColor || 'PADRAO').trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
      };
      break;

    case 'PRE_FABRICADO':
      if (!formData.productName.trim() || !formData.sizeGrade.trim() || !formData.color.trim()) {
        errorMessage.value = 'Produto, Grade e Cor são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        productName: formData.productName.trim().toUpperCase(),
        color: formData.color.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
      };
      break;

    case 'EXPEDICAO':
      if (!formData.sku.trim() || !formData.sizeGrade.trim() || !formData.color.trim()) {
        errorMessage.value = 'SKU, Grade e Cor são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        sku: formData.sku.trim().toUpperCase(),
        color: formData.color.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
      };
      break;

    case 'MONTAGEM':
      if (!formData.sku.trim() || !formData.sizeGrade.trim()) {
        errorMessage.value = 'SKU e Grade são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        sku: formData.sku.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
        footSide: formData.footSide,
      };
      break;
  }

  isSubmitting.value = true;
  try {
    await stockStore.createBatch([payloadItem]);
    successMessage.value = `Item cadastrado com sucesso no setor ${activeSector.value}!`;
    resetForm();
    emit('saved');
    setTimeout(() => {
      successMessage.value = '';
    }, 3500);
  } catch (err: any) {
    errorMessage.value = err.message || 'Erro ao registrar entrada.';
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(async () => {
  await fetchDynamicSettings();
  firstInputRef.value?.focus();
});
</script>

<template>
  <div class="bg-white p-5 rounded shadow-sm border border-gray-200 mb-4">
    <!-- Header do Formulário e Tabs de Setor -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100 mb-4">
      <div>
        <h3 class="text-sm font-bold text-gray-800 uppercase tracking-wide">
          Nova Entrada Rápida de Estoque
        </h3>
        <p class="text-xs text-gray-500 mt-0.5">
          Formulário otimizado conectado às configurações ativas da fábrica
        </p>
      </div>

      <!-- Seletor de Setores -->
      <div class="flex flex-wrap gap-1.5 bg-gray-100 p-1 rounded">
        <button
          v-for="sec in sectors"
          :key="sec.id"
          type="button"
          @click="selectSector(sec.id)"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all"
          :class="activeSector === sec.id 
            ? 'bg-blue-600 text-white shadow-sm' 
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'"
        >
          <component :is="sec.icon" class="w-3.5 h-3.5" />
          {{ sec.label.split(' ')[0] }}
        </button>
      </div>
    </div>

    <!-- Alertas -->
    <div v-if="successMessage" class="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded text-xs font-medium flex items-center gap-2">
      <Check class="w-4 h-4 text-green-600 flex-shrink-0" />
      <span>{{ successMessage }}</span>
    </div>

    <div v-if="errorMessage" class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-xs font-medium flex items-center gap-2">
      <AlertCircle class="w-4 h-4 text-red-600 flex-shrink-0" />
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Campos por Setor -->
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- 1. CORTE -->
      <div v-if="activeSector === 'CORTE'" class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Código Matéria-Prima *</label>
          <input
            ref="firstInputRef"
            v-model="formData.code"
            type="text"
            placeholder="Ex: MP-COU-001"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição / Nome *</label>
          <input
            v-model="formData.name"
            type="text"
            placeholder="Ex: Couro Bovino Preto 1.2mm"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Categoria (Dinâmica) *</label>
          <select
            v-model="formData.type"
            @change="onCategoryChange"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-medium"
            required
          >
            <option v-for="cat in dbCategories" :key="cat.id" :value="cat.name">
              {{ cat.name }}
            </option>
            <option v-if="dbCategories.length === 0" value="OUTROS">OUTROS</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center justify-between">
            <span>Unidade de Medida *</span>
            <span v-if="isUnitLocked" class="text-[10px] text-amber-600 font-bold flex items-center gap-0.5">
              <Lock class="w-3 h-3" /> Travada
            </span>
          </label>
          <select
            v-model="formData.unit"
            :disabled="isUnitLocked"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-medium disabled:bg-gray-100 disabled:text-gray-500"
            required
          >
            <option v-for="unit in dbUnits" :key="unit.id" :value="unit.symbol">
              {{ unit.name }} ({{ unit.symbol }})
            </option>
            <option v-if="dbUnits.length === 0" value="M2">M² (Metro Quadrado)</option>
          </select>
        </div>
      </div>

      <!-- 2. APOIO -->
      <div v-if="activeSector === 'APOIO'" class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Código Peça / Molde *</label>
          <input
            ref="firstInputRef"
            v-model="formData.pieceCode"
            type="text"
            placeholder="Ex: MOL-GAS-01"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-mono font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição da Peça *</label>
          <input
            v-model="formData.description"
            type="text"
            placeholder="Ex: Gáspea Externa"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Material / Cor *</label>
          <input
            v-model="formData.materialColor"
            type="text"
            placeholder="Ex: Napa Sintética Branca"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Grade / Numeração *</label>
          <input
            v-model="formData.sizeGrade"
            type="text"
            placeholder="Ex: 38 ou 37/38"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
          />
        </div>
      </div>

      <!-- 3. PRÉ-FABRICADO -->
      <div v-if="activeSector === 'PRE_FABRICADO'" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome / Linha do Produto *</label>
          <input
            ref="firstInputRef"
            v-model="formData.productName"
            type="text"
            placeholder="Ex: PEGASUS 40 ou OLY-CORSA"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Cor do Solado *</label>
          <input
            v-model="formData.color"
            type="text"
            placeholder="Ex: BRANCO / GOMA"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Grade / Numeração *</label>
          <input
            v-model="formData.sizeGrade"
            type="text"
            placeholder="Ex: 39 ou 40"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
          />
        </div>
      </div>

      <!-- 4. EXPEDIÇÃO -->
      <div v-if="activeSector === 'EXPEDICAO'" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">SKU do Cabedal *</label>
          <input
            ref="firstInputRef"
            v-model="formData.sku"
            type="text"
            placeholder="Ex: NKE-PEG-CAB-01"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-mono font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Cor do Cabedal *</label>
          <input
            v-model="formData.color"
            type="text"
            placeholder="Ex: PRETO / PRATA"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Grade / Numeração *</label>
          <input
            v-model="formData.sizeGrade"
            type="text"
            placeholder="Ex: 41"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
          />
        </div>
      </div>

      <!-- 5. MONTAGEM -->
      <div v-if="activeSector === 'MONTAGEM'" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">SKU / Modelo do Calçado *</label>
          <input
            ref="firstInputRef"
            v-model="formData.sku"
            type="text"
            placeholder="Ex: NKE-PEG40-BLK"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-mono font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Grade / Numeração *</label>
          <input
            v-model="formData.sizeGrade"
            type="text"
            placeholder="Ex: 38"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Lado do Pé *</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              @click="formData.footSide = 'E'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'E' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              PÉ ESQUERDO (E)
            </button>
            <button
              type="button"
              @click="formData.footSide = 'D'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'D' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              PÉ DIREITO (D)
            </button>
          </div>
        </div>
      </div>

      <!-- Campos Comuns -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-100">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Quantidade *</label>
          <input
            v-model.number="formData.quantity"
            type="number"
            min="0.01"
            step="any"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white font-bold text-sm text-gray-800"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Prateleira / Localização (Configurações) *</label>
          <input
            v-model="formData.location"
            list="dbLocationsSuggestions"
            type="text"
            placeholder="Ex: A-01, BOX-04"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white font-bold text-sm uppercase"
            required
          />
          <datalist id="dbLocationsSuggestions">
            <option v-for="loc in dbLocations" :key="loc.id" :value="loc.name" />
          </datalist>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Observação / Motivo</label>
          <input
            v-model="formData.observation"
            type="text"
            placeholder="Opcional..."
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm"
          />
        </div>
      </div>

      <!-- Botões de Ação -->
      <div class="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          @click="emit('cancel')"
          class="px-4 py-2 rounded text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded flex items-center gap-2 shadow-sm transition-colors text-xs disabled:opacity-50"
        >
          <Plus class="w-4 h-4" />
          <span>{{ isSubmitting ? 'Salvando...' : 'Gravar Entrada' }}</span>
        </button>
      </div>
    </form>
  </div>
</template>
