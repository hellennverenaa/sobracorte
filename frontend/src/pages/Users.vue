<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import Layout from '@/components/Layout.vue'
import { 
  Trash2, 
  Edit, 
  Search, 
  UserCheck, 
  Shield, 
  Users as UsersIcon,
  Activity,
  Eye
} from 'lucide-vue-next'

const auth = useAuthStore()
const users = ref([])
const loading = ref(true)
const searchTerm = ref('')
const showEditModal = ref(false)
const editingUser = ref(null)

// URL do Banco Local (JSON Server)
const DB_URL = 'http://localhost:3001/users'

// Opções de Níveis de Acesso
const roleOptions = [
  { value: 'admin', label: 'Admin Master', icon: Shield, color: 'text-purple-600 bg-purple-100' },
  { value: 'lider', label: 'Líder', icon: UserCheck, color: 'text-blue-600 bg-blue-100' },
  { value: 'movimentador', label: 'Movimentador', icon: Activity, color: 'text-orange-600 bg-orange-100' },
  { value: 'leitor', label: 'Leitor', icon: Eye, color: 'text-gray-600 bg-gray-100' }
]

// Carregar usuários do banco local
const fetchUsers = async () => {
  loading.value = true
  try {
    const response = await fetch(DB_URL)
    const data = await response.json()
    users.value = data
  } catch (error) {
    console.error('Erro ao buscar usuários:', error)
    alert('Erro ao carregar lista de usuários. Verifique se o banco (npm run db) está rodando.')
  } finally {
    loading.value = false
  }
}

// Salvar alteração de nível
const saveUserRole = async () => {
  if (!editingUser.value) return

  try {
    const response = await fetch(`${DB_URL}/${editingUser.value.id}`, {
      method: 'PUT', // Ou PATCH
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingUser.value)
    })

    if (response.ok) {
      alert('Permissão atualizada com sucesso!')
      showEditModal.value = false
      fetchUsers() // Recarrega a lista
    } else {
      throw new Error('Falha ao salvar')
    }
  } catch (error) {
    console.error(error)
    alert('Erro ao atualizar usuário.')
  }
}

// Abrir modal de edição
const openEditModal = (user) => {
  // Cria uma cópia para não alterar a tabela antes de salvar
  editingUser.value = { ...user }
  showEditModal.value = true
}

// Excluir usuário (opcional, cuidado!)
const deleteUser = async (id) => {
  if (!confirm('Tem certeza que deseja remover este usuário do sistema local?')) return

  try {
    await fetch(`${DB_URL}/${id}`, { method: 'DELETE' })
    fetchUsers()
  } catch (error) {
    alert('Erro ao excluir usuário')
  }
}

// Filtro de busca
const filteredUsers = computed(() => {
  if (!searchTerm.value) return users.value
  const term = searchTerm.value.toLowerCase()
  return users.value.filter(u => 
    u.nome?.toLowerCase().includes(term) || 
    u.usuario?.toLowerCase().includes(term) ||
    u.setor?.toLowerCase().includes(term)
  )
})

// Função auxiliar para pegar a cor/label do cargo
const getRoleInfo = (role) => {
  return roleOptions.find(r => r.value === role) || roleOptions[3] // Fallback para leitor
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <Layout>
    <div class="p-6 max-w-7xl mx-auto">
      
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UsersIcon class="w-8 h-8 text-blue-600" />
            Gestão de Usuários
          </h1>
          <p class="text-gray-600 mt-1">Gerencie os níveis de acesso da equipe</p>
        </div>
        
        <div class="relative">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            v-model="searchTerm"
            type="text" 
            placeholder="Buscar por nome ou setor..." 
            class="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64"
          >
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b">
              <tr>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Usuário / Nome</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Setor / Função</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Nível de Acesso</th>
                <th class="px-6 py-4 text-center text-sm font-semibold text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-if="loading">
                <td colspan="4" class="px-6 py-8 text-center text-gray-500">Carregando usuários...</td>
              </tr>
              
              <tr v-else-if="filteredUsers.length === 0">
                <td colspan="4" class="px-6 py-8 text-center text-gray-500">Nenhum usuário encontrado.</td>
              </tr>

              <tr v-for="user in filteredUsers" :key="user.id" class="hover:bg-gray-50 transition-colors">
                
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                      {{ user.nome ? user.nome.charAt(0).toUpperCase() : 'U' }}
                    </div>
                    <div>
                      <p class="font-medium text-gray-900">{{ user.nome || 'Sem Nome' }}</p>
                      <p class="text-sm text-gray-500">{{ user.usuario }}</p>
                    </div>
                  </div>
                </td>

                <td class="px-6 py-4">
                  <p class="text-sm font-medium text-gray-800">{{ user.setor || '-' }}</p>
                  <p class="text-xs text-gray-500">{{ user.funcao || '-' }}</p>
                </td>

                <td class="px-6 py-4">
                  <span :class="`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${getRoleInfo(user.role).color}`">
                    <component :is="getRoleInfo(user.role).icon" class="w-3 h-3" />
                    {{ getRoleInfo(user.role).label }}
                  </span>
                </td>

                <td class="px-6 py-4 text-center">
                  <div class="flex justify-center gap-2">
                    <button 
                      @click="openEditModal(user)"
                      class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar Permissão"
                      :disabled="user.usuario === auth.user.usuario" 
                      :class="{'opacity-50 cursor-not-allowed': user.usuario === auth.user.usuario}"
                    >
                      <Edit class="w-5 h-5" />
                    </button>
                    
                    <button 
                      @click="deleteUser(user.id)"
                      class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remover Usuário"
                      :disabled="user.usuario === auth.user.usuario"
                      :class="{'opacity-50 cursor-not-allowed': user.usuario === auth.user.usuario}"
                    >
                      <Trash2 class="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="showEditModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        
        <div class="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
          <h3 class="font-bold text-lg text-gray-800">Alterar Permissões</h3>
          <button @click="showEditModal = false" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
            <input 
              type="text" 
              :value="editingUser.nome || editingUser.usuario" 
              disabled 
              class="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-gray-600 cursor-not-allowed"
            >
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Nível de Acesso</label>
            <div class="space-y-2">
              <label 
                v-for="option in roleOptions" 
                :key="option.value"
                class="flex items-center p-3 border rounded-lg cursor-pointer transition-all hover:bg-gray-50"
                :class="{'border-blue-500 bg-blue-50 ring-1 ring-blue-500': editingUser.role === option.value}"
              >
                <input 
                  type="radio" 
                  v-model="editingUser.role" 
                  :value="option.value"
                  class="text-blue-600 focus:ring-blue-500 h-4 w-4 mr-3"
                >
                <div class="flex items-center gap-2">
                  <component :is="option.icon" class="w-4 h-4 text-gray-500" />
                  <span class="text-sm font-medium text-gray-700">{{ option.label }}</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button 
            @click="showEditModal = false"
            class="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            Cancelar
          </button>
          <button 
            @click="saveUserRole"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  </Layout>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>