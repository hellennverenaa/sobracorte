<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
// RECUPERAMOS OS ÍCONES AQUI:
import { Package, Mail, Lock, AlertCircle } from 'lucide-vue-next'

const email = ref('')
const password = ref('')
const error = ref('')
const isLoading = ref(false)

const authStore = useAuthStore()
const router = useRouter()

// --- ESTADOS PARA O MODAL DE SENHA ---
const showResetModal = ref(false)
const resetForm = ref({ email: '', oldPassword: '', newPassword: '' })
const resetMessage = ref('')
// -------------------------------------

async function handleSubmit() {
  error.value = ''
  isLoading.value = true

  try {
    await authStore.login(email.value, password.value)
    router.push('/')
  } catch (err) {
    error.value = err.message || 'Erro ao fazer login'
  } finally {
    isLoading.value = false
  }
}

// --- FUNÇÃO DE TROCAR SENHA (COM CORREÇÃO DE IP) ---
async function handlePasswordChange() {
  resetMessage.value = 'Processando...'
  
  // Pega o IP automaticamente
  const HOST = window.location.hostname
  const API_URL = `http://${HOST}:3001`

  try {
    // 1. Verifica se os dados batem
    const check = await fetch(`${API_URL}/users?email=${resetForm.value.email}&password=${resetForm.value.oldPassword}`)
    const users = await check.json()

    if (users.length === 0) throw new Error('Dados incorretos.')

    // 2. Atualiza a senha
    await fetch(`${API_URL}/users/${users[0].id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: resetForm.value.newPassword })
    })

    resetMessage.value = 'Sucesso! Senha alterada.'
    setTimeout(() => { 
      showResetModal.value = false; 
      resetMessage.value = '';
      resetForm.value = { email: '', oldPassword: '', newPassword: '' }
    }, 2000)
    
  } catch (err) {
    resetMessage.value = 'Erro: Verifique email e senha atual.'
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl mb-4 shadow-lg">
          <Package class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-4xl font-bold text-white mb-2">SobraCorte</h1>
        <p class="text-gray-300">Pavilhão do Corte Automático</p>
      </div>

      <div class="bg-white rounded-2xl shadow-2xl p-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Entrar no Sistema</h2>

        <div v-if="error" class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
          <span class="text-sm">{{ error }}</span>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-5">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <div class="relative">
              <Mail class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="email"
                v-model="email"
                type="email"
                class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="seu@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
              Senha
            </label>
            <div class="relative">
              <Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="password"
                v-model="password"
                type="password"
                class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            :disabled="isLoading"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ isLoading ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>

        <div class="mt-6 text-center space-y-2">
          <button @click="showResetModal = true" class="text-sm text-blue-600 hover:text-blue-800 hover:underline">
            Esqueci ou quero alterar minha senha
          </button>
          
          <p class="text-gray-600 text-sm">
            Não tem uma conta?
            <router-link to="/register" class="text-blue-600 hover:text-blue-700 font-medium">
              Cadastre-se aqui
            </router-link>
          </p>
        </div>
      </div>

      <div class="mt-6 text-center text-gray-400 text-sm">
        <p>Sistema de Gerenciamento de Sobras de Materiais</p>
      </div>
    </div>

    <div v-if="showResetModal" class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 class="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Lock class="w-5 h-5 text-blue-600" /> Alterar Senha
        </h3>
        
        <div class="space-y-3">
          <div>
             <label class="text-xs font-bold text-gray-500">EMAIL</label>
             <input v-model="resetForm.email" type="email" placeholder="seu@email.com" class="w-full p-3 border rounded-lg bg-gray-50" />
          </div>
          <div>
             <label class="text-xs font-bold text-gray-500">SENHA ATUAL</label>
             <input v-model="resetForm.oldPassword" type="password" placeholder="Sua senha atual" class="w-full p-3 border rounded-lg bg-gray-50" />
          </div>
          <div>
             <label class="text-xs font-bold text-gray-500">NOVA SENHA</label>
             <input v-model="resetForm.newPassword" type="password" placeholder="Nova senha" class="w-full p-3 border rounded-lg bg-gray-50" />
          </div>
        </div>

        <p class="text-center mt-4 font-bold text-sm" :class="resetMessage.includes('Sucesso') ? 'text-green-600' : 'text-red-600'">
          {{ resetMessage }}
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <button @click="showResetModal = false" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button @click="handlePasswordChange" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Salvar Senha</button>
        </div>
      </div>
    </div>
  </div>
</template>