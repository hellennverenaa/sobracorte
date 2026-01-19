<script setup>
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { Users, Shield, Save } from 'lucide-vue-next'

const { request } = useApi() // Usando o request genérico do seu composable
const authStore = useAuthStore()
const users = ref([])
const isLoading = ref(true)
const message = ref('')

// Busca todos os usuários
async function loadUsers() {
  isLoading.value = true
  try {
    users.value = await request('/users')
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

// Salva a alteração de permissão
async function updateUserRole(user) {
  try {
    await request(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: user.role })
    })
    message.value = `Permissão de ${user.nome} atualizada!`
    setTimeout(() => message.value = '', 3000)
  } catch (error) {
    alert('Erro ao atualizar')
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <Layout>
    <div class="max-w-6xl mx-auto px-4 py-8">
      <div class="flex items-center gap-3 mb-6">
        <Users class="w-8 h-8 text-indigo-600" />
        <h2 class="text-2xl font-bold text-gray-900">Gestão de Usuários</h2>
      </div>

      <div v-if="message" class="bg-green-100 text-green-700 p-3 rounded-lg mb-4 text-sm font-medium animate-pulse">
        {{ message }}
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-gray-50 border-b border-gray-100">
            <tr>
              <th class="p-4 text-xs font-bold text-gray-500 uppercase">Nome</th>
              <th class="p-4 text-xs font-bold text-gray-500 uppercase">Email</th>
              <th class="p-4 text-xs font-bold text-gray-500 uppercase">Nível de Acesso</th>
              <th class="p-4 text-right text-xs font-bold text-gray-500 uppercase">Ação</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50">
              <td class="p-4 font-medium text-gray-900">{{ user.nome }}</td>
              <td class="p-4 text-gray-500">{{ user.email }}</td>
              <td class="p-4">
                <select 
                  v-if="user.id !== authStore.user.id"
                  v-model="user.role" 
                  class="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5"
                >
                  <option value="admin">Admin (Total)</option>
                  <option value="operador">Operador (Edita/Move)</option>
                  <option value="leitor">Leitor (Só Vê)</option>
                </select>
                <span v-else class="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Você</span>
              </td>
              <td class="p-4 text-right">
                <button 
                  v-if="user.id !== authStore.user.id"
                  @click="updateUserRole(user)"
                  class="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors"
                  title="Salvar"
                >
                  <Save class="w-5 h-5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Layout>
</template>