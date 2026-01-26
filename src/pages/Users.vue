<script setup>
import { ref, onMounted, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { Users, Trash2, Shield, CheckCircle, Search, Info, Key } from 'lucide-vue-next'

const { fetchUsers, updateUser, deleteUser } = useApi()
const authStore = useAuthStore()

const users = ref([])
const searchTerm = ref('')
const isLoading = ref(true)
const message = ref('')

const roles = [
  { value: 'admin', label: 'Administrador', class: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'operador', label: 'Operador', class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'viewer', label: 'Visualizador', class: 'bg-gray-100 text-gray-700 border-gray-200' }
]

async function loadUsers() {
  isLoading.value = true
  try {
    const data = await fetchUsers()
    users.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const filteredUsers = computed(() => {
  if (!searchTerm.value) return users.value
  const s = searchTerm.value.toLowerCase()
  return users.value.filter(u => 
    u.nome.toLowerCase().includes(s) || 
    u.email.toLowerCase().includes(s)
  )
})

async function handleRoleChange(user, newRole) {
  if (user.id === authStore.user.id) {
    alert("Você não pode alterar seu próprio nível de acesso.")
    await loadUsers()
    return
  }
  try {
    await updateUser(user.id, { role: newRole })
    user.role = newRole 
    message.value = `Permissão de ${user.nome} alterada.`
    setTimeout(() => message.value = '', 3000)
  } catch (err) {
    alert("Erro ao atualizar permissão.")
    loadUsers()
  }
}

// --- NOVA FUNÇÃO: REDEFINIR SENHA PELO ADMIN ---
async function handleAdminResetPassword(user) {
  const newPassword = prompt(`Digite a nova senha para o usuário ${user.nome}:`)
  
  if (newPassword === null) return // Cancelou
  if (newPassword.length < 4) {
    alert("A senha deve ter pelo menos 4 caracteres.")
    return
  }

  try {
    await updateUser(user.id, { password: newPassword })
    alert(`Sucesso! A senha de ${user.nome} foi alterada para: ${newPassword}\nAvise o usuário.`)
  } catch (err) {
    alert("Erro ao alterar a senha.")
  }
}

async function handleDelete(user) {
  if (user.id === authStore.user.id) {
    alert("Você não pode excluir sua própria conta.")
    return
  }
  if (confirm(`ATENÇÃO: Tem certeza que deseja remover o acesso de "${user.nome}"?`)) {
    try {
      await deleteUser(user.id)
      users.value = users.value.filter(u => u.id !== user.id)
      message.value = `Usuário ${user.nome} removido.`
      setTimeout(() => message.value = '', 3000)
    } catch (err) {
      alert("Erro ao excluir usuário.")
    }
  }
}

onMounted(() => loadUsers())
</script>

<template>
  <Layout>
    <div class="max-w-6xl mx-auto px-4 py-8">
      
      <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users class="w-6 h-6 text-indigo-600" /> Gestão de Usuários
          </h2>
          <p class="text-gray-500 text-sm">Controle de acesso e senhas.</p>
        </div>
        
        <div v-if="message" class="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 animate-bounce">
          <CheckCircle class="w-4 h-4" /> {{ message }}
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="bg-white p-4 rounded-xl border-l-4 border-indigo-500 shadow-sm">
          <div class="font-bold text-indigo-700 flex items-center gap-2 mb-1"><Shield class="w-4 h-4" /> Administrador</div>
          <p class="text-xs text-gray-500">Acesso total. Pode criar/excluir usuários e resetar senhas.</p>
        </div>
        <div class="bg-white p-4 rounded-xl border-l-4 border-emerald-500 shadow-sm">
          <div class="font-bold text-emerald-700 flex items-center gap-2 mb-1"><CheckCircle class="w-4 h-4" /> Operador</div>
          <p class="text-xs text-gray-500">Pode cadastrar materiais e registrar entradas/saídas.</p>
        </div>
        <div class="bg-white p-4 rounded-xl border-l-4 border-gray-400 shadow-sm">
          <div class="font-bold text-gray-600 flex items-center gap-2 mb-1"><Info class="w-4 h-4" /> Visualizador</div>
          <p class="text-xs text-gray-500">Apenas leitura dos dashboards.</p>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
<<<<<<< HEAD
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
                <div v-if="user.id === authStore.user?.id" class="text-xs text-indigo-600 font-bold mt-1">
                  (Você está aqui)
                </div>
              </td>
              
              <td class="p-5 text-gray-500 text-sm">{{ user.email }}</td>
              
              <td class="p-5">
                <div v-if="user.id === authStore.user?.id" class="flex items-center gap-2 text-gray-400 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200 cursor-not-allowed">
                  <Shield class="w-4 h-4" />
                  <span class="text-sm font-medium capitalize">{{ user.role }}</span>
                </div>
=======
        <div class="p-4 border-b border-gray-100 bg-gray-50/50">
          <div class="relative max-w-md w-full">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input v-model="searchTerm" type="text" placeholder="Buscar usuário..." class="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>
>>>>>>> b9d12962eab87c447b611208eb1f9f3a38461f55

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th class="p-5">Usuário</th>
                <th class="p-5">Função</th>
                <th class="p-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-sm">
              <tr v-for="u in filteredUsers" :key="u.id" class="hover:bg-indigo-50/30 transition-colors group">
                <td class="p-5">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-bold text-lg shadow-sm">
                      {{ u.nome.charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <div class="font-bold text-gray-900 flex items-center gap-2">
                        {{ u.nome }}
                        <span v-if="u.id === authStore.user.id" class="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">Você</span>
                      </div>
                      <div class="text-gray-500 text-xs">{{ u.email }}</div>
                    </div>
                  </div>
                </td>
                
                <td class="p-5">
                  <div class="relative w-48">
                    <select 
                      :value="u.role" 
                      @change="handleRoleChange(u, $event.target.value)"
                      :disabled="u.id === authStore.user.id"
                      class="w-full appearance-none pl-3 pr-8 py-2 rounded-lg text-xs font-bold uppercase border cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500 transition-colors shadow-sm"
                      :class="{
                        'bg-indigo-50 text-indigo-700 border-indigo-200': u.role === 'admin',
                        'bg-emerald-50 text-emerald-700 border-emerald-200': u.role === 'operador',
                        'bg-gray-50 text-gray-600 border-gray-200': u.role === 'viewer',
                        'opacity-50 cursor-not-allowed': u.id === authStore.user.id
                      }"
                    >
                      <option v-for="role in roles" :key="role.value" :value="role.value">{{ role.label }}</option>
                    </select>
                  </div>
                </td>

<<<<<<< HEAD
              <td class="p-5 text-right">
                <button 
                  v-if="user.id !== authStore.user?.id"
                  @click="updateUserRole(user)"
                  class="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-all active:scale-95"
                  title="Salvar Alteração"
                >
                  <Save class="w-5 h-5" />
                </button>
              </td>
=======
                <td class="p-5 text-right flex justify-end gap-2">
                  <button 
                    @click="handleAdminResetPassword(u)"
                    class="p-2 text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                    title="Redefinir Senha do Usuário"
                  >
                    <Key class="w-5 h-5" />
                  </button>
>>>>>>> b9d12962eab87c447b611208eb1f9f3a38461f55

                  <button 
                    @click="handleDelete(u)"
                    :disabled="u.id === authStore.user.id"
                    class="p-2 rounded-lg transition-colors"
                    :class="u.id === authStore.user.id ? 'opacity-20 cursor-not-allowed text-gray-300' : 'text-red-400 hover:bg-red-50 hover:text-red-600'"
                    :title="u.id === authStore.user.id ? 'Não é possível se excluir' : 'Excluir usuário'"
                  >
                    <Trash2 class="w-5 h-5" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Layout>
</template>