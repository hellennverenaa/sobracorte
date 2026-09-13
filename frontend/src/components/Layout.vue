<script setup>
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'
import { 
  LayoutDashboard, Package, ArrowLeftRight, Users, 
  LogOut, Menu, X, FileBarChart, Settings
} from 'lucide-vue-next'
import { ref } from 'vue'
import { onMounted } from 'vue'
import { api } from '@/services/httpClient'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const isSidebarOpen = ref(false)
const availableUnits = ref([])
const switchingUnit = ref(false)

onMounted(async () => {
  if (!authStore.user?.isGlobalAdmin) return
  try {
    const response = await api.get('/factory-units')
    availableUnits.value = response.data?.data || []
  } catch {
    availableUnits.value = []
  }
})

async function switchUnit(event) {
  const unitCode = event.target.value
  if (!unitCode || unitCode === authStore.user?.unit?.code) return
  switchingUnit.value = true
  try {
    await authStore.switchUnit(unitCode)
    await router.replace('/')
    window.location.reload()
  } catch (error) {
    event.target.value = authStore.user?.unit?.code || ''
  } finally {
    switchingUnit.value = false
  }
}

async function logout() {
  await authStore.logout()
  router.push('/login')
}

const menuItems = [
  { label: 'Dashboard',    path: '/',          icon: LayoutDashboard, roles: ['admin', 'lider', 'movimentador', 'leitor'] },
  { label: 'Materiais',    path: '/materials',  icon: Package,         roles: ['admin', 'lider', 'movimentador', 'leitor'] },
  { label: 'Movimentação', path: '/movement',   icon: ArrowLeftRight,  roles: ['admin', 'lider', 'movimentador'] },
  { label: 'Relatórios',   path: '/reports',    icon: FileBarChart,    roles: ['admin', 'lider'] },
  { label: 'Usuários',     path: '/users',      icon: Users,           roles: ['admin'] },
  { label: 'Configurações', path: '/settings',  icon: Settings,        roles: ['admin'] }
]
</script>

<template>
  <div class="flex h-screen bg-gray-50 font-sans text-gray-900">
    
    <div v-if="isSidebarOpen" @click="isSidebarOpen = false" class="fixed inset-0 bg-black/50 z-20 md:hidden"></div>

    <aside 
      class="fixed md:static inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transform transition-transform duration-300 md:translate-x-0 flex flex-col shadow-2xl"
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
          v-for="item in menuItems" 
          :key="item.path" 
          :to="item.path"
          v-show="!item.roles || item.roles.includes(authStore.user?.role)"
          class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm"
          :class="route.path === item.path ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'"
          @click="isSidebarOpen = false"
        >
          <component :is="item.icon" class="w-5 h-5" />
          {{ item.label }}
        </router-link>
      </nav>

      <div class="p-4 border-t border-slate-800">
        <div class="flex items-center gap-3 mb-4 px-2">
          <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300 border-2 border-slate-600">
            {{ authStore.user?.nome?.charAt(0).toUpperCase() }}
          </div>
          <div class="overflow-hidden">
            <p class="text-sm font-bold truncate">{{ authStore.user?.nome }}</p>
            <p class="text-xs text-slate-500 truncate capitalize">{{ authStore.user?.role }}</p>
            <p class="text-xs text-indigo-300 truncate">{{ authStore.user?.unit?.code }} — {{ authStore.user?.unit?.name }}</p>
          </div>
        </div>
        <label v-if="authStore.user?.isGlobalAdmin" class="block px-2 mb-4 text-xs font-bold text-slate-400">
          Unidade operacional
          <select
            class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
            :value="authStore.user?.unit?.code"
            :disabled="switchingUnit"
            @change="switchUnit"
          >
            <option v-for="unit in availableUnits" :key="unit.code" :value="unit.code">
              {{ unit.code }} — {{ unit.name }}
            </option>
          </select>
        </label>
        <router-link to="/profile" class="block text-center text-xs text-indigo-400 hover:text-indigo-300 font-bold mb-3 hover:underline">
          Editar Perfil
        </router-link>
        <button @click="logout" class="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-red-600/20 hover:text-red-400 text-slate-400 py-2.5 rounded-lg transition-all text-sm font-bold">
          <LogOut class="w-4 h-4" /> Sair
        </button>
      </div>
    </aside>

    <main class="flex-1 flex flex-col h-screen overflow-hidden">
      <header class="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 md:hidden">
        <div class="font-black text-slate-900">Sobras DASS</div>
        <button @click="isSidebarOpen = true" class="text-gray-600"><Menu /></button>
      </header>
      <div class="flex-1 overflow-auto bg-slate-50 relative">
        <slot />
      </div>
    </main>
  </div>
</template>
