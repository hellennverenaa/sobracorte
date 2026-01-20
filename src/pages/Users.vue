<script setup>
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { Users, Shield, Save, AlertTriangle } from 'lucide-vue-next'

const { request } = useApi()
const authStore = useAuthStore()
const users = ref([])
const isLoading = ref(true)
const message = ref('')

// Busca todos os usuários do banco
async function loadUsers() {
  isLoading.value = true
  try {
    const data = await request('/users')
    users.value = data
  } catch (error) {
    console.error("Erro ao carregar usuários:", error)
  } finally {
    isLoading.value = false
  }
}

// Salva a mudança de cargo
async function updateUserRole(user) {
  try {
    await request(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: user.role })
    })
    
    message.value = `Sucesso: ${user.nome} agora é ${user.role.toUpperCase()}`
    setTimeout(() => message.value = '', 3000)
    
  } catch (error) {
    alert('Erro ao atualizar permissão')
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
        <div class="p-3 bg-indigo-100 rounded-xl text-indigo-600">
          <Users class="w-8 h-8" />
        </div>
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Gestão de Usuários</h2>
          <p class="text-sm text-gray-500">Controle quem pode fazer o que no sistema.</p>
        </div>
      </div>

      <div v-if="message" class="bg-green-100 border border-green-200 text-green-700 p-4 rounded-xl mb-6 flex items-center gap-2 animate-bounce">
        <Shield class="w-5 h-5" />
        <span class="font-medium">{{ message }}</span>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-gray-50 border-b border-gray-100">
            <tr>
              <th class="p-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuário</th>
              <th class="p-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
              <th class="p-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Nível de Acesso</th>
              <th class="p-5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Salvar</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50 transition-colors">
              
              <td class="p-5">
                <div class="font-bold text-gray-900">{{ user.nome }}</div>
                <div v-if="user.id === authStore.user.id" class="text-xs text-indigo-600 font-bold mt-1">
                  (Você está aqui)
                </div>
              </td>
              
              <td class="p-5 text-gray-500 text-sm">{{ user.email }}</td>
              
              <td class="p-5">
                <div v-if="user.id === authStore.user.id" class="flex items-center gap-2 text-gray-400 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200 cursor-not-allowed">
                  <Shield class="w-4 h-4" />
                  <span class="text-sm font-medium capitalize">{{ user.role }}</span>
                </div>

                <select 
                  v-else
                  v-model="user.role" 
                  class="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 outline-none cursor-pointer hover:bg-gray-50"
                >
                  <option value="leitor"> Leitor (Só vê)</option>
                  <option value="operador"> Operador (Edita/Move)</option>
                  <option value="admin"> Admin (Total)</option>
                </select>
              </td>

              <td class="p-5 text-right">
                <button 
                  v-if="user.id !== authStore.user.id"
                  @click="updateUserRole(user)"
                  class="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-all active:scale-95"
                  title="Salvar Alteração"
                >
                  <Save class="w-5 h-5" />
                </button>
              </td>

            </tr>
          </tbody>
        </table>
        
        <div v-if="users.length === 0 && !isLoading" class="p-8 text-center text-gray-500">
          Nenhum usuário encontrado.
        </div>
      </div>

      <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <h4 class="font-bold text-gray-900 mb-1 flex items-center gap-2">Admin</h4>
          <p class="text-xs text-gray-500">Pode tudo: criar usuários, apagar materiais e mudar permissões.</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <h4 class="font-bold text-gray-900 mb-1 flex items-center gap-2"> Operador</h4>
          <p class="text-xs text-gray-500">Dia a dia: Cadastra materiais e faz entrada/saída de estoque.</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <h4 class="font-bold text-gray-900 mb-1 flex items-center gap-2"> Leitor</h4>
          <p class="text-xs text-gray-500">Segurança: Apenas visualiza o dashboard e relatórios. Não altera nada.</p>
        </div>
      </div>

    </div>
  </Layout>
</template>