<script setup>
import { ref, onMounted, computed } from 'vue'
import Layout from '@/components/Layout.vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { Users, Trash2, Shield, UserPlus, Search, CheckCircle, AlertTriangle, Info } from 'lucide-vue-next'

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
  // TRAVA DE SEGURANÇA
  if (user.id === authStore.user.id) {
    alert("Você não pode alterar seu próprio nível de acesso.")
    // Força o visual a voltar para o que estava antes (caso o navegador tenha mudado)
    await loadUsers()
    return
  }

  try {
    // 1. Salva no banco
    await updateUser(user.id, { role: newRole })
    
    // 2. ATUALIZA O VISUAL IMEDIATAMENTE (A CORREÇÃO ESTÁ AQUI)
    user.role = newRole 

    message.value = `Permissão de ${user.nome} alterada para ${newRole.toUpperCase()}.`
    setTimeout(() => message.value = '', 3000)
  } catch (err) {
    console.error(err)
    alert("Erro ao atualizar permissão.")
    loadUsers() // Recarrega se der erro
  }
}

async function handleDelete(user) {
  if (user.id === authStore.user.id) {
    alert("Você não pode excluir sua própria conta.")
    return
  }

  if (confirm(`ATENÇÃO: Tem certeza que deseja remover o acesso de "${user.nome}"?\nEssa ação não pode ser desfeita.`)) {
    try {
      await deleteUser(user.id)
      
      // Remove da lista visualmente na hora (mais rápido que recarregar tudo)
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
          <p class="text-gray-500 text-sm">Controle total sobre quem acessa o sistema.</p>
        </div>
        
        <div v-if="message" class="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 animate-bounce">
          <CheckCircle class="w-4 h-4" /> {{ message }}
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="bg-white p-4 rounded-xl border-l-4 border-indigo-500 shadow-sm hover:shadow-md transition-shadow">
          <div class="font-bold text-indigo-700 flex items-center gap-2 mb-1"><Shield class="w-4 h-4" /> Administrador</div>
          <p class="text-xs text-gray-500">Acesso total. Pode criar/excluir usuários, apagar materiais e ver todo o financeiro.</p>
        </div>
        <div class="bg-white p-4 rounded-xl border-l-4 border-emerald-500 shadow-sm hover:shadow-md transition-shadow">
          <div class="font-bold text-emerald-700 flex items-center gap-2 mb-1"><CheckCircle class="w-4 h-4" /> Operador</div>
          <p class="text-xs text-gray-500">Pode cadastrar materiais e registrar entradas/saídas. Não exclui usuários.</p>
        </div>
        <div class="bg-white p-4 rounded-xl border-l-4 border-gray-400 shadow-sm hover:shadow-md transition-shadow">
          <div class="font-bold text-gray-600 flex items-center gap-2 mb-1"><Info class="w-4 h-4" /> Visualizador</div>
          <p class="text-xs text-gray-500">Apenas leitura. Pode ver dashboards e relatórios, mas não altera nada.</p>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        
        <div class="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <div class="relative max-w-md w-full">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input v-model="searchTerm" type="text" placeholder="Buscar usuário..." class="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th class="p-5">Usuário</th>
                <th class="p-5">Nível de Acesso</th>
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
                      <option v-for="role in roles" :key="role.value" :value="role.value">
                        {{ role.label }}
                      </option>
                    </select>
                    <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </td>

                <td class="p-5 text-right">
                  <button 
                    @click="handleDelete(u)"
                    :disabled="u.id === authStore.user.id"
                    class="p-2 rounded-lg transition-colors"
                    :class="u.id === authStore.user.id ? 'opacity-20 cursor-not-allowed text-gray-300' : 'text-red-400 hover:bg-red-50 hover:text-red-600'"
                    :title="u.id === authStore.user.id ? 'Proteção: Não é possível se excluir' : 'Excluir usuário'"
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