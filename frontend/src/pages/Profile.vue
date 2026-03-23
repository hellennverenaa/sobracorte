<script setup>
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { User, Mail, Shield, Key, Save, CheckCircle, AlertTriangle } from 'lucide-vue-next'

const authStore = useAuthStore()
const {  } = useApi()

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
  isSubmitting.value = true

  // Simula um delay de salvamento para UX (já que não podemos alterar a senha de rede da DASS)
  setTimeout(() => {
    isSubmitting.value = false
    message.value = { 
      type: 'warning', 
      text: 'Seus dados pessoais (Setor/Nome/Senha) são espelhados da Rede DASS e não podem ser alterados por aqui.' 
    }
    // Limpa os campos de senha se o usuário tentou digitar algo
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  }, 1000)
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
                <input v-model="user.nome" type="text" class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" disabled required />
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Email</label>
              <div class="relative">
                <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input v-model="user.email" type="email" class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" disabled required />
              </div>
            </div>
          </div>

          

          <div v-if="message.text" class="p-4 rounded-xl flex items-center gap-3 text-sm font-bold"
               :class="message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'">
            <AlertTriangle v-if="message.type === 'error'" class="w-5 h-5" />
            <CheckCircle v-else class="w-5 h-5" />
            {{ message.text }}
          </div>

        

        </form>
      </div>
    </div>
  </Layout>
</template>