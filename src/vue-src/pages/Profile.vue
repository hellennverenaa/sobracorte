<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import {
  User,
  Shield,
  Users,
  AlertCircle,
  CheckCircle,
  Crown,
  UserCog
} from 'lucide-vue-next'

interface UserData {
  id: string
  nome: string
  email: string
  role: 'admin' | 'operador'
  created_at?: string
}

const authStore = useAuthStore()
const { fetchUsers, updateUserRole } = useApi()

const allUsers = ref<UserData[]>([])
const loading = ref(true)
const updatingUserId = ref<string | null>(null)
const successMessage = ref('')
const errorMessage = ref('')

const isAdmin = computed(() => authStore.user?.role === 'admin')

async function loadAllUsers() {
  try {
    loading.value = true
    const data = await fetchUsers()
    allUsers.value = data.users || []
  } catch (error: any) {
    errorMessage.value = error.message || 'Erro ao carregar usuários'
  } finally {
    loading.value = false
  }
}

async function handleUpdateRole(userId: string, newRole: 'admin' | 'operador') {
  if (!confirm(`Tem certeza que deseja alterar este usuário para ${newRole}?`)) {
    return
  }

  try {
    updatingUserId.value = userId
    successMessage.value = ''
    errorMessage.value = ''

    await updateUserRole(userId, newRole)
    
    successMessage.value = 'Permissão atualizada com sucesso!'
    await loadAllUsers()

    // Clear success message after 5 seconds
    setTimeout(() => {
      successMessage.value = ''
    }, 5000)
  } catch (error: any) {
    errorMessage.value = error.message || 'Erro ao atualizar permissão'
  } finally {
    updatingUserId.value = null
  }
}

function formatDate(dateString?: string) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

onMounted(() => {
  if (isAdmin.value) {
    loadAllUsers()
  } else {
    loading.value = false
  }
})
</script>

<template>
  <Layout>
    <div class="max-w-6xl mx-auto space-y-6">
      <!-- Page Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Perfil do Usuário</h1>
          <p class="text-gray-600 mt-1">Gerencie seu perfil e permissões de usuários</p>
        </div>
      </div>

      <!-- Success/Error Messages -->
      <div v-if="successMessage" class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start">
        <CheckCircle class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
        <span class="text-sm">{{ successMessage }}</span>
      </div>

      <div v-if="errorMessage" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
        <AlertCircle class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
        <span class="text-sm">{{ errorMessage }}</span>
      </div>

      <!-- Current User Profile Card -->
      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="bg-gradient-to-r from-blue-600 to-blue-500 p-6">
          <div class="flex items-center space-x-4">
            <div class="bg-white/20 backdrop-blur-sm p-4 rounded-full">
              <User class="w-12 h-12 text-white" />
            </div>
            <div class="text-white">
              <h2 class="text-2xl font-bold">{{ authStore.user?.nome }}</h2>
              <p class="text-blue-100">{{ authStore.user?.email }}</p>
            </div>
          </div>
        </div>

        <div class="p-6 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="flex items-start space-x-3">
              <Shield class="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p class="text-sm text-gray-600 font-medium">Nível de Acesso</p>
                <div class="flex items-center space-x-2 mt-1">
                  <template v-if="authStore.isAdmin">
                    <Crown class="w-4 h-4 text-yellow-500" />
                    <span class="text-lg font-semibold text-yellow-600 capitalize">
                      Administrador
                    </span>
                  </template>
                  <template v-else>
                    <User class="w-4 h-4 text-gray-500" />
                    <span class="text-lg font-semibold text-gray-700 capitalize">
                      Operador
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <div class="flex items-start space-x-3">
              <UserCog class="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p class="text-sm text-gray-600 font-medium">ID do Usuário</p>
                <p class="text-sm text-gray-900 mt-1 font-mono">{{ authStore.user?.id }}</p>
              </div>
            </div>
          </div>

          <!-- Admin Permissions Info -->
          <div v-if="authStore.isAdmin" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div class="flex items-start space-x-3">
              <Crown class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div class="text-sm">
                <p class="font-semibold text-yellow-900">Permissões de Administrador</p>
                <p class="text-yellow-700 mt-1">
                  Como administrador, você pode gerenciar todos os materiais, movimentações e usuários do sistema.
                </p>
              </div>
            </div>
          </div>

          <!-- Operator Info -->
          <div v-else class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex items-start space-x-3">
              <User class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div class="text-sm">
                <p class="font-semibold text-blue-900">Permissões de Operador</p>
                <p class="text-blue-700 mt-1">
                  Como operador, você pode visualizar materiais, registrar movimentações, mas não pode gerenciar usuários.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- User Management (Admin Only) -->
      <div v-if="isAdmin" class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="border-b border-gray-200 p-6">
          <div class="flex items-center space-x-3">
            <Users class="w-6 h-6 text-blue-600" />
            <div>
              <h3 class="text-xl font-bold text-gray-900">Gerenciamento de Usuários</h3>
              <p class="text-sm text-gray-600">Gerencie permissões e roles dos usuários do sistema</p>
            </div>
          </div>
        </div>

        <div v-if="loading" class="p-8 text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p class="text-gray-600 mt-4">Carregando usuários...</p>
        </div>

        <div v-else-if="allUsers.length === 0" class="p-8 text-center text-gray-500">
          <Users class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhum usuário encontrado</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Usuário
                </th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Email
                </th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Role Atual
                </th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Cadastrado em
                </th>
                <th class="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr
                v-for="userData in allUsers"
                :key="userData.id"
                class="hover:bg-gray-50 transition-colors"
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <User class="w-5 h-5 text-blue-600" />
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">
                        {{ userData.nome }}
                        <Crown v-if="userData.id === authStore.user?.id" class="inline w-4 h-4 text-yellow-500 ml-1" />
                      </div>
                      <div v-if="userData.id === authStore.user?.id" class="text-xs text-gray-500">
                        (Você)
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {{ userData.email }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    :class="[
                      'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full',
                      userData.role === 'admin'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    ]"
                  >
                    <Crown v-if="userData.role === 'admin'" class="w-3 h-3 mr-1" />
                    <User v-else class="w-3 h-3 mr-1" />
                    {{ userData.role === 'admin' ? 'Administrador' : 'Operador' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {{ formatDate(userData.created_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div v-if="userData.id === authStore.user?.id" class="text-gray-400 text-xs">
                    Não é possível alterar seu próprio role
                  </div>
                  <div v-else class="flex justify-end space-x-2">
                    <button
                      v-if="userData.role !== 'admin'"
                      @click="handleUpdateRole(userData.id, 'admin')"
                      :disabled="updatingUserId === userData.id"
                      class="px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {{ updatingUserId === userData.id ? 'Atualizando...' : 'Promover para Admin' }}
                    </button>
                    <button
                      v-if="userData.role !== 'operador'"
                      @click="handleUpdateRole(userData.id, 'operador')"
                      :disabled="updatingUserId === userData.id"
                      class="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {{ updatingUserId === userData.id ? 'Atualizando...' : 'Rebaixar para Operador' }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Layout>
</template>
