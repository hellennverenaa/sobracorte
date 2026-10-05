<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Layers, Plus, Save, X, Archive, RotateCcw } from 'lucide-vue-next'
import { api } from '@/services/httpClient'

const props = defineProps({
  canManage: { type: Boolean, default: false },
  isMasterAdmin: { type: Boolean, default: false },
  assignedSector: { type: String, default: '' },
  sectors: { type: Array, required: true },
  categories: { type: Array, default: () => [] },
})
const emit = defineEmits(['notify', 'dirty-change'])

const normalizeSector = value => value === 'EXPEDICAO' || value === 'CABEDAIS' ? 'DISTRIBUICAO' : value
const parentSector = computed(() => normalizeSector(props.assignedSector))
const availableSectors = computed(() => props.isMasterAdmin
  ? props.sectors
  : props.sectors.filter(sector => normalizeSector(sector.id) === parentSector.value))

const createDraft = () => ({
  sector: parentSector.value || availableSectors.value[0]?.id || '',
  name: '',
  active: true,
  categoryMode: 'ALL',
  categoryIds: [],
})
const draft = reactive(createDraft())
const snapshot = ref('')
const editingId = ref(null)
const rows = ref([])
const loading = ref(false)
const saving = ref(false)

function normalizedDraft() {
  return {
    ...draft,
    name: draft.name.trim(),
    categoryIds: [...draft.categoryIds].map(Number).sort((a, b) => a - b),
  }
}

const isDirty = computed(() => JSON.stringify(normalizedDraft()) !== snapshot.value)
watch(isDirty, value => emit('dirty-change', value), { immediate: true })
onBeforeUnmount(() => emit('dirty-change', false))

const categoriesForSector = computed(() => {
  const targetSector = normalizeSector(draft.sector)
  return props.categories.filter(category => {
    const scopes = Array.isArray(category.sectors) && category.sectors.length
      ? category.sectors
      : category.sector ? [category.sector] : []
    return !scopes.length || scopes.map(normalizeSector).includes(targetSector)
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
})

watch(() => draft.sector, () => {
  const applicableIds = new Set(categoriesForSector.value.map(category => Number(category.id)))
  draft.categoryIds = draft.categoryIds.filter(id => applicableIds.has(Number(id)))
})
watch(() => draft.categoryMode, mode => {
  if (mode === 'ALL') draft.categoryIds = []
})

function sectorLabel(sector) {
  return props.sectors.find(option => normalizeSector(option.id) === normalizeSector(sector))?.label || sector
}

function setSnapshot() {
  snapshot.value = JSON.stringify(normalizedDraft())
  emit('dirty-change', false)
}

function resetDraft() {
  Object.assign(draft, createDraft())
  editingId.value = null
  setSnapshot()
}

function editRow(row) {
  Object.assign(draft, {
    sector: row.sector,
    name: row.name,
    active: row.active,
    categoryMode: row.categoryMode || 'ALL',
    categoryIds: (row.categoryLinks || []).map(link => Number(link.categoryConfigId)),
  })
  editingId.value = row.id
  setSnapshot()
}

async function fetchRows() {
  loading.value = true
  try {
    const response = await api.get('/settings/subsectors', { params: { includeArchived: true } })
    rows.value = response.data || []
  } catch (error) {
    emit('notify', 'error', error.response?.data?.error || 'Erro ao carregar subsetores.')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!props.canManage || saving.value) return
  const name = draft.name.trim()
  if (!name) {
    emit('notify', 'error', 'Informe o nome do subsetor.')
    return
  }
  if (draft.categoryMode === 'SELECTED' && !draft.categoryIds.length) {
    emit('notify', 'error', 'Selecione ao menos uma categoria ou use todas as categorias do setor.')
    return
  }

  saving.value = true
  try {
    const payload = {
      sector: draft.sector,
      name,
      active: draft.active,
      categoryMode: draft.categoryMode,
      categoryIds: draft.categoryMode === 'SELECTED' ? draft.categoryIds.map(Number) : [],
    }
    if (editingId.value) {
      await api.put(`/settings/subsectors/${editingId.value}`, payload)
      emit('notify', 'success', `Subsetor "${name}" atualizado.`)
    } else {
      await api.post('/settings/subsectors', payload)
      emit('notify', 'success', `Subsetor "${name}" criado.`)
    }
    resetDraft()
    await fetchRows()
  } catch (error) {
    emit('notify', 'error', error.response?.data?.error || 'Erro ao salvar subsetor.')
  } finally {
    saving.value = false
  }
}

async function toggleArchive(row) {
  try {
    if (row.active) await api.patch(`/settings/subsectors/${row.id}/archive`)
    else await api.put(`/settings/subsectors/${row.id}`, { active: true })
    emit('notify', 'success', row.active ? `Subsetor "${row.name}" arquivado.` : `Subsetor "${row.name}" reativado.`)
    if (editingId.value === row.id) resetDraft()
    await fetchRows()
  } catch (error) {
    emit('notify', 'error', error.response?.data?.error || 'Erro ao atualizar o status do subsetor.')
  }
}

onMounted(() => {
  snapshot.value = JSON.stringify(normalizedDraft())
  fetchRows()
})
</script>

<template>
  <section class="space-y-5">
    <div class="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
      <div class="flex items-start gap-3">
        <div class="rounded-xl bg-white p-2 text-indigo-700 shadow-sm"><Layers class="size-5" /></div>
        <div>
          <h2 class="font-bold text-gray-900">Subsetores</h2>
          <p class="mt-1 max-w-3xl text-sm text-gray-600 text-pretty">
            Organize materiais dentro de um setor. Itens antigos sem subsetor continuam no fluxo atual e não serão reclassificados.
          </p>
        </div>
      </div>
    </div>

    <form v-if="canManage" class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4" @submit.prevent="save">
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-bold text-gray-800">{{ editingId ? 'Editar subsetor' : 'Criar subsetor' }}</h3>
        <button v-if="editingId" type="button" class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100" @click="resetDraft">
          <X class="size-4" /> Cancelar edição
        </button>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label for="subsector-parent-sector" class="mb-1 block text-xs font-bold uppercase text-gray-600">Setor principal</label>
          <select v-if="isMasterAdmin" id="subsector-parent-sector" v-model="draft.sector" required class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500">
            <option v-for="sector in availableSectors" :key="sector.id" :value="sector.id">{{ sector.label }}</option>
          </select>
          <div v-else class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700">{{ sectorLabel(draft.sector) }}</div>
        </div>
        <div>
          <label for="subsector-name" class="mb-1 block text-xs font-bold uppercase text-gray-600">Nome do subsetor</label>
          <input id="subsector-name" v-model="draft.name" maxlength="100" required placeholder="Ex.: Serigrafia" class="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm uppercase focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <fieldset class="rounded-xl border border-gray-200 p-4">
        <legend class="px-1 text-xs font-bold uppercase text-gray-600">Categorias de material aceitas</legend>
        <div class="grid gap-2 sm:grid-cols-2">
          <label class="flex cursor-pointer items-start gap-2 rounded-lg border p-3" :class="draft.categoryMode === 'ALL' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'">
            <input v-model="draft.categoryMode" type="radio" value="ALL" class="mt-0.5 text-indigo-600" />
            <span><strong class="block text-sm text-gray-800">Todas as categorias do setor</strong><span class="text-xs text-gray-500">Padrão; categorias novas também ficam disponíveis.</span></span>
          </label>
          <label class="flex cursor-pointer items-start gap-2 rounded-lg border p-3" :class="draft.categoryMode === 'SELECTED' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'">
            <input v-model="draft.categoryMode" type="radio" value="SELECTED" class="mt-0.5 text-indigo-600" />
            <span><strong class="block text-sm text-gray-800">Selecionar categorias</strong><span class="text-xs text-gray-500">Usa categorias já cadastradas, sem criar cópias.</span></span>
          </label>
        </div>
        <div v-if="draft.categoryMode === 'SELECTED'" class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label v-for="category in categoriesForSector" :key="category.id" class="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input v-model="draft.categoryIds" type="checkbox" :value="Number(category.id)" class="rounded border-gray-300 text-indigo-600" />
            {{ category.name }}
          </label>
          <p v-if="!categoriesForSector.length" class="text-xs text-amber-700 sm:col-span-2">Não há categorias cadastradas para este setor. Cadastre categorias antes de restringir a seleção.</p>
        </div>
      </fieldset>

      <label v-if="editingId" class="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
        <input v-model="draft.active" type="checkbox" class="rounded border-gray-300 text-indigo-600" /> Subsetor ativo
      </label>

      <div class="flex justify-end">
        <button type="submit" :disabled="saving" class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
          <Save v-if="editingId" class="size-4" /><Plus v-else class="size-4" />
          {{ saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar subsetor' }}
        </button>
      </div>
    </form>

    <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 class="font-bold text-gray-800">Subsetores cadastrados</h3>
        <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{{ rows.length }}</span>
      </div>
      <div v-if="loading" class="p-8 text-center text-sm text-gray-500">Carregando subsetores…</div>
      <div v-else-if="!rows.length" class="p-8 text-center text-sm text-gray-500">Nenhum subsetor cadastrado para este escopo.</div>
      <div v-else class="divide-y divide-gray-100">
        <article v-for="row in rows" :key="row.id" class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="font-bold text-gray-900">{{ row.name }}</h4>
              <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{{ sectorLabel(row.sector) }}</span>
              <span class="rounded-full px-2 py-0.5 text-[11px] font-bold" :class="row.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'">{{ row.active ? 'Ativo' : 'Arquivado' }}</span>
            </div>
            <p class="mt-1 text-xs text-gray-500">
              {{ row.categoryMode === 'SELECTED' ? `${row.categoryLinks?.length || 0} categoria(s) selecionada(s)` : 'Todas as categorias do setor' }}
              · {{ row._count?.stockItems || 0 }} item(ns) · {{ row._count?.locations || 0 }} localização(ões)
            </p>
          </div>
          <div v-if="canManage" class="flex shrink-0 gap-2">
            <button type="button" class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50" @click="editRow(row)">Editar</button>
            <button type="button" class="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold" :class="row.active ? 'border-amber-200 text-amber-800 hover:bg-amber-50' : 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'" @click="toggleArchive(row)">
              <Archive v-if="row.active" class="size-3.5" /><RotateCcw v-else class="size-3.5" />
              {{ row.active ? 'Arquivar' : 'Reativar' }}
            </button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
