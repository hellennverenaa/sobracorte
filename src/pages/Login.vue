<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { Lock, Mail, User, ArrowRight, CheckCircle, AlertTriangle, X, ShieldAlert } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()
const { request } = useApi()

// Estados do Formulário
const isRegistering = ref(false)
const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const isLoading = ref(false)

// Estados do Modal "Esqueci Senha"
const showForgotModal = ref(false)

// --- LOGIN ---
async function handleLogin() {
  error.value = ''
  isLoading.value = true
  try {
    await authStore.login(email.value, password.value)
    router.push('/')
  } catch (err) {
    error.value = err.message || 'Erro ao conectar.'
  } finally {
    isLoading.value = false
  }
}

// --- CADASTRO ---
async function handleRegister() {
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = 'As senhas não coincidem.'
    return
  }
  if (password.value.length < 4) {
    error.value = 'A senha deve ter no mínimo 4 caracteres.'
    return
  }
  isLoading.value = true
  try {
    const existing = await request(`/users?email=${email.value}`)
    if (existing && existing.length > 0) throw new Error('Este email já está cadastrado.')

    const newUser = {
      nome: name.value,
      email: email.value,
      password: password.value,
      role: 'operador',
      data_cadastro: new Date().toISOString()
    }
    await request('/users', { method: 'POST', body: JSON.stringify(newUser) })
    await authStore.login(email.value, password.value)
    router.push('/')
  } catch (err) {
    error.value = err.message || 'Erro ao criar conta.'
  } finally {
    isLoading.value = false
  }
}

function handleSubmit() {
  if (isRegistering.value) handleRegister()
  else handleLogin()
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 p-4">
    
    <div class="bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-5xl flex flex-col md:flex-row min-h-[600px]">
      
      <div class="md:w-1/2 bg-gradient-to-br from-indigo-900 to-slate-900 p-12 text-white flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
           <div class="absolute right-0 top-0 w-64 h-64 bg-blue-500 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
           <div class="absolute left-0 bottom-0 w-64 h-64 bg-purple-500 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>
        </div>
        <div class="relative z-10">
           <div class="w-12 h-12 bg-white/10 rounded-xl backdrop-blur-md flex items-center justify-center mb-6 border border-white/20">
             <span class="font-black text-2xl">D</span>
           </div>
           <h1 class="text-5xl font-black tracking-tight mb-4">Sobras DASS</h1>
           <p class="text-indigo-200 text-lg leading-relaxed">
             Gestão inteligente de resíduos e estoque para a indústria calçadista.
           </p>
        </div>
        <div class="relative z-10 text-sm text-indigo-300/60 font-medium">
          &copy; 2026 Grupo DASS - Sistema Consumo SEST v2.0
        </div>
      </div>

      <div class="md:w-1/2 p-12 flex flex-col justify-center bg-white relative">
        <div class="max-w-md mx-auto w-full">
          <h2 class="text-3xl font-bold text-gray-900 mb-2">{{ isRegistering ? 'Criar Conta' : 'Bem-vindo de volta' }}</h2>
          <p class="text-gray-500 mb-8">{{ isRegistering ? 'Preencha os dados para se registrar.' : 'Faça login para acessar o painel.' }}</p>

          <form @submit.prevent="handleSubmit" class="space-y-5">
            <div v-if="isRegistering" class="space-y-1 animate-fade-in">
              <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">Nome Completo</label>
              <div class="relative">
                <User class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input v-model="name" type="text" placeholder="Seu Nome" class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" required />
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">Email Corporativo</label>
              <div class="relative">
                <Mail class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input v-model="email" type="email" placeholder="seu@grupodass.com.br" class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" required />
              </div>
            </div>

            <div class="space-y-1">
               <div class="flex justify-between items-center">
                 <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">Senha</label>
                 <button v-if="!isRegistering" type="button" @click="showForgotModal = true" class="text-xs font-bold text-indigo-600 hover:underline">Esqueceu?</button>
               </div>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input v-model="password" type="password" placeholder="••••••••" class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" required />
              </div>
            </div>

            <div v-if="isRegistering" class="space-y-1 animate-fade-in">
              <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">Confirmar Senha</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input v-model="confirmPassword" type="password" placeholder="••••••••" class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" required />
              </div>
            </div>

            <div v-if="error" class="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-bold animate-shake">
              <AlertTriangle class="w-5 h-5" /> {{ error }}
            </div>

            <button type="submit" :disabled="isLoading" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-xl shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed">
              <span v-if="!isLoading">{{ isRegistering ? 'Criar Conta' : 'Acessar Sistema' }}</span>
              <span v-else>Processando...</span>
              <ArrowRight v-if="!isLoading" class="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div class="mt-8 text-center border-t border-gray-100 pt-6">
            <p class="text-sm text-gray-500 mb-2">{{ isRegistering ? 'Já tem uma conta?' : 'Não tem acesso?' }}</p>
            <button @click="isRegistering = !isRegistering; error = ''" class="text-indigo-600 font-bold hover:underline">
              {{ isRegistering ? 'Fazer Login' : 'Criar nova conta' }}
            </button>
          </div>
        </div>

        <div v-if="showForgotModal" class="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-fade-in">
          <div class="w-full max-w-sm bg-white border border-gray-200 shadow-2xl rounded-2xl p-6 relative text-center">
            <button @click="showForgotModal = false" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X class="w-5 h-5" /></button>
            
            <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert class="w-8 h-8" />
            </div>
            
            <h3 class="text-xl font-bold text-gray-900 mb-2">Recuperação de Acesso</h3>
            <p class="text-gray-500 text-sm mb-6">
              Por motivos de segurança, a redefinição de senha deve ser realizada por um administrador.
            </p>

            <div class="bg-gray-50 p-4 rounded-xl text-sm border border-gray-200 mb-6">
              <p class="font-bold text-gray-700">Entre em contato:</p>
              <a href="mailto:hellen.magalhaes@grupodass.com.br" class="text-indigo-600 break-all font-medium hover:underline">
                hellen.magalhaes@grupodass.com.br
              </a>
            </div>
            
            <button @click="showForgotModal = false" class="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-colors">
              Entendido
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
.animate-shake { animation: shake 0.3s ease-in-out; }
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>