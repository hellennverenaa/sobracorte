<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Lock, User, Building2, ArrowRight, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()

// Estados do Formulário
const username = ref('')
const password = ref('')
const unidade = ref('')
const error = ref('')
const isLoading = ref(false)

// Carrega as unidades ativas ao montar a tela
onMounted(async () => {
  try {
    await authStore.fetchUnidades()
  } catch (err) {
    console.error('Erro ao carregar unidades:', err)
  }
})

// Tentar recarregar unidades dinâmicas em caso de falha
async function handleRetryFetchUnidades() {
  await authStore.fetchUnidades()
}

// --- SUBMIT DO LOGIN ---
async function handleLogin() {
  error.value = ''

  if (!unidade.value) {
    error.value = 'Por favor, selecione a unidade DASS.'
    return
  }

  if (!username.value.trim()) {
    error.value = 'Por favor, informe seu Usuário Unix.'
    return
  }

  if (!password.value) {
    error.value = 'Por favor, informe a senha.'
    return
  }

  isLoading.value = true
  try {
    await authStore.login(username.value.trim(), password.value, unidade.value)
    router.push('/')
  } catch (err) {
    error.value = err.message || 'Erro ao conectar ao serviço de autenticação.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 p-4">
    
    <div class="bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-5xl flex flex-col md:flex-row min-h-[620px]">
      
      <!-- PAINEL ESQUERDO: BRANDING DASS -->
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
           <p class="text-indigo-200 text-lg leading-relaxed mb-6">
             Gestão inteligente de resíduos e estoque para a indústria calçadista.
           </p>

           <div class="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 px-3 py-1.5 rounded-full text-xs text-indigo-200">
             <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
             Sistema Multi-Unidade Integrado ao Unix
           </div>
        </div>

        <div class="relative z-10 text-sm text-indigo-300/60 font-medium pt-8">
          &copy; 2026 Grupo DASS - Equipe de Desenvolvimento SEST v2.0
        </div>
      </div>

      <!-- PAINEL DIREITO: FORMULÁRIO DE LOGIN -->
      <div class="md:w-1/2 p-10 md:p-12 flex flex-col justify-between bg-white relative">
        <div class="max-w-md mx-auto w-full my-auto">
          <h2 class="text-3xl font-bold text-gray-900 mb-2">Bem-vindo de volta</h2>
          <p class="text-gray-500 mb-6">Selecione sua unidade e informe suas credenciais Unix para acessar.</p>

          <form @submit.prevent="handleLogin" class="space-y-4">
            
            <!-- CAMPO: UNIDADE DASS (DROPDOWN DINÂMICO) -->
            <div class="space-y-1">
              <div class="flex justify-between items-center">
                <label class="text-xs font-bold text-gray-600 uppercase tracking-wider">Unidade DASS</label>
                <button 
                  v-if="authStore.unidadesError" 
                  type="button" 
                  @click="handleRetryFetchUnidades"
                  class="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
                >
                  <RefreshCw class="w-3 h-3" /> Recarregar
                </button>
              </div>
              <div class="relative">
                <Building2 class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                <select 
                  v-model="unidade" 
                  class="w-full pl-12 pr-10 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 font-medium appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  :disabled="authStore.isLoadingUnidades"
                  required
                >
                  <option value="" disabled selected>
                    {{ authStore.isLoadingUnidades ? 'Carregando unidades...' : 'Selecione a Unidade' }}
                  </option>
                  <option 
                    v-for="item in authStore.unidades" 
                    :key="item.code" 
                    :value="item.code"
                  >
                    {{ item.name }}
                  </option>
                </select>
                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  ▼
                </div>
              </div>
              <p v-if="authStore.unidadesError" class="text-xs text-amber-600 font-medium mt-1">
                {{ authStore.unidadesError }}
              </p>
            </div>

            <!-- CAMPO: USUÁRIO UNIX -->
            <div class="space-y-1">
              <label class="text-xs font-bold text-gray-600 uppercase tracking-wider">Usuário Unix</label>
              <div class="relative">
                <User class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  v-model="username" 
                  type="text" 
                  placeholder="Ex: hellen.magalhaes" 
                  class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 font-medium" 
                  required 
                />
              </div>
            </div>

            <!-- CAMPO: SENHA -->
            <div class="space-y-1">
              <label class="text-xs font-bold text-gray-600 uppercase tracking-wider">Senha</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  v-model="password" 
                  type="password" 
                  placeholder="••••••••" 
                  class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 font-medium" 
                  required 
                />
              </div>
            </div>

            <!-- MENSAGEM DE ERRO -->
            <div v-if="error" class="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-bold animate-shake">
              <AlertTriangle class="w-5 h-5 shrink-0" /> 
              <span>{{ error }}</span>
            </div>

            <!-- BOTÃO SUBMIT -->
            <button 
              type="submit" 
              :disabled="isLoading || authStore.isLoadingUnidades" 
              class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-xl shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              <span v-if="!isLoading">Acessar Sistema</span>
              <span v-else>Autenticando...</span>
              <ArrowRight v-if="!isLoading" class="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <!-- INFORMAÇÕES E LINKS DO PORTAL UNIX -->
          <div class="mt-6 border-t border-gray-100 pt-5 text-center">
            <p class="text-xs text-gray-500 mb-2">
              Esqueceu sua senha ou precisa de uma nova conta?
            </p>
            <a 
              href="http://10.100.1.43/unix/" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100 transition-colors"
            >
              <span>Gerenciar acesso no Portal Unix</span>
              <ExternalLink class="w-3.5 h-3.5" />
            </a>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
.animate-shake { animation: shake 0.3s ease-in-out; }
</style>