<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed, watch } from 'vue';
import { useStockStore, SectorType } from '@/stores/stockStore';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/httpClient';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { normalizeSector, requestErrorMessage, SECTOR_OPTIONS } from '@/utils/domain';
import PageState from '@/components/PageState.vue';
import CategorySelector from '@/components/CategorySelector.vue';
import { 
  Scissors, Wrench, Layers, Box, Footprints, 
  Plus, Check, AlertCircle
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
    : stockStore.activeSector === 'EXPEDICAO'
      ? 'DISTRIBUICAO'
      : stockStore.activeSector === 'TODOS'
        ? 'CORTE'
        : stockStore.activeSector
);
const isSubmitting = ref(false);
const keepDataAfterSave = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const firstInputRef = ref<HTMLInputElement | null>(null);

// Dados Dinâmicos carregados do módulo de Configurações
const dbCategories = ref<any[]>([]);
const dbUnits = ref<any[]>([]);
const dbLocations = ref<any[]>([]);
const dbOrigins = ref<any[]>([]);
const dbSubsectors = ref<any[]>([]);
const loadingSettings = ref(false);
const settingsError = ref('');

// Cache reativo de combinações / cores para autocomplete por setor
const combinationsCache = ref<Record<string, string[]>>({});
const availableCombinations = computed(() => {
  return combinationsCache.value[activeSector.value] || [];
});

async function fetchCombinations(sector: SectorType) {
  if (sector !== 'APOIO' && sector !== 'PRE_FABRICADO' && sector !== 'DISTRIBUICAO' && sector !== 'MONTAGEM') {
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
  categoryId: '',
  origem: '',
  quantity: 1,
  observation: '',
  sizeGrade: '',
  color: '',
  code: '',
  name: '',
  unit: '',
  subsectorId: '',
  type: '',
  pieceCode: '',
  description: '',
  materialColor: '',
  productName: '',
  sku: '',
  footSide: null as 'E' | 'D' | 'PAR' | null,
});
const savedForm = ref(JSON.stringify(formData));
const { confirmDiscard } = useUnsavedChanges(() => JSON.stringify(formData) !== savedForm.value);
async function confirmClose() {
  if (isSubmitting.value) return false;
  return await confirmDiscard();
}
defineExpose({ confirmDiscard: confirmClose });
async function cancelForm() {
  if (await confirmClose()) emit('cancel');
}

const selectedCategory = computed(() => dbCategories.value.find(category => Number(category.id) === Number(formData.categoryId)) || null);
const availableSubsectors = computed(() => dbSubsectors.value.filter(subsector =>
  subsector.active !== false && normalizeSector(subsector.sector) === normalizeSector(activeSector.value)
));
const selectedSubsector = computed(() => availableSubsectors.value.find(subsector => String(subsector.id) === String(formData.subsectorId)) || null);
const supportsPair = computed(() => selectedCategory.value?.entryMode === 'SIDE_PAIR');
const isCategoryRequired = computed(() => true);
const isSubsectorCategoryRequired = computed(() => selectedSubsector.value?.categoryMode === 'SELECTED');
const hasUnitConfigurationConflict = computed(() => Boolean(selectedCategory.value) && (
  !selectedCategory.value.defaultUnitCode
  || (supportsPair.value && selectedCategory.value.defaultUnitCode !== 'UN')
));

function defaultUnitForSector() { return ''; }

const allSectors = [
  { id: 'CORTE' as SectorType, icon: Scissors },
  { id: 'APOIO' as SectorType, icon: Wrench },
  { id: 'PRE_FABRICADO' as SectorType, icon: Layers },
  { id: 'DISTRIBUICAO' as SectorType, icon: Box },
  { id: 'MONTAGEM' as SectorType, icon: Footprints },
].map((sector) => {
  const option = SECTOR_OPTIONS.find((candidate) => candidate.id === sector.id);
  return { ...sector, label: option?.shortLabel || option?.label || sector.id };
});

const availableSectors = computed(() => {
  if (isSectorLocked.value && userSector.value) {
    return allSectors.filter(s => s.id === userSector.value);
  }
  return allSectors;
});

const availableCategories = computed(() => {
  const currentSec = activeSector.value;
  let categories = dbCategories.value.filter(cat => {
    const sectors = Array.isArray(cat.sectors) && cat.sectors.length
      ? cat.sectors
      : cat.sector ? [cat.sector] : [];
    if (sectors.length === 0) return true;
    return sectors.some((sector: string) => (sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : sector) === currentSec);
  });
  if (selectedSubsector.value?.categoryMode === 'SELECTED') {
    const allowedIds = new Set((selectedSubsector.value.categoryLinks || []).map((link: any) => Number(link.categoryConfigId)));
    categories = categories.filter(category => allowedIds.has(Number(category.id)));
  }
  return categories;
});

const availableOrigins = computed(() => dbOrigins.value.filter(origin =>
  !origin.sector || normalizeSector(origin.sector) === normalizeSector(activeSector.value)
));

watch([activeSector, availableOrigins], () => {
  if (!availableOrigins.value.some(origin => origin.name === formData.origem)) {
    formData.origem = '';
  }
});

async function fetchDynamicSettings() {
  loadingSettings.value = true;
  settingsError.value = '';
  try {
    const [catsRes, unitsRes, locsRes, originsRes, subsectorsRes] = await Promise.all([
      api.get('/settings/categories'),
      api.get('/settings/units'),
      api.get('/settings/locations'),
      api.get('/settings/origins'),
      api.get('/settings/subsectors'),
    ]);

    dbCategories.value = catsRes.data || [];
    dbUnits.value = unitsRes.data || [];
    dbLocations.value = locsRes.data || [];
    dbOrigins.value = originsRes.data || [];
    dbSubsectors.value = subsectorsRes.data || [];

  } catch (err) {
    settingsError.value = requestErrorMessage(err, 'Não foi possível carregar as configurações.');
  } finally {
    loadingSettings.value = false;
  }
}

function onConfiguredCategoryChange() {
  formData.location = '';
}
watch(selectedCategory, category => {
  formData.type = category?.name || '';
  formData.unit = category?.defaultUnitCode || '';
  formData.footSide = category?.entryMode === 'SIDE_PAIR' ? 'E' : null;
});

const availableLocations = computed(() => {
  const currentSec = activeSector.value;
  let sectorLocs = dbLocations.value.filter(loc => {
    if (Number(loc.subsectorId || 0) !== Number(formData.subsectorId || 0)) return false;
    if (!loc.sector) return true;
    const locSec = loc.sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : loc.sector;
    return locSec === currentSec;
  });

  if (formData.categoryId) {
    const categoryId = Number(formData.categoryId);
    sectorLocs = sectorLocs.filter(location =>
      location.categoryMode === 'ALL'
      || Number(location.categoryId) === categoryId
      || location.categoryLinks?.some((link: any) => Number(link.categoryId) === categoryId)
    );
  }

  return sectorLocs;
});

watch(() => formData.subsectorId, () => {
  formData.location = '';
  if (formData.categoryId && !availableCategories.value.some(category => Number(category.id) === Number(formData.categoryId))) {
    formData.categoryId = '';
    formData.type = '';
  }
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
  return Boolean(dbUnits.value.find(unit => unit.symbol === formData.unit)?.integerOnly) || ['UN', 'PAR', 'CX', 'ROLO'].includes(formData.unit);
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
  formData.categoryId = '';
  formData.subsectorId = '';
  formData.location = '';
  formData.type = '';
  formData.unit = defaultUnitForSector();

  fetchCombinations(sector);
  errorMessage.value = '';
  successMessage.value = '';
  nextTick(() => {
    firstInputRef.value?.focus();
  });
}

function resetForm() {
  formData.location = '';
  formData.categoryId = '';
  formData.subsectorId = '';
  formData.origem = '';
  formData.quantity = 1;
  formData.observation = '';
  formData.sizeGrade = '';
  formData.color = '';
  formData.code = '';
  formData.name = '';
  formData.unit = defaultUnitForSector();
  formData.type = '';
  formData.pieceCode = '';
  formData.description = '';
  formData.materialColor = '';
  formData.productName = '';
  formData.sku = '';
  formData.footSide = null;

  savedForm.value = JSON.stringify(formData);

  nextTick(() => {
    firstInputRef.value?.focus();
  });
}

async function handleSubmit() {
  errorMessage.value = '';
  successMessage.value = '';

  if (hasUnitConfigurationConflict.value) {
    errorMessage.value = 'Defina uma unidade válida na categoria. O cadastro por lado/par exige UN.';
    return;
  }

  if ((isCategoryRequired.value || isSubsectorCategoryRequired.value) && !formData.categoryId) {
    errorMessage.value = 'Selecione uma categoria de material configurada para este setor antes de continuar.';
    return;
  }

  if (!formData.location.trim()) {
    errorMessage.value = formData.categoryId && availableLocations.value.length === 0
      ? `Nenhuma localização está vinculada à categoria ${selectedCategory.value?.name || 'selecionada'}. Vincule uma em Configurações > Localizações / Prateleiras.`
      : 'Informe a prateleira / localização física.';
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
    subsectorId: formData.subsectorId ? Number(formData.subsectorId) : null,
    categoryId: formData.categoryId ? Number(formData.categoryId) : null,
    origem: formData.origem.trim(),
    location: formData.location.trim(),
    quantity: Number(formData.quantity),
    observation: formData.observation.trim(),
    unit: formData.unit,
    footSide: supportsPair.value ? formData.footSide : null,
  };

  switch (activeSector.value) {
    case 'CORTE':
      if (!formData.code.trim() || !formData.name.trim()) {
        errorMessage.value = 'Código e Nome da matéria-prima são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        categoryId: Number(formData.categoryId),
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim().toUpperCase(),
        unit: (formData.unit || 'M²').trim().toUpperCase(),
        type: selectedCategory.value?.name || formData.type.trim().toUpperCase(),
      };
      break;

    case 'APOIO':
      if (!formData.pieceCode.trim() || !formData.description.trim() || !formData.sizeGrade.trim() || !formData.materialColor.trim()) {
        errorMessage.value = 'Código do produto, descrição, material/cor e grade são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        type: selectedCategory.value.name,
        pieceCode: formData.pieceCode.trim().toUpperCase(),
        productName: formData.productName.trim().toUpperCase(),
        description: formData.description.trim().toUpperCase(),
        materialColor: formData.materialColor.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
      };
      break;

    case 'PRE_FABRICADO':
      if (!formData.productName.trim() || !formData.sizeGrade.trim() || !formData.color.trim() || !selectedCategory.value) {
        errorMessage.value = 'Nome do Modelo, categoria do material, Grade e Combinação da Sola são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        categoryId: Number(formData.categoryId),
        type: selectedCategory.value.name,
        sku: (formData.sku || formData.productName).trim().toUpperCase(),
        productName: formData.productName.trim().toUpperCase(),
        color: formData.color.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
        footSide: supportsPair.value ? formData.footSide : null,
      };
      break;

    case 'DISTRIBUICAO':
    case 'EXPEDICAO':
      if (!formData.sku.trim() || !formData.sizeGrade.trim() || !formData.color.trim() || !selectedCategory.value) {
        errorMessage.value = 'COD. PRODUTO / SKU, categoria do material, Grade e Combinação/Cor são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        categoryId: Number(formData.categoryId),
        sector: 'DISTRIBUICAO',
        type: selectedCategory.value.name,
        sku: formData.sku.trim().toUpperCase(),
        productName: formData.productName ? formData.productName.trim().toUpperCase() : '',
        color: formData.color.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
        footSide: supportsPair.value ? formData.footSide : null,
      };
      break;

    case 'MONTAGEM':
      if (!formData.sku.trim() || !formData.sizeGrade.trim() || !formData.color.trim()) {
        errorMessage.value = 'COD. PRODUTO / SKU, Combinação / Cor e Grade são obrigatórios.';
        return;
      }
      payloadItem = {
        ...payloadItem,
        categoryId: formData.categoryId ? Number(formData.categoryId) : null,
        type: selectedCategory.value?.name || '',
        sku: formData.sku.trim().toUpperCase(),
        productName: formData.productName ? formData.productName.trim().toUpperCase() : '',
        color: formData.color.trim().toUpperCase(),
        sizeGrade: formData.sizeGrade.trim().toUpperCase(),
        footSide: supportsPair.value ? formData.footSide : null,
      };
      break;
  }

  isSubmitting.value = true;
  try {
    await stockStore.createBatch([payloadItem]);
    successMessage.value = formData.footSide === 'PAR' && supportsPair.value
      ? `Par cadastrado com sucesso no setor ${activeSector.value}!`
      : `Item cadastrado com sucesso no setor ${activeSector.value}!`;
    if (payloadItem.color) {
      addCombinationLocally(payloadItem.color, activeSector.value);
    }
    if (keepDataAfterSave.value) {
      savedForm.value = JSON.stringify(formData);
      nextTick(() => firstInputRef.value?.focus());
    } else {
      resetForm();
    }
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
  <div class="entry-form-shell flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
    <!-- Seletor de setor em uma faixa própria para não competir com o título do diálogo. -->
    <div class="shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-5">
      <div
        class="entry-sector-grid"
        :class="availableSectors.length === 1 ? 'entry-sector-grid--single' : ''"
        role="group"
        aria-label="Setor da entrada de estoque"
      >
        <button
          v-for="sec in availableSectors"
          :key="sec.id"
          type="button"
          @click="selectSector(sec.id)"
          :aria-pressed="activeSector === sec.id"
          class="flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-xs font-bold leading-tight transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          :class="activeSector === sec.id
            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900'"
        >
          <component :is="sec.icon" class="h-4 w-4 shrink-0" />
          <span>{{ sec.label }}</span>
        </button>
      </div>
    </div>

    <form @submit.prevent="handleSubmit" class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
        <!-- Alertas -->
        <div v-if="successMessage" class="mb-4 flex items-center gap-2 rounded border border-green-300 bg-green-50 p-3 text-xs font-medium text-green-700">
          <Check class="h-4 w-4 shrink-0 text-green-600" />
          <span>{{ successMessage }}</span>
        </div>

        <PageState :loading="loadingSettings" :error="settingsError" @retry="fetchDynamicSettings" />
        <div v-if="errorMessage" role="alert" class="mb-4 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-700">
          <AlertCircle class="h-4 w-4 shrink-0 text-red-600" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Dados do material e suas variantes -->
        <h3 class="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Dados do material e variações</h3>

        <div class="mb-4">
          <CategorySelector v-model="formData.categoryId" @change="onConfiguredCategoryChange"
            :categories="availableCategories" label="Categoria do material" required
            empty-message="Cadastre uma categoria para este setor em Configurações." />
        </div>

        <!-- Campos por Setor -->
        <!-- 1. CORTE -->
      <div v-if="activeSector === 'CORTE'" class="entry-form-grid entry-form-grid--sector">
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

        <div class="entry-form-field--wide">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome / Descrição *</label>
          <input
            v-model="formData.name"
            type="text"
            placeholder="Ex: Couro Nobuck Preto"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm"
            required
          />
        </div>


      </div>

      <!-- 2. APOIO -->
      <div v-if="activeSector === 'APOIO'" class="entry-form-grid entry-form-grid--sector">

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Código do Produto *</label>
            <input ref="firstInputRef" v-model="formData.pieceCode" type="text" placeholder="Ex: MOL-GAS-01"
              class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-mono font-bold text-blue-600" required />
          </div>
          <div class="entry-form-field--wide">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Modelo / Linha *</label>
            <input v-model="formData.productName" type="text" placeholder="Ex: RACER SPEEDZONE"
              class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600" required />
          </div>
          <div class="entry-form-field--wide">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição da Peça *</label>
            <input v-model="formData.description" type="text" placeholder="Ex: Gáspea Externa"
              class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm" required />
          </div>
          <div class="entry-form-field--wide">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Material / Cor *</label>
            <input v-model="formData.materialColor" type="text" placeholder="Ex: Napa Sintética Branca"
              class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm" required />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Grade / Numeração *</label>
            <input v-model="formData.sizeGrade" @input="handleSizeGradeInput" type="text" placeholder="Ex: 38 ou 37,5"
              class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold" required />
          </div>

      </div>

      <!-- 3. PRÉ-FABRICADO (Solas) -->
      <div v-if="activeSector === 'PRE_FABRICADO'" class="entry-form-grid entry-form-grid--sector">
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

        <div class="entry-form-field--wide">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Modelo / Linha *</label>
          <input
            v-model="formData.productName"
            type="text"
            placeholder="Ex: RACER CARBON 3"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600"
            required
          />
        </div>

        <div class="entry-form-field--wide">
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


      </div>

      <!-- 4. DISTRIBUIÇÃO (Cabedais e Solas Processadas) -->
      <div v-if="activeSector === 'DISTRIBUICAO'" class="entry-form-grid entry-form-grid--sector">
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

        <div class="entry-form-field--wide">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Modelo / Linha</label>
          <input
            v-model="formData.productName"
            type="text"
            placeholder="Ex: RACER SPEEDZONE"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600"
          />
        </div>

        <div class="entry-form-field--wide">
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


      </div>

      <!-- 5. MONTAGEM -->
      <div v-if="activeSector === 'MONTAGEM'" class="entry-form-grid entry-form-grid--sector">
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

        <div class="entry-form-field--wide">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Modelo / Linha *</label>
          <input
            v-model="formData.productName"
            type="text"
            placeholder="Ex: RACER SPEEDZONE"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white uppercase text-sm font-bold text-blue-600"
            required
          />
        </div>

        <div class="entry-form-field--wide">
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


      </div>

      <div v-if="supportsPair" class="mt-4">
        <label class="mb-1 block text-xs font-bold uppercase text-gray-500">Lado / Par *</label>
        <div class="flex gap-2" role="group" aria-label="Lado do material">
          <button v-for="side in [{ value: 'E', label: 'Esquerdo (E)' }, { value: 'D', label: 'Direito (D)' }, { value: 'PAR', label: 'Par (E + D)' }]"
            :key="side.value" type="button" @click="formData.footSide = side.value" :aria-pressed="formData.footSide === side.value"
            class="flex-1 rounded border px-3 py-2 text-xs font-bold"
            :class="formData.footSide === side.value ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-700'">
            {{ side.label }}
          </button>
        </div>
      </div>

      <!-- Campos Comuns -->
      <section class="mt-5 border-t border-gray-100 pt-4" aria-labelledby="entry-stock-heading">
        <h3 id="entry-stock-heading" class="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Entrada no estoque</h3>
      <div class="entry-form-grid entry-form-grid--shared">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">{{ formData.footSide === 'PAR' && supportsPair ? 'Quantidade de Pares' : formData.unit ? `Quantidade Inicial (${formData.unit})` : 'Quantidade Inicial' }} *</label>
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
            {{ formData.footSide === 'PAR' && supportsPair ? 'Cada par cadastra 1 pé esquerdo e 1 direito' : 'Estoque inicial do item (apenas números inteiros)' }}
          </span>
          <span v-else class="text-[10px] text-gray-400 mt-0.5 block">
            Estoque inicial do item (permite decimais ex: 12.5 {{ formData.unit }})
          </span>
          <span v-if="selectedCategory" class="mt-0.5 block text-[10px] text-amber-600">
            Unidade definida pela categoria.
          </span>
          <span v-if="hasUnitConfigurationConflict" role="alert" class="mt-1 block text-[10px] font-semibold text-rose-700">
            A categoria precisa de unidade válida; o modo lado/par exige UN. Ajuste em Configurações.
          </span>
        </div>

        <div v-if="availableSubsectors.length">
          <label for="entry-subsector" class="block text-xs font-bold text-gray-500 uppercase mb-1">Subsetor (opcional)</label>
          <select id="entry-subsector" v-model="formData.subsectorId"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm font-medium text-gray-800">
            <option value="">Sem subsetor (fluxo atual do setor)</option>
            <option v-for="subsector in availableSubsectors" :key="subsector.id" :value="String(subsector.id)">
              {{ subsector.name }}
            </option>
          </select>
          <span v-if="selectedSubsector" class="mt-0.5 block text-[10px] text-gray-500">
            A entrada e a localização ficarão restritas a {{ selectedSubsector.name }}.
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
              {{ availableLocations.length === 0 ? (formData.subsectorId ? '(Nenhuma prateleira deste subsetor vinculada à categoria selecionada)' : formData.categoryId ? '(Nenhuma prateleira vinculada à categoria selecionada)' : '(Nenhuma prateleira cadastrada para este setor)') : 'Selecione a Prateleira...' }}
            </option>
            <option v-for="loc in availableLocations" :key="loc.id" :value="loc.name">
              {{ loc.name }}
            </option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo / Origem da Sobra (opcional)</label>
          <select
            v-model="formData.origem"
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm disabled:bg-gray-100 disabled:text-gray-400"
            :disabled="availableOrigins.length === 0"
          >
            <option value="" disabled>
              {{ availableOrigins.length ? 'Selecione um motivo (opcional)...' : 'Nenhuma origem configurada (opcional)' }}
            </option>
            <option v-for="origin in availableOrigins" :key="origin.id" :value="origin.name">
              {{ origin.name }}{{ !origin.sector ? ' (Geral)' : '' }}
            </option>
          </select>
          <span class="text-[10px] text-gray-400 mt-0.5 block">
            O motivo escolhido será registrado no histórico desta entrada.
          </span>
        </div>

        <div class="col-span-full">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Observação adicional (opcional)</label>
          <input
            v-model="formData.observation"
            type="text"
            placeholder="Detalhe complementar..."
            class="w-full border border-gray-200 p-2 rounded outline-none focus:border-blue-500 bg-white text-sm"
          />
        </div>
      </div>
      </section>
      </div>

      <!-- Botões de Ação -->
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-gray-200 bg-white px-3 py-3 sm:px-5">
        <label class="mr-auto inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700">
          <input
            v-model="keepDataAfterSave"
            type="checkbox"
            role="switch"
            :aria-checked="keepDataAfterSave"
            :disabled="isSubmitting"
            class="peer sr-only"
          />
          <span
            aria-hidden="true"
            class="relative h-5 w-9 shrink-0 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-blue-600 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
          ></span>
          <span>Manter dados após salvar</span>
        </label>
        <button
          type="button"
          @click="cancelForm"
          class="px-4 py-2 rounded text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>

        <button
          type="submit"
          :disabled="isSubmitting || hasUnitConfigurationConflict"
          class="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded flex items-center gap-2 shadow-sm transition-colors text-xs disabled:opacity-50"
        >
          <Plus class="w-4 h-4" />
          <span>{{ isSubmitting ? 'Salvando...' : 'Gravar Entrada' }}</span>
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.entry-form-shell input::placeholder,
.entry-form-shell textarea::placeholder {
  color: #6b7280;
  opacity: 1;
}

.entry-form-shell {
  container: entry-form / inline-size;
}

.entry-sector-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.entry-sector-grid > * {
  min-width: 0;
}

.entry-sector-grid--single {
  grid-template-columns: minmax(0, 1fr);
}

.entry-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

.entry-form-grid > * {
  min-width: 0;
}

@container entry-form (min-width: 42rem) {
  .entry-sector-grid:not(.entry-sector-grid--single) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .entry-form-grid--sector,
  .entry-form-grid--shared {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .entry-form-field--wide {
    grid-column: span 2;
    min-width: 0;
  }
}

@container entry-form (min-width: 48rem) {
  .entry-sector-grid:not(.entry-sector-grid--single) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@container entry-form (min-width: 60rem) {
  .entry-form-grid--sector,
  .entry-form-grid--shared {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
