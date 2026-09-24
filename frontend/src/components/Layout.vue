<script setup>
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'
import { 
  LayoutDashboard, Package, ArrowLeftRight, Users, 
  LogOut, Menu, X, FileBarChart, Settings, Layers, Footprints, History,
  ClipboardList, Bell, Building2
} from 'lucide-vue-next'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '@/services/httpClient'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { confirmPendingChanges, unsavedChangesDialog, resolveUnsavedChanges, registerUnsavedChangesHost } from '@/composables/useUnsavedChanges'
import { ROLE_LABELS } from '@/utils/domain'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const isSidebarOpen = ref(false)
const pendingCount = ref(0)
const isSwitchingUnit = ref(false)
const unitSwitchError = ref('')
const unitSwitchStatus = computed({
  get: () => authStore.unitSwitchStatus,
  set: (value) => { authStore.unitSwitchStatus = value },
})
let notificationInterval = null
let releaseUnsavedChangesHost = null

async function refreshProfileOnFocus() {
  const refreshed = await authStore.refreshProfile()
  if (!refreshed && !authStore.isAuthenticated) router.replace('/login')
}

async function logout() {
  if (!(await confirmPendingChanges())) return
  if (notificationInterval) {
    clearInterval(notificationInterval)
    notificationInterval = null
  }
  try {
    await authStore.logout()
  } catch (_) {}
  window.location.href = '/sobra_corte/login'
}

const isRequisitionsEnabled = computed(() => {
  return authStore.user?.unit?.enableRequisitions !== false
})

async function fetchPendingCount() {
  if (!isRequisitionsEnabled.value) {
    pendingCount.value = 0
    return
  }
  try {
    if (!authStore.isAuthenticated || !authStore.user) {
      if (notificationInterval) {
        clearInterval(notificationInterval)
        notificationInterval = null
      }
      return
    }
    const res = await api.get('/requisitions/pending-count')
    pendingCount.value = res.data?.pendingCount || 0
  } catch (error) {
    // Silencioso para não poluir console
  }
}

onMounted(() => {
  releaseUnsavedChangesHost = registerUnsavedChangesHost()
  window.addEventListener('focus', refreshProfileOnFocus)
  if (authStore.user?.isGlobalAdmin) {
    authStore.fetchAvailableUnits()
  }
  fetchPendingCount()
  notificationInterval = setInterval(fetchPendingCount, 45000)
})

onUnmounted(() => {
  releaseUnsavedChangesHost?.()
  releaseUnsavedChangesHost = null
  window.removeEventListener('focus', refreshProfileOnFocus)
  if (notificationInterval) {
    clearInterval(notificationInterval)
    notificationInterval = null
  }
})

const menuItems = [
  { label: 'Dashboard',             path: '/',                icon: LayoutDashboard, roles: ['admin', 'admin_setor', 'lider', 'movimentador', 'leitor'] },
  { label: 'Estoque Multi-Setor',   path: '/inventory',       icon: Layers,          roles: ['admin', 'admin_setor', 'lider', 'movimentador', 'leitor'] },
  { label: 'Casamento de Pares',    path: '/mounting-pairs',  icon: Footprints,      roles: ['admin', 'admin_setor', 'lider', 'movimentador', 'leitor'] },
  { label: 'Requisições',           path: '/requisitions',    icon: ClipboardList,   roles: ['admin', 'admin_setor', 'lider', 'movimentador', 'leitor'], badgeKey: 'requisitions' },
  { label: 'Histórico',             path: '/stock-history',   icon: History,         roles: ['admin', 'admin_setor', 'lider', 'movimentador', 'leitor'] },
  { label: 'Relatórios',            path: '/reports',         icon: FileBarChart,    roles: ['admin', 'admin_setor', 'lider'] },
  { label: 'Usuários',              path: '/users',           icon: Users,           roles: ['admin'] },
  { label: 'Configurações',         path: '/settings',        icon: Settings,        roles: ['admin', 'admin_setor'] }
]

const visibleMenuItems = computed(() => {
  const role = authStore.user?.role
  return menuItems.filter(item => {
    if (item.roles && !item.roles.includes(role)) return false
    if (item.path === '/requisitions' && !isRequisitionsEnabled.value) return false
    return true
  })
})

async function handleUnitChange(event) {
  const targetCode = event.target.value
  if (!targetCode || targetCode === authStore.user?.unit?.code) return
  if (!(await confirmPendingChanges())) {
    event.target.value = authStore.user?.unit?.code || ''
    return
  }

  unitSwitchError.value = ''
  isSwitchingUnit.value = true
  unitSwitchStatus.value = 'Trocando unidade…'
  try {
    await authStore.switchUnit(targetCode)
    unitSwitchStatus.value = `Unidade ativa: ${authStore.user?.unit?.code}`
  } catch (error) {
    unitSwitchError.value = error.response?.data?.error || error.message || 'Não foi possível trocar de unidade.'
    unitSwitchStatus.value = ''
    event.target.value = authStore.user?.unit?.code || ''
  } finally {
    isSwitchingUnit.value = false
  }
}
</script>

<template>
  <div class="flex h-screen bg-gray-50 font-sans text-gray-900">
    
    <div v-if="isSidebarOpen" @click="isSidebarOpen = false" class="fixed inset-0 bg-black/50 z-20 md:hidden"></div>

    <aside 
      class="fixed md:static inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transform transition-transform duration-300 md:translate-x-0 flex flex-col shadow-2xl print:hidden"
      :class="isSidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="p-6 flex items-center justify-between border-b border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black shadow-lg shadow-indigo-500/50">D</div>
          <span class="text-xl font-black tracking-tight">Sobras DASS</span>
        </div>
        <button @click="isSidebarOpen = false" class="md:hidden text-slate-400"><X /></button>
      </div>

      <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
        <router-link 
          v-for="item in visibleMenuItems" 
          :key="item.path" 
          :to="item.path"
          class="flex items-center justify-between px-4 py-3 rounded-xl transition-all font-medium text-sm"
          :class="route.path === item.path ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'"
          @click="isSidebarOpen = false"
        >
          <div class="flex items-center gap-3">
            <component :is="item.icon" class="w-5 h-5" />
            <span>{{ item.label }}</span>
          </div>

          <span
            v-if="item.badgeKey === 'requisitions' && pendingCount > 0"
            class="px-2 py-0.5 text-[11px] font-black rounded-full bg-amber-500 text-white shadow-sm"
          >
            {{ pendingCount }}
          </span>
        </router-link>
      </nav>

      <div class="p-4 border-t border-slate-800">
        <div class="flex items-center gap-3 mb-4 px-2">
          <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300 border-2 border-slate-600">
            {{ authStore.user?.nome?.charAt(0).toUpperCase() }}
          </div>
          <div class="overflow-hidden">
            <p class="text-sm font-bold truncate">{{ authStore.user?.nome }}</p>
            <p class="text-xs text-slate-500 truncate">{{ ROLE_LABELS[authStore.user?.role] || 'Leitor' }}</p>
            <p v-if="authStore.user?.authOrigin === 'EXTERNO'" class="text-xs text-slate-400 truncate" :title="`Função: ${authStore.user?.funcao} | Setor: ${authStore.user?.setor}`">
              Função: {{ authStore.user?.funcao }} · Setor: {{ authStore.user?.setor }}
            </p>
            <p class="text-xs text-indigo-300 truncate">{{ authStore.user?.unit?.code }} — {{ authStore.user?.unit?.name }}</p>
          </div>
        </div>


        <button 
          @click="logout" 
          class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-rose-950/40 hover:text-rose-400 transition-all text-xs font-bold"
        >
          <LogOut class="w-4 h-4" /> Sair
        </button>
      </div>
    </aside>

    <main class="flex-1 flex flex-col h-screen overflow-hidden print:h-auto print:overflow-visible">
      <header class="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 print:hidden">
        <div class="flex items-center gap-4">
          <button @click="isSidebarOpen = true" class="text-gray-600 md:hidden"><Menu /></button>
          <span class="font-black text-slate-900 hidden sm:inline">Sobras DASS</span>
        </div>

        <div class="flex items-center gap-4">
          <div v-if="authStore.user?.isGlobalAdmin" class="flex flex-col items-end">
            <label for="global-unit-selector" class="sr-only">Unidade ativa</label>
            <div class="flex items-center gap-2">
              <Building2 class="w-4 h-4 text-indigo-600 hidden sm:block" />
              <select
                id="global-unit-selector"
                :value="authStore.user?.unit?.code"
                :disabled="isSwitchingUnit"
                class="max-w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-wait disabled:opacity-60"
                title="Trocar unidade fabril"
                @change="handleUnitChange"
              >
                <option v-for="unit in authStore.availableUnits" :key="unit.code" :value="unit.code">
                  {{ unit.code }} — {{ unit.name }}
                </option>
              </select>
            </div>
            <span v-if="unitSwitchStatus" role="status" aria-live="polite" class="mt-1 text-[10px] text-indigo-700">{{ unitSwitchStatus }}</span>
            <div v-if="authStore.unitLoadError" role="alert" class="mt-1 max-w-64 text-right text-[10px] text-red-600">
              {{ authStore.unitLoadError }}
              <button type="button" class="ml-1 underline" @click="authStore.fetchAvailableUnits({ force: true })">Tentar novamente</button>
            </div>
            <span v-if="unitSwitchError" role="alert" class="mt-1 max-w-64 text-right text-[10px] font-semibold text-red-600">
              {{ unitSwitchError }}
            </span>
          </div>

          <!-- Central de Notificações / Requisições -->
          <router-link
            v-if="isRequisitionsEnabled"
            to="/requisitions?status=PENDENTE"
            class="relative p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-all"
            title="Requisições Pendentes"
          >
            <Bell class="w-5 h-5" />
            <span
              v-if="pendingCount > 0"
              class="absolute top-1 right-1 w-4 h-4 bg-amber-500 text-white rounded-full text-[10px] font-black flex items-center justify-center animate-pulse"
            >
              {{ pendingCount }}
            </span>
          </router-link>
        </div>
      </header>
      <div class="flex-1 overflow-auto bg-slate-50 relative print:bg-white print:overflow-visible print:p-0">
        <slot />
      </div>
    </main>

    <ConfirmModal
      :show="unsavedChangesDialog.show"
      :title="unsavedChangesDialog.title"
      :message="unsavedChangesDialog.message"
      confirm-text="Descartar alterações"
      cancel-text="Continuar editando"
      variant="warning"
      @confirm="resolveUnsavedChanges(true)"
      @cancel="resolveUnsavedChanges(false)"
    />
  </div>
</template>
