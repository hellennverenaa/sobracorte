<template>
  <Layout>
    <div class="max-w-5xl mx-auto px-4 py-8">

      <!-- Cabeçalho -->
      <div class="flex items-center gap-3 mb-8">
        <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <SettingsIcon class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Configurações</h1>
          <p class="text-sm text-gray-500">Gerencie os valores de domínio do sistema</p>
        </div>
      </div>

      <!-- Notificação Toast -->
      <transition name="fade-down">
        <div v-if="notification.show"
          class="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl font-bold text-sm flex items-center gap-2 transition-all"
          :class="notification.type === 'success'
            ? 'bg-emerald-500 text-white'
            : 'bg-red-500 text-white'">
          <CheckCircle v-if="notification.type === 'success'" class="w-4 h-4" />
          <XCircle v-else class="w-4 h-4" />
          {{ notification.message }}
        </div>
      </transition>

      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit flex-wrap">
        <button v-for="tab in tabs" :key="tab.key"
          @click="activeTab = tab.key"
          class="px-5 py-2 rounded-lg text-sm font-bold transition-all"
          :class="activeTab === tab.key
            ? 'bg-white text-indigo-700 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'">
          <component :is="tab.icon" class="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {{ tab.label }}
        </button>
      </div>

      <!-- ========================================= -->
      <!-- ABA 1: CATEGORIAS                         -->
      <!-- ========================================= -->
      <div v-if="activeTab === 'categories'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <Tag class="w-4 h-4 text-indigo-500" /> Categorias de Materiais
            </h2>
            <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">governa Material.type</span>
          </div>
          
          <!-- Formulário de adição -->
          <div class="px-6 py-4 border-b border-gray-100 bg-indigo-50/30">
            <form @submit.prevent="addCategory" class="flex gap-4 items-end flex-wrap">
              <div class="flex-1 min-w-[200px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Categoria</label>
                <input v-model="newCategory.name" required placeholder="Ex: TECIDO, COURO, TINTAS..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 uppercase bg-white"
                  style="text-transform: uppercase" />
              </div>
              
              <div class="w-64 min-w-[180px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Unidade Padrão</label>
                <select v-model="newCategory.defaultUnitId"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white font-medium">
                  <option value="">Nenhuma (Livre para escolha)</option>
                  <option v-for="unit in units" :key="unit.id" :value="unit.id">
                    {{ unit.name }} ({{ unit.symbol }})
                  </option>
                </select>
              </div>

              <div class="flex items-center gap-2 pb-2">
                <input type="checkbox" id="unitLockedCheck" v-model="newCategory.unitLocked"
                  class="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer" />
                <label for="unitLockedCheck" class="text-xs font-bold text-gray-700 cursor-pointer flex items-center gap-1">
                  <Lock class="w-3.5 h-3.5 text-amber-600" />
                  Bloquear Unidade
                </label>
              </div>

              <button type="submit" :disabled="loadingCategory"
                class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50 ml-auto">
                <Plus class="w-4 h-4" />
                Adicionar
              </button>
            </form>
          </div>

          <!-- Lista -->
          <div v-if="loadingCategory" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome</th>
                <th class="px-6 py-3 text-center">Unidade Padrão</th>
                <th class="px-6 py-3 text-center">Regra de Trava</th>
                <th class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="cat in categories" :key="cat.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 font-bold text-gray-800 font-mono text-sm">{{ cat.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span v-if="cat.defaultUnit" class="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-indigo-50 text-indigo-700 border-indigo-100">
                    {{ cat.defaultUnit.name }} ({{ cat.defaultUnit.symbol }})
                  </span>
                  <span v-else class="text-xs text-gray-400 italic">Livre</span>
                </td>
                <td class="px-6 py-3 text-center">
                  <span v-if="cat.unitLocked" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <Lock class="w-3 h-3" /> Bloqueada
                  </span>
                  <span v-else class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                    Livre
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <button @click="deleteCategory(cat)"
                    class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="categories.length === 0">
                <td colspan="4" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma categoria cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========================================= -->
      <!-- ABA 2: UNIDADES DE MEDIDA                 -->
      <!-- ========================================= -->
      <div v-if="activeTab === 'units'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <Ruler class="w-4 h-4 text-purple-500" /> Unidades de Medida
            </h2>
            <span class="text-xs text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full font-bold">100% Dinâmico via API</span>
          </div>

          <!-- Formulário de adição de Unidade -->
          <div class="px-6 py-4 border-b border-gray-100 bg-purple-50/30">
            <form @submit.prevent="addUnit" class="flex gap-3 items-end flex-wrap">
              <div class="flex-1 min-w-[200px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Unidade</label>
                <input v-model="newUnit.name" required placeholder="Ex: Metro Quadrado, Litro, Caixa..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
              </div>
              <div class="w-48 min-w-[140px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Sigla / Símbolo</label>
                <input v-model="newUnit.symbol" required placeholder="Ex: m², l, cx, un..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-400 bg-white font-mono" />
              </div>
              <button type="submit" :disabled="loadingUnit"
                class="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold text-sm hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50">
                <Plus class="w-4 h-4" /> Adicionar Unidade
              </button>
            </form>
          </div>

          <!-- Lista de Unidades -->
          <div v-if="loadingUnit" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome da Unidade</th>
                <th class="px-6 py-3 text-center">Sigla / Símbolo</th>
                <th class="px-6 py-3 text-center">Status</th>
                <th class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="unit in units" :key="unit.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-800 font-medium">{{ unit.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-purple-50 text-purple-700 border border-purple-100">
                    {{ unit.symbol }}
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Ativa
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <button @click="deleteUnit(unit)"
                    class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50" title="Desativar unidade">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="units.length === 0">
                <td colspan="4" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma unidade de medida cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========================================= -->
      <!-- ABA 3: LOCALIZAÇÕES                       -->
      <!-- ========================================= -->
      <div v-if="activeTab === 'locations'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <MapPin class="w-4 h-4 text-emerald-500" /> Localizações de Armazenamento
            </h2>
            <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">vinculadas à Categoria</span>
          </div>
          <div class="px-6 py-4 border-b border-gray-100 bg-emerald-50/30">
            <form @submit.prevent="addLocation" class="flex gap-3 items-end flex-wrap">
              <div class="flex-1 min-w-[200px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Localização</label>
                <input v-model="newLocation.name" required placeholder="Ex: Rua 03 - Caixote 58 - Nível 01"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
              </div>
              <div class="w-64 min-w-[180px]">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Categoria Vinculada</label>
                <select v-model="newLocation.categoryId" required
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium">
                  <option value="" disabled selected>Selecione a Categoria...</option>
                  <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                    {{ cat.name }}
                  </option>
                </select>
              </div>
              <button type="submit" :disabled="loadingLocation"
                class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50">
                <Plus class="w-4 h-4" /> Adicionar
              </button>
            </form>
          </div>
          <div v-if="loadingLocation" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Nome da Localização</th>
                <th class="px-6 py-3 text-center">Categoria Vinculada</th>
                <th class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="loc in locations" :key="loc.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-700 font-medium">{{ loc.name }}</td>
                <td class="px-6 py-3 text-center">
                  <span class="px-2.5 py-1 rounded-full text-xs font-bold border"
                    :class="loc.category ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-gray-100 text-gray-400 border-gray-200'">
                    {{ loc.category ? loc.category.name : 'Não vinculada' }}
                  </span>
                </td>
                <td class="px-6 py-3 text-center">
                  <button @click="deleteLocation(loc)"
                    class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="locations.length === 0">
                <td colspan="3" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma localização cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========================================= -->
      <!-- ABA 4: ORIGENS                            -->
      <!-- ========================================= -->
      <div v-if="activeTab === 'origins'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <GitBranch class="w-4 h-4 text-amber-500" /> Origens de Sobra
            </h2>
            <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">governa Movement.origem</span>
          </div>
          <div class="px-6 py-4 border-b border-gray-100 bg-amber-50/30">
            <form @submit.prevent="addOrigin" class="flex gap-3 items-end">
              <div class="flex-1">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Origem</label>
                <input v-model="newOrigin" required placeholder="Ex: Devolução de Produção"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
              </div>
              <button type="submit" :disabled="loadingOrigin"
                class="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition flex items-center gap-2 disabled:opacity-50">
                <Plus class="w-4 h-4" /> Adicionar
              </button>
            </form>
          </div>
          <div v-if="loadingOrigin" class="p-8 text-center text-gray-400">Carregando...</div>
          <table v-else class="w-full text-left">
            <thead class="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-6 py-3">Descrição da Origem</th>
                <th class="px-6 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="orig in origins" :key="orig.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3 text-sm text-gray-700 font-medium">{{ orig.name }}</td>
                <td class="px-6 py-3 text-center">
                  <button @click="deleteOrigin(orig)"
                    class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="origins.length === 0">
                <td colspan="2" class="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhuma origem cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========================================= -->
      <!-- ABA 5: IMPORTAR CSV                       -->
      <!-- ========================================= -->
      <div v-if="activeTab === 'import'" class="space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 class="font-bold text-gray-800 flex items-center gap-2">
              <FileSpreadsheet class="w-4 h-4 text-blue-500" /> Importar Materiais Dublados (CSV)
            </h2>
            <p class="text-sm text-gray-500 mt-1">
              Compatível com <strong>Materiais_Dublados - FILA.csv</strong> e <strong>Materiais_Dublados - NIKE.csv</strong>.
              Apenas o código e a descrição são extraídos. Materiais duplicados são ignorados automaticamente.
            </p>
          </div>

          <div class="p-6 space-y-5">
            <!-- Upload area -->
            <div class="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer relative"
              @dragover.prevent @drop.prevent="handleDrop">
              <FileSpreadsheet class="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p class="text-gray-500 font-medium mb-2">Arraste o arquivo CSV aqui ou</p>
              <label class="cursor-pointer bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition inline-flex items-center gap-2">
                <Upload class="w-4 h-4" /> Selecionar arquivo
                <input type="file" accept=".csv" class="hidden" @change="handleFileSelect" :disabled="importing" />
              </label>
              <p class="text-xs text-gray-400 mt-3">Apenas arquivos .csv</p>
            </div>

            <!-- Preview do arquivo selecionado -->
            <div v-if="selectedFile" class="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <FileSpreadsheet class="w-8 h-8 text-blue-500" />
                <div>
                  <p class="font-bold text-blue-800 text-sm">{{ selectedFile.name }}</p>
                  <p class="text-xs text-blue-500">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
                </div>
              </div>
              <button @click="selectedFile = null; importResult = null" class="text-blue-300 hover:text-red-400 transition">
                <XCircle class="w-5 h-5" />
              </button>
            </div>

            <!-- Botão de importar -->
            <button v-if="selectedFile" @click="importCSV" :disabled="importing"
              class="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-200">
              <span v-if="importing" class="animate-spin">⏳</span>
              <Upload v-else class="w-4 h-4" />
              {{ importing ? 'Importando...' : 'Confirmar Importação' }}
            </button>

            <!-- Resultado da importação -->
            <div v-if="importResult" class="rounded-xl p-4 border font-medium text-sm"
              :class="importResult.error
                ? 'bg-red-50 border-red-100 text-red-700'
                : 'bg-emerald-50 border-emerald-100 text-emerald-700'">
              <div class="flex items-start gap-2">
                <CheckCircle v-if="!importResult.error" class="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <XCircle v-else class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p class="font-bold">{{ importResult.error || importResult.message }}</p>
                  <p v-if="!importResult.error" class="text-xs mt-1 opacity-80">
                    {{ importResult.inseridos }} inseridos · {{ importResult.ignorados }} já existiam (ignorados) · {{ importResult.processados }} processados no total
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </Layout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { api } from '@/services/httpClient'
import {
  Settings as SettingsIcon, Tag, MapPin, GitBranch, FileSpreadsheet, Ruler, Lock,
  Plus, Trash2, Upload, CheckCircle, XCircle
} from 'lucide-vue-next'

// --- TABS ---
const tabs = [
  { key: 'categories', label: 'Categorias',        icon: Tag },
  { key: 'units',      label: 'Unidades de Medida', icon: Ruler },
  { key: 'locations',  label: 'Localizações',      icon: MapPin },
  { key: 'origins',    label: 'Origens',           icon: GitBranch },
  { key: 'import',     label: 'Importar CSV',      icon: FileSpreadsheet },
]
const activeTab = ref('categories')

// --- NOTIFICAÇÕES ---
const notification = ref({ show: false, type: 'success', message: '' })
function showNotification(type, message) {
  notification.value = { show: true, type, message }
  setTimeout(() => { notification.value.show = false }, 3500)
}

// ============================================================
// CATEGORIAS
// ============================================================
const categories = ref([])
const loadingCategory = ref(false)
const newCategory = ref({ name: '', defaultUnitId: '', unitLocked: false })

async function fetchCategories() {
  loadingCategory.value = true
  try {
    const res = await api.get('/settings/categories')
    categories.value = res.data
  } catch (e) {
    showNotification('error', 'Erro ao carregar categorias.')
  } finally {
    loadingCategory.value = false
  }
}

async function addCategory() {
  if (!newCategory.value.name.trim()) return
  try {
    await api.post('/settings/categories', {
      name: newCategory.value.name.trim(),
      defaultUnitId: newCategory.value.defaultUnitId ? Number(newCategory.value.defaultUnitId) : null,
      unitLocked: Boolean(newCategory.value.unitLocked)
    })
    showNotification('success', `Categoria "${newCategory.value.name}" criada com sucesso!`)
    newCategory.value = { name: '', defaultUnitId: '', unitLocked: false }
    await fetchCategories()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar categoria.'
    showNotification('error', msg)
  }
}

async function deleteCategory(cat) {
  if (!confirm(`Excluir a categoria "${cat.name}"?`)) return
  try {
    await api.delete(`/settings/categories/${cat.id}`)
    showNotification('success', `Categoria "${cat.name}" excluída.`)
    await fetchCategories()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao excluir categoria.'
    showNotification('error', msg)
  }
}

// ============================================================
// UNIDADES DE MEDIDA (100% DINÂMICO VIA API)
// ============================================================
const units = ref([])
const loadingUnit = ref(false)
const newUnit = ref({ name: '', symbol: '' })

async function fetchUnits() {
  loadingUnit.value = true
  try {
    const res = await api.get('/settings/units')
    units.value = res.data
  } catch (e) {
    showNotification('error', 'Erro ao carregar unidades de medida.')
  } finally {
    loadingUnit.value = false
  }
}

async function addUnit() {
  if (!newUnit.value.name.trim() || !newUnit.value.symbol.trim()) return
  try {
    await api.post('/settings/units', {
      name: newUnit.value.name.trim(),
      symbol: newUnit.value.symbol.trim()
    })
    showNotification('success', `Unidade "${newUnit.value.name} (${newUnit.value.symbol})" cadastrada!`)
    newUnit.value = { name: '', symbol: '' }
    await fetchUnits()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar unidade de medida.'
    showNotification('error', msg)
  }
}

async function deleteUnit(unit) {
  if (!confirm(`Desativar a unidade de medida "${unit.name} (${unit.symbol})"?`)) return
  try {
    await api.delete(`/settings/units/${unit.id}`)
    showNotification('success', `Unidade de medida desativada.`)
    await fetchUnits()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao desativar unidade.'
    showNotification('error', msg)
  }
}

// ============================================================
// LOCALIZAÇÕES
// ============================================================
const locations = ref([])
const loadingLocation = ref(false)
const newLocation = ref({ name: '', categoryId: '' })

async function fetchLocations() {
  loadingLocation.value = true
  try {
    const res = await api.get('/settings/locations')
    locations.value = res.data
  } catch (e) {
    showNotification('error', 'Erro ao carregar localizações.')
  } finally {
    loadingLocation.value = false
  }
}

async function addLocation() {
  if (!newLocation.value.name.trim()) return
  if (!newLocation.value.categoryId) {
    return showNotification('error', 'Selecione a Categoria Vinculada.')
  }
  try {
    await api.post('/settings/locations', {
      name: newLocation.value.name.trim(),
      categoryId: Number(newLocation.value.categoryId)
    })
    showNotification('success', `Localização "${newLocation.value.name}" criada com sucesso!`)
    newLocation.value = { name: '', categoryId: '' }
    await fetchLocations()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar localização.'
    showNotification('error', msg)
  }
}

async function deleteLocation(loc) {
  if (!confirm(`Excluir a localização "${loc.name}"?`)) return
  try {
    await api.delete(`/settings/locations/${loc.id}`)
    showNotification('success', `Localização excluída.`)
    await fetchLocations()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao excluir localização.'
    showNotification('error', msg)
  }
}

// ============================================================
// ORIGENS
// ============================================================
const origins = ref([])
const loadingOrigin = ref(false)
const newOrigin = ref('')

async function fetchOrigins() {
  loadingOrigin.value = true
  try {
    const res = await api.get('/settings/origins')
    origins.value = res.data
  } catch (e) {
    showNotification('error', 'Erro ao carregar origens.')
  } finally {
    loadingOrigin.value = false
  }
}

async function addOrigin() {
  if (!newOrigin.value.trim()) return
  try {
    await api.post('/settings/origins', { name: newOrigin.value.trim() })
    showNotification('success', `Origem "${newOrigin.value}" criada!`)
    newOrigin.value = ''
    await fetchOrigins()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao criar origem.'
    showNotification('error', msg)
  }
}

async function deleteOrigin(orig) {
  if (!confirm(`Excluir a origem "${orig.name}"?`)) return
  try {
    await api.delete(`/settings/origins/${orig.id}`)
    showNotification('success', `Origem excluída.`)
    await fetchOrigins()
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao excluir origem.'
    showNotification('error', msg)
  }
}

// ============================================================
// IMPORTAÇÃO CSV
// ============================================================
const selectedFile = ref(null)
const importing = ref(false)
const importResult = ref(null)

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
    importResult.value = null
  }
  event.target.value = null // reset input
}

function handleDrop(event) {
  const file = event.dataTransfer.files[0]
  if (file && file.name.endsWith('.csv')) {
    selectedFile.value = file
    importResult.value = null
  } else {
    showNotification('error', 'Apenas arquivos .csv são aceitos.')
  }
}

async function importCSV() {
  if (!selectedFile.value) return
  importing.value = true
  importResult.value = null

  try {
    const formData = new FormData()
    formData.append('arquivo', selectedFile.value)

    const res = await api.post('/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    importResult.value = res.data
    showNotification('success', `${res.data.inseridos} materiais importados com sucesso!`)
    selectedFile.value = null
  } catch (e) {
    const msg = e.response?.data?.error || 'Erro ao importar o arquivo.'
    importResult.value = { error: msg }
    showNotification('error', msg)
  } finally {
    importing.value = false
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
onMounted(async () => {
  await Promise.all([fetchCategories(), fetchUnits(), fetchLocations(), fetchOrigins()])
})
</script>

<style scoped>
.fade-down-enter-active {
  animation: fadeDown 0.3s ease-out;
}
.fade-down-leave-active {
  animation: fadeDown 0.3s ease-in reverse;
}
@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
