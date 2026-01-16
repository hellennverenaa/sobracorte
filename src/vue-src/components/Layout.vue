<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Home, Package, ArrowRightLeft, LogOut, UserCircle } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <!-- Header -->
    <header class="bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-lg">
      <div class="container mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="bg-blue-500 p-2 rounded-lg">
              <Package class="w-6 h-6" />
            </div>
            <div>
              <h1 class="text-2xl font-bold">SobraCorte</h1>
              <p class="text-xs text-gray-300">Pavilhão do Corte Automático</p>
            </div>
          </div>

          <div class="flex items-center space-x-4">
            <div class="text-right hidden sm:block">
              <p class="text-sm font-medium">{{ authStore.user?.nome }}</p>
              <p class="text-xs text-gray-400 capitalize">
                <span v-if="authStore.isAdmin" class="text-blue-400 font-semibold">👑 admin</span>
                <span v-else>{{ authStore.user?.role }}</span>
              </p>
            </div>
            <div class="bg-gray-700 p-2 rounded-full">
              <UserCircle class="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Navigation -->
    <nav class="bg-white border-b border-gray-200 shadow-sm">
      <div class="container mx-auto px-4">
        <div class="flex space-x-1 overflow-x-auto">
          <router-link
            to="/"
            :class="[
              'flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors',
              isActive('/')
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            <Home class="w-4 h-4" />
            <span class="font-medium whitespace-nowrap">Dashboard</span>
          </router-link>

          <router-link
            to="/materials"
            :class="[
              'flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors',
              isActive('/materials')
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            <Package class="w-4 h-4" />
            <span class="font-medium whitespace-nowrap">Materiais</span>
          </router-link>

          <router-link
            to="/movement"
            :class="[
              'flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors',
              isActive('/movement')
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            <ArrowRightLeft class="w-4 h-4" />
            <span class="font-medium whitespace-nowrap">Movimentação</span>
          </router-link>

          <router-link
            to="/profile"
            :class="[
              'flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors',
              isActive('/profile')
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            <UserCircle class="w-4 h-4" />
            <span class="font-medium whitespace-nowrap">Perfil</span>
          </router-link>

          <button
            @click="handleLogout"
            class="flex items-center space-x-2 px-4 py-3 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors ml-auto"
          >
            <LogOut class="w-4 h-4" />
            <span class="font-medium whitespace-nowrap">Sair</span>
          </button>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-6 flex-1">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="bg-white border-t border-gray-200 mt-auto py-4">
      <div class="container mx-auto px-4 text-center text-sm text-gray-600">
        © 2025 SobraCorte - Sistema de Gerenciamento de Sobras
      </div>
    </footer>
  </div>
</template>
