<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed } from 'vue';
import { useStockStore, SectorType } from '@/stores/stockStore';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/httpClient';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { normalizeSector, requestErrorMessage, SECTOR_OPTIONS } from '@/utils/domain';
import PageState from '@/components/PageState.vue';
import { 
  Scissors, Wrench, Layers, Box, Footprints, 
  Plus, Check, AlertCircle, Lock
} from 'lucide-vue-next';

const emit = defineEmits(['saved', 'cancel']);
const stockStore = useStockStore();
const authStore = useAuthStore();

const userSector = computed(() => {
  const s = authStore.user?.assignedSector;
  if (!s || s === 'TODOS') return null;
  return normalizeSector(s) as SectorType;
});

const isSectorLocked = computed(() => {
  const role = authStore.user?.role;
  const isAdmin = role === 'admin' || authStore.user?.isGlobalAdmin === true;
  return !isAdmin && !!userSector.value;
});

const activeSector = ref<SectorType>(
  isSectorLocked.value && userSector.value
    ? userSector.value
    : (stockStore.activeSector === 'EXPEDICAO' ? 'DISTRIBUICAO' : stockStore.activeSector)
);
const isSubmitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const firstInputRef = ref<HTMLInputElement | null>(null);

// Dados Dinâmicos carregados do módulo de Configurações
const dbCategories = ref<any[]>([]);
const dbUnits = ref<any[]>([]);
const dbLocations = ref<any[]>([]);
const loadingSettings = ref(false);
const settingsError = ref('');

// Cache reativo de combinações / cores para autocomplete por setor
const combinationsCache = ref<Record<string, string[]>>({});
const availableCombinations = computed(() => {
  return combinationsCache.value[activeSector.value] || [];
});

async function fetchCombinations(sector: SectorType) {
  if (sector !== 'PRE_FABRICADO' && sector !== 'DISTRIBUICAO' && sector !== 'MONTAGEM') {
    return;
  }
  if (combinationsCache.value[sector]) {
    return;
  }
  try {
    const res = await api.get('/inventory/combinations', {
      params: { sector },
    });
    combinationsCache.value[sector] = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    errorMessage.value = requestErrorMessage(err, 'Não foi possível carregar as combinações.');
  }
}

function addCombinationLocally(color: string, sector: SectorType) {
  const norm = color.trim().toUpperCase();
  if (!norm) return;
  if (!combinationsCache.value[sector]) {
    combinationsCache.value[sector] = [];
  }
  if (!combinationsCache.value[sector].includes(norm)) {
    combinationsCache.value[sector].push(norm);
    combinationsCache.value[sector].sort();
  }
}

const formData = reactive({
  location: '',
  quantity: 1,
  observation: '',
  sizeGrade: '',
  color: '',
  code: '',
  name: '',
  unit: activeSector.value === 'CORTE' ? 'M²' : 'UN',
  type: activeSector.value === 'PRE_FABRICADO' ? 'EVA' : (activeSector.value === 'DISTRIBUICAO' ? 'CABEDAL' : ''),
  pieceCode: '',
  description: '',
  materialColor: '',
  productName: '',
  sku: '',
  footSide: 'E' as 'E' | 'D' | 'PAR',
});
const savedForm = ref(JSON.stringify(formData));
const { confirmDiscard } = useUnsavedChanges(() => JSON.stringify(formData) !== savedForm.value);
defineExpose({ confirmDiscard });
async function cancelForm() {
  if (!isSubmitting.value && await confirmDiscard()) emit('cancel');
}

const isUnitLocked = computed(() => {
  if (activeSector.value !== 'CORTE' || !formData.type) return false;
  const cat = dbCategories.value.find(c => c.name === formData.type);
  return Boolean(cat?.unitLocked);
});

const allSectors = [
  { id: 'CORTE' as SectorType, icon: Scissors },
  { id: 'APOIO' as SectorType, icon: Wrench },
  { id: 'PRE_FABRICADO' as SectorType, icon: Layers },
  { id: 'DISTRIBUICAO' as SectorType, icon: Box },
  { id: 'MONTAGEM' as SectorType, icon: Footprints },
].map((sector) => ({ ...sector, label: SECTOR_OPTIONS.find((option) => option.id === sector.id)?.label || sector.id }));

const availableSectors = computed(() => {
  if (isSectorLocked.value && userSector.value) {
    return allSectors.filter(s => s.id === userSector.value);
  }
  return allSectors;
});

const availableCategories = computed(() => {
  const currentSec = activeSector.value;
  return dbCategories.value.filter(cat => {
    if (!cat.sector) return true;
    const catSec = cat.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : cat.sector;
    return catSec === currentSec;
  });
});

async function fetchDynamicSettings() {
  loadingSettings.value = true;
  settingsError.value = '';
  try {
    const [catsRes, unitsRes, locsRes] = await Promise.all([
      api.get('/settings/categories'),
      api.get('/settings/units'),
      api.get('/settings/locations'),
    ]);

    dbCategories.value = catsRes.data || [];
    dbUnits.value = unitsRes.data || [];
    dbLocations.value = locsRes.data || [];

    const catsForSector = availableCategories.value;
    if (catsForSector.length > 0 && !formData.type) {
      formData.type = catsForSector[0].name;
      onCategoryChange();
    }
  } catch (err) {
    settingsError.value = requestErrorMessage(err, 'Não foi possível carregar as configurações.');
  } finally {
    loadingSettings.value = false;
  }
}

function onCategoryChange() {
  const selected = dbCategories.value.find(c => c.name === formData.type);
  if (selected && selected.defaultUnitCode) {
    formData.unit = selected.defaultUnitCode;
  }
  // Resetar a prateleira quando a categoria for alterada
  formData.location = '';
}

const availableLocations = computed(() => {
  const currentSec = activeSector.value;
  const sectorLocs = dbLocations.value.filter(loc => {
    if (!loc.sector) return authStore.user?.role === 'admin' || authStore.user?.isGlobalAdmin === true;
    const locSec = loc.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : loc.sector;
    return locSec === currentSec;
  });

  if (currentSec === 'CORTE') {
    if (!formData.type) return sectorLocs;

    const categoriaSelecionada = String(formData.type).toUpperCase().trim();
    const catObj = dbCategories.value.find(
      c => String(c.name).toUpperCase().trim() === categoriaSelecionada
    );

    return sectorLocs.filter(loc => {
      if (loc.categoryLinks && Array.isArray(loc.categoryLinks) && loc.categoryLinks.length > 0) {
        const matchLink = loc.categoryLinks.some((link: any) => 
          (catObj && link.categoryId === catObj.id) ||
          (link.category && String(link.category.name).toUpperCase().trim() === categoriaSelecionada)
        );
        if (matchLink) return true;
      }
      if (catObj && loc.categoryId && loc.categoryId === catObj.id) {
        return true;
      }
      if (loc.category && String(loc.category.name).toUpperCase().trim() === categoriaSelecionada) {
        return true;
      }
      return false;
    });
  }

  if (currentSec === 'PRE_FABRICADO' && formData.type) {
    const materialSelected = formData.type.toUpperCase().trim();
    return sectorLocs.filter(loc => {
      const hasLinks = loc.categoryLinks && Array.isArray(loc.categoryLinks) && loc.categoryLinks.length > 0;
      if (!hasLinks && !loc.categoryId) {
        return true;
      }
      const matchLink = loc.categoryLinks?.some((link: any) =>
        link.category && String(link.category.name).toUpperCase().trim().includes(materialSelected)
      );
      const matchCat = loc.category && String(loc.category.name).toUpperCase().trim().includes(materialSelected);
      return matchLink || matchCat;
    });
  }

  if ((currentSec === 'DISTRIBUICAO' || (currentSec as string) === 'EXPEDICAO') && formData.type) {
    const materialSelected = formData.type.toUpperCase().trim();
    return sectorLocs.filter(loc => {
      const hasLinks = loc.categoryLinks && Array.isArray(loc.categoryLinks) && loc.categoryLinks.length > 0;
      if (!hasLinks && !loc.categoryId) {
        return true;
      }
      const searchTarget = materialSelected === 'SOLA_PROCESSADA' ? 'SOLA' : 'CABEDAL';
      const matchLink = loc.categoryLinks?.some((link: any) =>
        link.category && String(link.category.name).toUpperCase().trim().includes(searchTarget)
      );
      const matchCat = loc.category && String(loc.category.name).toUpperCase().trim().includes(searchTarget);
      return matchLink || matchCat;
    });
  }

  return sectorLocs;
});

function handleSizeGradeInput(event: Event) {
  const input = event.target as HTMLInputElement;
  // Permite estritamente dígitos numéricos e vírgula decimal (ex: 36, 36,5, 41,5)
  let val = input.value.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const parts = val.split(',');
  if (parts.length > 2) {
    val = parts[0] + ',' + parts.slice(1).join('');
  }
  formData.sizeGrade = val;
}

const isIntegerQuantitySector = computed(() => {
  return activeSector.value !== 'CORTE' || Boolean(dbUnits.value.find(unit => unit.symbol === formData.unit)?.integerOnly);
});

function handleQuantityInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const raw = String(input.value || '');

  formData.quantity = raw.replace(/,/g, '.') as any;
}

function handleColorKeydown(event: KeyboardEvent) {
  // Impede digitação de espaço em branco no campo de combinação
  if (event.key === ' ' || event.code === 'Space') {
    event.preventDefault();
  }
}

function handleColorInput(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input) return;
  // Remove espaços, aceita unicamente caracteres alfanuméricos, barra (/) e hífen (-), e converte para maiúsculo
  const clean = input.value
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9\/\-]/g, '')
    .toUpperCase();
  formData.color = clean;
  input.value = clean;
}

function selectSector(sector: SectorType) {
  if (isSectorLocked.value && userSector.value && sector !== userSector.value) {
    return;
  }
  activeSector.value = sector;
  if (sector === 'PRE_FABRICADO') {
    formData.type = 'EVA';
  } else if (sector === 'DISTRIBUICAO') {
    formData.type = 'CABEDAL';
  }

  fetchCombinations(sector);
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
  formData.unit = activeSector.value === 'CORTE' ? 'M²' : 'UN';
  formData.type = activeSector.value === 'PRE_FABRICADO' 
    ? 'EVA' 
    : (activeSector.value === 'DISTRIBUICAO' 
        ? 'CABEDAL' 
        : (dbCategories.value.length > 0 ? dbCategories.value[0].name : ''));
  formData.pieceCode = '';
  formData.description = '';
  formData.materialColor = '';
  formData.productName = '';
  formData.sku = '';
  formData.footSide = 'E';

  onCategoryChange();
  savedForm.value = JSON.stringify(formData);

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
    errorMessage.value = 'A quantidade inicial deve ser maior que zero.';
    return;
  }

  if (!Number.isFinite(Number(formData.quantity)) || !/^\d+(?:\.\d{1,3})?$/.test(String(formData.quantity))) {
    errorMessage.value = 'Quantidade inválida: use até três casas decimais.';
    return;
  }
  if (isIntegerQuantitySector.value && !Number.isInteger(Number(formData.quantity))) {
    errorMessage.value = `A quantidade inicial para o setor ${activeSector.value} deve ser um número inteiro (sem decimais).`;
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
        unit: (formData.unit || 'M²').trim().toUpperCase(),
        type: (formData.type || 'OUTROS').trim().toUpperCase(),
      };
      break;

    case 'APOIO':
      if (!formData.pieceCode.trim() || !formData.description.trim() || !formData.sizeGrade.trim()) {
        errorMessage.value = 'COD. PRODUTO / SKU, Descrição da Peça e Grade são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        pieceCode: formData.pieceCode.trim().toUpperCase(),
        productName: formData.productName ? formData.productName.trim().toUpperCase() : '',
        description: formData.description.trim().toUpperCase(),
        materialColor: (formData.materialColor || 'PADRAO').trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
        unit: 'UN',
      };
      break;

    case 'PRE_FABRICADO':
      if (!formData.productName.trim() || !formData.sizeGrade.trim() || !formData.color.trim() || !formData.type) {
        errorMessage.value = 'Nome do Modelo, Material do Solado (EVA ou Borracha), Grade e Combinação da Sola são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        type: formData.type.trim().toUpperCase(),
        sku: (formData.sku || formData.productName).trim().toUpperCase(),
        productName: formData.productName.trim().toUpperCase(),
        color: formData.color.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
        footSide: formData.footSide || 'E',
        unit: 'UN',
      };
      break;

    case 'DISTRIBUICAO':
    case 'EXPEDICAO':
      if (!formData.sku.trim() || !formData.sizeGrade.trim() || !formData.color.trim() || !formData.type) {
        errorMessage.value = 'COD. PRODUTO / SKU, Tipo de Material (Cabedal ou Sola Processada), Grade e Combinação/Cor são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        sector: 'DISTRIBUICAO',
        type: formData.type.trim().toUpperCase(),
        sku: formData.sku.trim().toUpperCase(),
        productName: formData.productName ? formData.productName.trim().toUpperCase() : '',
        color: formData.color.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
        footSide: formData.footSide || 'E',
        unit: 'UN',
      };
      break;

    case 'MONTAGEM':
      if (!formData.sku.trim() || !formData.sizeGrade.trim() || !formData.color.trim()) {
        errorMessage.value = 'COD. PRODUTO / SKU, Combinação / Cor e Grade são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        sku: formData.sku.trim().toUpperCase(),
        productName: formData.productName ? formData.productName.trim().toUpperCase() : '',
        color: formData.color.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
        footSide: formData.footSide || 'E',
        unit: 'UN',
      };
      break;
  }

  isSubmitting.value = true;
  try {
    await stockStore.createBatch([payloadItem]);
    successMessage.value = formData.footSide === 'PAR' && ['PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'].includes(activeSector.value)
      ? `Par cadastrado com sucesso no setor ${activeSector.value}!`
      : `Item cadastrado com sucesso no setor ${activeSector.value}!`;
    if (payloadItem.color) {
      addCombinationLocally(payloadItem.color, activeSector.value);
    }
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
  await fetchCombinations(activeSector.value);
  savedForm.value = JSON.stringify(formData);
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
          v-for="sec in availableSectors"
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

    <PageState :loading="loadingSettings" :error="settingsError" @retry="fetchDynamicSettings" />
    <div v-if="errorMessage" role="alert" class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-xs font-medium flex items-center gap-2">
      <AlertCircle class="w-4 h-4 text-red-600 flex-shrink-0" />
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Campos por Setor -->
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- 1. CORTE -->
      <div v-if="activeSector === 'CORTE'" class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Código do Material *</label>
          <input
            ref="firstInputRef"
            v-model="formData.code"
            type="text"
            placeholder="Ex: MAT-COU-01"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-mono font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome / Descrição *</label>
          <input
            v-model="formData.name"
            type="text"
            placeholder="Ex: Couro Nobuck Preto"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo / Categoria *</label>
          <select
            v-model="formData.type"
            @change="onCategoryChange"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm"
            required
          >
            <option v-for="cat in availableCategories" :key="cat.id" :value="cat.name">
              {{ cat.name }}
            </option>
            <option v-if="availableCategories.length === 0" value="OUTROS">OUTROS</option>
          </select>
        </div>

        <div>
          <label class="flex items-center justify-between text-xs font-bold text-gray-500 uppercase mb-1">
            <span>Unidade de Medida *</span>
            <span v-if="isUnitLocked" class="text-[10px] text-amber-600 flex items-center gap-0.5" title="Unidade fixada pela categoria">
              <Lock class="w-3 h-3" /> Fixa
            </span>
          </label>
          <select
            v-model="formData.unit"
            :disabled="isUnitLocked"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
            required
          >
            <option v-for="unit in dbUnits" :key="unit.symbol" :value="unit.symbol">
              {{ unit.name }} ({{ unit.symbol }})
            </option>
            <option v-if="dbUnits.length === 0" value="M²">M² (Metro Quadrado)</option>
          </select>
        </div>
      </div>

      <!-- 2. APOIO -->
      <div v-if="activeSector === 'APOIO'" class="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">COD. PRODUTO / SKU *</label>
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
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Modelo / Linha *</label>
          <input
            v-model="formData.productName"
            type="text"
            placeholder="Ex: RACER SPEEDZONE"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600"
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
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Combinação / Cor</label>
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
            @input="handleSizeGradeInput"
            type="text"
            placeholder="Ex: 38 ou 37,5"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
          />
        </div>
      </div>

      <!-- 3. PRÉ-FABRICADO (Solas) -->
      <div v-if="activeSector === 'PRE_FABRICADO'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">COD. PRODUTO / SKU *</label>
          <input
            ref="firstInputRef"
            v-model="formData.sku"
            type="text"
            placeholder="Ex: SOL-PEG40-01"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-mono font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Modelo / Linha *</label>
          <input
            v-model="formData.productName"
            type="text"
            placeholder="Ex: RACER CARBON 3"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Material do Solado *</label>
          <select
            v-model="formData.type"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-bold text-gray-800"
            required
          >
            <option value="EVA">EVA (Sola Não Processada)</option>
            <option value="BORRACHA">Borracha</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">COMBINAÇÃO da sola *</label>
          <input
            v-model="formData.color"
            :list="'combinations-list-' + activeSector"
            type="text"
            placeholder="Ex: BRANCO/GOMA ou PRETO-VERMELHO"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
            autocomplete="off"
            @keydown="handleColorKeydown"
            @input="handleColorInput"
          />
          <datalist :id="'combinations-list-' + activeSector">
            <option v-for="comb in availableCombinations" :key="comb" :value="comb" />
          </datalist>
          <span v-if="availableCombinations.length > 0" class="text-[10px] text-gray-400 mt-0.5 block">
            {{ availableCombinations.length }} sugestão(ões) salva(s)
          </span>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Grade / Numeração *</label>
          <input
            v-model="formData.sizeGrade"
            @input="handleSizeGradeInput"
            type="text"
            placeholder="Ex: 39 ou 40,5"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Lado do Pé *</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              @click="formData.footSide = 'E'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'E' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              E
            </button>
            <button
              type="button"
              @click="formData.footSide = 'D'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'D' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              D
            </button>
            <button
              type="button"
              @click="formData.footSide = 'PAR'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'PAR'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              Par (E + D)
            </button>
          </div>
        </div>
      </div>

      <!-- 4. DISTRIBUIÇÃO (Cabedais e Solas Processadas) -->
      <div v-if="activeSector === 'DISTRIBUICAO'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">COD. PRODUTO / SKU *</label>
          <input
            ref="firstInputRef"
            v-model="formData.sku"
            type="text"
            placeholder="Ex: NKE-PEG40-01"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-mono font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Modelo / Linha</label>
          <input
            v-model="formData.productName"
            type="text"
            placeholder="Ex: RACER SPEEDZONE"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Material *</label>
          <select
            v-model="formData.type"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-bold text-gray-800"
            required
          >
            <option value="CABEDAL">Cabedal</option>
            <option value="SOLA_PROCESSADA">Sola Processada</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Combinação / Cor *</label>
          <input
            v-model="formData.color"
            :list="'combinations-list-' + activeSector"
            type="text"
            placeholder="Ex: PRETO-VERMELHO ou BRANCO/GOMA"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
            autocomplete="off"
            @keydown="handleColorKeydown"
            @input="handleColorInput"
          />
          <datalist :id="'combinations-list-' + activeSector">
            <option v-for="comb in availableCombinations" :key="comb" :value="comb" />
          </datalist>
          <span v-if="availableCombinations.length > 0" class="text-[10px] text-gray-400 mt-0.5 block">
            {{ availableCombinations.length }} sugestão(ões) salva(s)
          </span>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Grade / Numeração *</label>
          <input
            v-model="formData.sizeGrade"
            @input="handleSizeGradeInput"
            type="text"
            placeholder="Ex: 41 ou 41,5"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Lado do Pé *</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              @click="formData.footSide = 'E'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'E' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              E
            </button>
            <button
              type="button"
              @click="formData.footSide = 'D'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'D' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              D
            </button>
            <button
              type="button"
              @click="formData.footSide = 'PAR'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'PAR'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              Par (E + D)
            </button>
          </div>
        </div>
      </div>

      <!-- 5. MONTAGEM -->
      <div v-if="activeSector === 'MONTAGEM'" class="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">COD. PRODUTO / SKU *</label>
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
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Modelo / Linha *</label>
          <input
            v-model="formData.productName"
            type="text"
            placeholder="Ex: RACER SPEEDZONE"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Combinação / Cor *</label>
          <input
            v-model="formData.color"
            :list="'combinations-list-' + activeSector"
            type="text"
            placeholder="Ex: BRANCO/PRETO ou PRETO-GOMA"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
            autocomplete="off"
            @keydown="handleColorKeydown"
            @input="handleColorInput"
          />
          <datalist :id="'combinations-list-' + activeSector">
            <option v-for="comb in availableCombinations" :key="comb" :value="comb" />
          </datalist>
          <span v-if="availableCombinations.length > 0" class="text-[10px] text-gray-400 mt-0.5 block">
            {{ availableCombinations.length }} sugestão(ões) salva(s)
          </span>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Grade / Numeração *</label>
          <input
            v-model="formData.sizeGrade"
            @input="handleSizeGradeInput"
            type="text"
            placeholder="Ex: 38 ou 38,5"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold"
            required
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Lado do Pé *</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              @click="formData.footSide = 'E'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'E' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              E
            </button>
            <button
              type="button"
              @click="formData.footSide = 'D'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'D' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              D
            </button>
            <button
              type="button"
              @click="formData.footSide = 'PAR'"
              class="py-2 rounded font-bold text-xs transition-all border text-center"
              :class="formData.footSide === 'PAR'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'"
            >
              Par (E + D)
            </button>
          </div>
        </div>
      </div>

      <!-- Campos Comuns -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-100">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ formData.footSide === 'PAR' && ['PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'].includes(activeSector) ? 'Quantidade de Pares' : 'Quantidade Inicial' }} *</label>
          <input
            v-model="formData.quantity"
            :step="isIntegerQuantitySector ? 1 : 0.001"
            type="text"
            :inputmode="isIntegerQuantitySector ? 'numeric' : 'decimal'"
            @input="handleQuantityInput"
            placeholder="Ex: 10"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white font-bold text-sm text-gray-800"
            required
            autocomplete="off"
          />
          <span v-if="isIntegerQuantitySector" class="text-[10px] text-gray-400 mt-0.5 block">
            {{ formData.footSide === 'PAR' && ['PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM'].includes(activeSector) ? 'Cada par cadastra 1 pé esquerdo e 1 direito' : 'Estoque inicial do item (apenas números inteiros)' }}
          </span>
          <span v-else class="text-[10px] text-gray-400 mt-0.5 block">
            Estoque inicial do item (permite decimais ex: 12.5 m²)
          </span>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Prateleira / Localização (Configurações) *</label>
          <select
            v-model="formData.location"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white font-bold text-sm text-gray-800 disabled:bg-gray-100 disabled:text-gray-400"
            required
            :disabled="availableLocations.length === 0"
          >
            <option value="" disabled selected>
              {{ availableLocations.length === 0 ? '(Nenhuma prateleira vinculada a esta categoria)' : 'Selecione a Prateleira...' }}
            </option>
            <option v-for="loc in availableLocations" :key="loc.id" :value="loc.name">
              {{ loc.name }}
            </option>
          </select>
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
          @click="cancelForm"
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
