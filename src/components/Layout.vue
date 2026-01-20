<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
// AQUI ESTAVA FALTANDO O ÍCONE "Users" NA LISTA DE IMPORTAÇÃO
import { 
  LayoutDashboard, 
  Home,
  Package, 
  ArrowRightLeft, 
  User, 
  LogOut, 
  Menu, 
  X,
  Users,
  Box // <--- Adicionei este aqui!
} from 'lucide-vue-next'
import { ref } from 'vue'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const isSidebarOpen = ref(false)

const menuItems = computed(() => {
  const items = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Materiais', path: '/materials', icon: Package },
    { name: 'Movimentação', path: '/movement', icon: ArrowRightLeft },
    { name: 'Meu Perfil', path: '/profile', icon: User },
  ]

  // Só adiciona o menu de Usuários se for ADMIN
  if (authStore.user?.role === 'admin') {
    items.push({ name: 'Usuários', path: '/users', icon: Users })
  }

  return items
})

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex">
    <div 
      v-if="isSidebarOpen" 
      class="fixed inset-0 bg-black/50 z-40 lg:hidden"
      @click="isSidebarOpen = false"
    ></div>

    <aside 
      :class="[
        'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out flex flex-col',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      ]"
    >
      <div class="p-6 border-b border-white/10 flex justify-between items-center">
        <div>
          <h1 class="text-xl font-bold tracking-tight">SobraCorte</h1>
          <p class="text-xs text-slate-400 mt-1">Gestão Inteligente</p>
        </div>
        <button @click="isSidebarOpen = false" class="lg:hidden text-white/70 hover:text-white">
          <X class="w-6 h-6" />
        </button>
      </div>

      <nav class="flex-1 py-6 space-y-1 px-3">
        <router-link 
          v-for="item in menuItems" 
          :key="item.path" 
          :to="item.path"
          class="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all group"
          active-class="bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
          @click="isSidebarOpen = false"
        >
          <component :is="item.icon" class="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span class="font-medium">{{ item.name }}</span>
        </router-link>
      </nav>

      <div class="p-4 border-t border-white/10">
        <button 
          @click="handleLogout" 
          class="flex items-center gap-3 px-4 py-3 w-full text-slate-300 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors"
        >
          <LogOut class="w-5 h-5" />
          <span class="font-medium">Sair do Sistema</span>
        </button>
      </div>
    </aside>

    <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header class="bg-white border-b border-gray-200 p-4 lg:hidden flex items-center justify-between sticky top-0 z-30">
        <button @click="isSidebarOpen = true" class="text-gray-600 hover:text-gray-900">
          <Menu class="w-6 h-6" />
        </button>
        <span class="font-bold text-gray-800">SobraCorte</span>
        <div class="w-6"></div> </header>

      <div class="flex-1 overflow-auto">
        <slot />
      </div>
    </main>
  </div>
</template>