<template>
  <section class="space-y-6">
    <div class="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
      <h2 class="text-base font-bold text-indigo-950">Regras especiais entre produtos e materiais</h2>
      <p class="mt-1 max-w-4xl text-xs leading-relaxed text-indigo-900">
        O sistema sugere automaticamente materiais com SKU compartilhado e, quando o modelo e as variantes batem, também Peças Cortadas. Use esta configuração para matéria-prima de Corte sem SKU compartilhado, relações especiais entre componentes ou conversões de unidade.
        Cada regra vale somente para esta unidade fabril, setor e variantes. Informe quanto do material fornecedor é consumido por unidade solicitada.
      </p>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <form class="space-y-4" @submit.prevent="createCompatibility">
        <div class="grid gap-3 md:grid-cols-3">
          <label class="text-xs font-bold text-slate-700">
            Setor solicitante
            <select v-model="form.requestSector" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option v-for="sector in sectors" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
            </select>
          </label>
          <label class="text-xs font-bold text-slate-700">
            SKU / código solicitado {{ form.requestSector === 'CORTE' ? '(opcional se usar descrição)' : '*' }}
            <input v-model.trim="form.requestSku" :required="form.requestSector !== 'CORTE'" maxlength="120" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase" placeholder="Ex.: NKE-PEG-40-BLK" />
          </label>
          <label class="text-xs font-bold text-slate-700">
            Modelo / linha
            <input v-model.trim="form.requestModelName" maxlength="160" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase" placeholder="Opcional; vazio = qualquer modelo" />
          </label>
        </div>

        <label v-if="form.requestSector === 'CORTE'" class="block text-xs font-bold text-slate-700">
          Descrição exata do material solicitado
          <input v-model.trim="form.requestDescription" maxlength="240" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase" placeholder="Obrigatória quando a requisição de Corte não tiver SKU/código" />
          <span class="mt-1 block font-normal text-slate-500">Use a mesma descrição informada no formulário de requisição. É necessária para vincular Corte quando o item não tiver código.</span>
        </label>

        <div class="grid gap-3 md:grid-cols-4">
          <label class="text-xs font-bold text-slate-700">
            Tipo solicitado
            <input v-model.trim="form.requestType" maxlength="100" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase" placeholder="Vazio = qualquer tipo" />
          </label>
          <label class="text-xs font-bold text-slate-700">
            Cor / combinação
            <input v-model.trim="form.requestColor" maxlength="100" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase" placeholder="Vazio = qualquer cor" />
          </label>
          <label class="text-xs font-bold text-slate-700">
            Grade / tamanho
            <input v-model.trim="form.requestSizeGrade" maxlength="100" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase" placeholder="Vazio = qualquer grade" />
          </label>
          <label class="text-xs font-bold text-slate-700">
            Lado solicitado
            <select v-model="form.requestFootSide" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Sem restrição</option>
              <option value="E">Pé esquerdo</option>
              <option value="D">Pé direito</option>
              <option value="PAR">Par</option>
            </select>
          </label>
        </div>

        <div class="grid gap-3 md:grid-cols-3">
          <label class="text-xs font-bold text-slate-700">
            Unidade da quantidade solicitada *
            <select v-model="form.requestUnit" required class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option v-for="unit in unitOptions" :key="unit" :value="unit">{{ unit }}</option>
            </select>
          </label>
          <label class="text-xs font-bold text-slate-700">
            Setor fornecedor
            <select v-model="form.sourceSector" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option v-for="sector in sourceSectors" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
            </select>
          </label>
          <label class="text-xs font-bold text-slate-700">
            Quantidade fornecedora por unidade solicitada *
            <input v-model.number="form.sourceQuantityPerRequestUnit" type="number" min="0.001" step="0.001" required class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
        </div>

        <div class="grid gap-3 md:grid-cols-[1fr_1fr]">
          <label class="text-xs font-bold text-slate-700">
            Pesquisar item existente no setor fornecedor *
            <input v-model.trim="sourceSearch" minlength="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase" placeholder="Digite SKU, código, descrição ou cor" />
            <span class="mt-1 block font-normal text-slate-500">Selecione o registro de estoque que será baixado diretamente no atendimento.</span>
          </label>
          <label class="text-xs font-bold text-slate-700">
            Item fornecedor *
            <select v-model.number="form.sourceStockItemId" required class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option :value="null" disabled>{{ loadingItems ? 'Pesquisando...' : 'Selecione um item' }}</option>
              <option v-for="item in sourceItems" :key="item.id" :value="item.id">{{ sourceItemLabel(item) }}</option>
            </select>
          </label>
        </div>

        <label class="block text-xs font-bold text-slate-700">
          Por que este item pode atender o produto? *
          <input v-model.trim="form.reason" required minlength="3" maxlength="240" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Ex.: Componente previsto na lista de materiais da linha" />
        </label>

        <div v-if="error" role="alert" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{{ error }}</div>
        <div class="flex justify-end">
          <button type="submit" :disabled="saving || !form.sourceStockItemId" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {{ saving ? 'Salvando...' : 'Salvar regra especial' }}
          </button>
        </div>
      </form>
    </div>

    <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h3 class="font-bold text-slate-800">Vínculos cadastrados</h3>
        <button type="button" @click="loadMappings" class="text-xs font-bold text-indigo-700 hover:text-indigo-900">Atualizar</button>
      </div>
      <div v-if="loadingMappings" class="px-5 py-8 text-center text-sm text-slate-500">Carregando vínculos...</div>
      <div v-else-if="mappings.length === 0" class="px-5 py-8 text-center text-sm text-slate-500">Nenhuma regra especial cadastrada para esta unidade fabril.</div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-left text-xs">
          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th class="px-4 py-3">Produto solicitado</th>
              <th class="px-4 py-3">Origem / item fornecedor</th>
              <th class="px-4 py-3">Consumo</th>
              <th class="px-4 py-3">Compatibilidade</th>
              <th class="px-4 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="mapping in mappings" :key="mapping.id" class="align-top">
              <td class="px-4 py-3">
                <span class="block font-bold text-slate-800">{{ formatSectorName(mapping.requestSector) }} · {{ mapping.requestSku || mapping.requestDescription }}</span>
                <span class="text-slate-500">{{ targetVariantLabel(mapping) }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="block font-bold text-slate-800">{{ formatSectorName(mapping.sourceSector) }}</span>
                <span class="text-slate-600">{{ sourceItemLabel(mapping.sourceItem || {}) }}</span>
              </td>
              <td class="px-4 py-3 font-semibold text-slate-700">{{ mapping.sourceQuantityPerRequestUnit }} {{ mapping.sourceItem?.unit || '' }} / {{ mapping.requestUnit }}</td>
              <td class="max-w-xs px-4 py-3 text-slate-600">{{ mapping.reason }}</td>
              <td class="px-4 py-3 text-right">
                <button type="button" @click="deleteMapping(mapping)" :disabled="deletingId === mapping.id" class="font-bold text-rose-700 hover:text-rose-900 disabled:opacity-50">{{ deletingId === mapping.id ? 'Excluindo...' : 'Excluir' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '@/services/httpClient'
import { formatSectorName, SECTOR_OPTIONS } from '@/utils/domain'

const sectors = SECTOR_OPTIONS.filter(sector => sector.id !== 'TODOS')
const sourceSectors = computed(() => sectors.filter(sector => sector.id !== form.requestSector))
const unitOptions = ['UN', 'PAR', 'M²', 'M', 'KG', 'G', 'CX', 'ROLO', 'CM', 'L']
const form = reactive({
  requestSector: 'MONTAGEM',
  requestSku: '',
  requestDescription: '',
  requestModelName: '',
  requestType: '',
  requestColor: '',
  requestSizeGrade: '',
  requestFootSide: '',
  requestUnit: 'UN',
  sourceSector: 'DISTRIBUICAO',
  sourceStockItemId: null,
  sourceQuantityPerRequestUnit: 1,
  reason: '',
})
const sourceSearch = ref('')
const sourceItems = ref([])
const mappings = ref([])
const loadingItems = ref(false)
const loadingMappings = ref(false)
const saving = ref(false)
const deletingId = ref(null)
const error = ref('')
let sourceSearchVersion = 0

watch(() => form.requestSector, () => {
  if (form.sourceSector === form.requestSector) form.sourceSector = sourceSectors.value[0]?.id || 'CORTE'
})
watch(() => form.sourceSector, () => {
  form.sourceStockItemId = null
  sourceItems.value = []
  if (sourceSearch.value.trim().length >= 2) void loadSourceItems()
})
watch(sourceSearch, () => {
  if (sourceSearch.value.trim().length >= 2) void loadSourceItems()
  else { sourceSearchVersion++; sourceItems.value = []; form.sourceStockItemId = null }
})

function sourceItemLabel(item) {
  const code = item.code || item.pieceCode || item.sku || item.productName || `Item #${item.id || '?'}`
  const name = item.description || item.name || item.productName || ''
  const variants = [item.type || item.componentType, item.color || item.materialColor, item.sizeGrade, item.footSide].filter(Boolean).join(' · ')
  return `${code}${name && name !== code ? ` — ${name}` : ''}${variants ? ` (${variants})` : ''} · saldo ${item.quantity ?? 0} ${item.unit || ''}`
}

function targetVariantLabel(item) {
  return [item.requestModelName, item.requestType, item.requestColor, item.requestSizeGrade, item.requestFootSide]
    .filter(Boolean).join(' · ') || 'Variantes sem restrição'
}

async function loadMappings() {
  loadingMappings.value = true
  error.value = ''
  try {
    const response = await api.get('/settings/requisition-stock-compatibilities')
    mappings.value = response.data || []
  } catch (requestError) {
    error.value = requestError.response?.data?.error || 'Não foi possível carregar os vínculos.'
  } finally {
    loadingMappings.value = false
  }
}

async function loadSourceItems() {
  const search = sourceSearch.value.trim()
  if (search.length < 2) return
  const version = ++sourceSearchVersion
  loadingItems.value = true
  error.value = ''
  try {
    const response = await api.get('/settings/requisition-stock-compatible-items', { params: { sector: form.sourceSector, search } })
    if (version !== sourceSearchVersion) return
    sourceItems.value = response.data || []
    if (!sourceItems.value.some(item => item.id === form.sourceStockItemId)) form.sourceStockItemId = null
  } catch (requestError) {
    if (version === sourceSearchVersion) error.value = requestError.response?.data?.error || 'Não foi possível pesquisar itens do setor fornecedor.'
  } finally {
    if (version === sourceSearchVersion) loadingItems.value = false
  }
}

async function createCompatibility() {
  if (!form.sourceStockItemId) return
  saving.value = true
  error.value = ''
  try {
    await api.post('/settings/requisition-stock-compatibilities', {
      requestSector: form.requestSector,
      requestSku: form.requestSku,
      requestDescription: form.requestDescription,
      requestModelName: form.requestModelName,
      requestType: form.requestType,
      requestColor: form.requestColor,
      requestSizeGrade: form.requestSizeGrade,
      requestFootSide: form.requestFootSide || null,
      requestUnit: form.requestUnit,
      sourceStockItemId: form.sourceStockItemId,
      sourceQuantityPerRequestUnit: form.sourceQuantityPerRequestUnit,
      reason: form.reason,
    })
    form.requestSku = ''
    form.requestDescription = ''
    form.requestModelName = ''
    form.requestType = ''
    form.requestColor = ''
    form.requestSizeGrade = ''
    form.requestFootSide = ''
    form.sourceStockItemId = null
    form.reason = ''
    await Promise.all([loadMappings(), loadSourceItems()])
  } catch (requestError) {
    error.value = requestError.response?.data?.error || 'Não foi possível salvar o vínculo.'
  } finally {
    saving.value = false
  }
}

async function deleteMapping(mapping) {
    if (!window.confirm(`Excluir o vínculo de ${mapping.requestSku || mapping.requestDescription} com o item fornecedor?`)) return
  deletingId.value = mapping.id
  error.value = ''
  try {
    await api.delete(`/settings/requisition-stock-compatibilities/${mapping.id}`)
    mappings.value = mappings.value.filter(item => item.id !== mapping.id)
  } catch (requestError) {
    error.value = requestError.response?.data?.error || 'Não foi possível excluir o vínculo.'
  } finally {
    deletingId.value = null
  }
}

onMounted(loadMappings)
</script>
