<script setup>
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { User, Mail, Shield, Key, Save, CheckCircle, AlertTriangle } from 'lucide-vue-next'

const authStore = useAuthStore()
const { updateUser } = useApi()

const user = ref({ ...authStore.user }) // Clona os dados para editar
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isSubmitting = ref(false)
const message = ref({ type: '', text: '' })

// Mapeia o nome do cargo para ficar bonito
const roleMap = {
  'admin': 'Administrador',
  'operador': 'Operador de Estoque',
  'viewer': 'Visualizador'
}

async function handleUpdateProfile() {
  message.value = { type: '', text: '' }
  
  if (!user.value.nome || !user.value.email) {
    message.value = { type: 'error', text: 'Nome e Email são obrigatórios.' }
    return
  }

  isSubmitting.value = true

  try {
    const payload = {
      nome: user.value.nome,
      email: user.value.email
    }

    // Lógica de Troca de Senha
    if (newPassword.value) {
      if (currentPassword.value !== authStore.user.password) {
        throw new Error('A senha atual está incorreta.')
      }
      if (newPassword.value.length < 4) {
        throw new Error('A nova senha deve ter pelo menos 4 caracteres.')
      }
      if (newPassword.value !== confirmPassword.value) {
        throw new Error('As senhas novas não coincidem.')
      }
      payload.password = newPassword.value
    }

    // Atualiza no Banco
    const updatedUser = await updateUser(user.value.id, payload)
    
    // Atualiza na "Sessão" (Store)
    authStore.user = updatedUser
    localStorage.setItem('user', JSON.stringify(updatedUser))
    
    // Limpa campos de senha
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    
    message.value = { type: 'success', text: 'Perfil atualizado com sucesso!' }

  } catch (err) {
    message.value = { type: 'error', text: err.message || 'Erro ao atualizar.' }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Layout>
    <div class="max-w-4xl mx-auto px-4 py-8">
      
      <div class="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-8 mb-8">
        <div class="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-lg">
          {{ user.nome?.charAt(0).toUpperCase() }}
        </div>
        <div class="text-center md:text-left flex-grow">
          <h1 class="text-3xl font-bold text-gray-900">{{ user.nome }}</h1>
          <p class="text-gray-500 font-medium">{{ user.email }}</p>
          <div class="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border"
            :class="user.role === 'admin' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-gray-50 text-gray-600 border-gray-200'">
            <Shield class="w-3 h-3" /> {{ roleMap[user.role] || user.role }}
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
            <User class="w-5 h-5 text-gray-400" /> Editar Informações
          </h2>
        </div>
        
        <form @submit.prevent="handleUpdateProfile" class="p-8 space-y-8">
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Nome Completo</label>
              <div class="relative">
                <User class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input v-model="user.nome" type="text" class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required />
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Email</label>
              <div class="relative">
                <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input v-model="user.email" type="email" class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required />
              </div>
            </div>
          </div>

          <div class="border-t border-gray-100 pt-6">
             <h3 class="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
               <Key class="w-4 h-4 text-indigo-500" /> Alterar Senha
               <span class="text-xs font-normal text-gray-400 ml-2">(Deixe em branco se não quiser mudar)</span>
             </h3>
             
             <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div>
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Senha Atual</label>
                  <input v-model="currentPassword" type="password" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="•••" />
               </div>
               <div>
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Nova Senha</label>
                  <input v-model="newPassword" type="password" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="•••" />
               </div>
               <div>
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Confirmar Nova</label>
                  <input v-model="confirmPassword" type="password" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="•••" />
               </div>
             </div>
          </div>

          <div v-if="message.text" class="p-4 rounded-xl flex items-center gap-3 text-sm font-bold"
               :class="message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'">
            <AlertTriangle v-if="message.type === 'error'" class="w-5 h-5" />
            <CheckCircle v-else class="w-5 h-5" />
            {{ message.text }}
          </div>

          <div class="flex justify-end">
            <button type="submit" :disabled="isSubmitting" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2">
              <Save class="w-5 h-5" />
              {{ isSubmitting ? 'Salvando...' : 'Salvar Alterações' }}
            </button>
          </div>

        </form>
      </div>
    </div>
  </Layout>
</template>