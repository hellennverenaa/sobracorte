<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Lock, User, ArrowRight, AlertTriangle, ExternalLink } from 'lucide-vue-next'
import { api } from '@/services/httpClient'

const router = useRouter()
const authStore = useAuthStore()
const portalUnixUrl = import.meta.env.VITE_PORTAL_UNIX_URL
const username = ref('')
const password = ref('')
const error = ref('')
const isLoading = ref(false)
const units = ref([])
const selectedUnit = ref('')
const unitsLoading = ref(true)

onMounted(async () => {
  try {
    const response = await api.get('/factory-units')
    units.value = Array.isArray(response.data?.data) ? response.data.data : []
    const sest = units.value.find(u => u.code === 'SEST')
    selectedUnit.value = sest ? sest.code : (units.value[0]?.code || '')
    if (units.value.length === 0) error.value = 'Nenhuma unidade está disponível para acesso.'
  } catch {
    error.value = 'Não foi possível carregar as unidades. O login está indisponível.'
  } finally {
    unitsLoading.value = false
  }
})

async function handleLogin() {
  error.value = ''

  if (!username.value.trim()) {
    error.value = 'Por favor, informe seu Usuário Unix.'
    return
  }

  if (!password.value) {
    error.value = 'Por favor, informe a senha.'
    return
  }
  if (!selectedUnit.value) {
    error.value = 'Selecione uma unidade.'
    return
  }

  isLoading.value = true
  try {
    await authStore.login(username.value.trim(), password.value, selectedUnit.value)
    router.push('/')
  } catch (err) {
    error.value = err.message || 'Erro ao conectar ao serviço de autenticação.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-100 p-4">
    
    <div class="bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-5xl flex flex-col md:flex-row min-h-[620px] border border-slate-200">
      
      <div class="md:w-1/2 bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 p-12 text-white flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
           <div class="absolute right-0 top-0 w-64 h-64 bg-blue-500 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
           <div class="absolute left-0 bottom-0 w-64 h-64 bg-purple-500 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>
        </div>
        
        <div class="relative z-10">
           <div class="w-12 h-12 bg-white/10 rounded-xl backdrop-blur-md flex items-center justify-center mb-6 border border-white/20 shadow-lg">
             <span class="font-black text-2xl">D</span>
           </div>
           <h1 class="text-5xl font-black tracking-tight mb-4">Sobras DASS</h1>
           <p class="text-indigo-200 text-lg leading-relaxed mb-6">
             Gestão inteligente de resíduos e estoque para a indústria calçadista.
           </p>

           <div class="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 px-3.5 py-1.5 rounded-full text-xs text-indigo-200 shadow-sm">
             <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
             Integrado ao Portal Unix
           </div>
        </div>

        <div class="relative z-10 text-xs text-indigo-300/70 font-medium pt-8">
          &copy; 2026 Grupo DASS - Equipe de Desenvolvimento SEST v3.0 (Multi-Setor)
        </div>
      </div>

      <div class="md:w-1/2 p-10 md:p-12 flex flex-col justify-between bg-white relative">
        <div class="max-w-md mx-auto w-full my-auto">
          <h2 class="text-3xl font-bold text-slate-900 mb-2">Bem-vindo de volta</h2>
          <p class="text-slate-500 mb-6 text-sm">Informe suas credenciais Unix para acessar.</p>

          <form @submit.prevent="handleLogin" class="space-y-4">
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-600 uppercase tracking-wider">Unidade</label>
              <select
                v-model="selectedUnit"
                :disabled="unitsLoading || units.length === 0"
                class="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 font-medium shadow-inner transition-all disabled:opacity-60"
                required
              >
                <option value="" disabled>{{ unitsLoading ? 'Carregando unidades...' : 'Selecione uma unidade' }}</option>
                <option v-for="unit in units" :key="unit.code" :value="unit.code">
                  {{ unit.code }} — {{ unit.name }}
                </option>
              </select>
            </div>
            
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-600 uppercase tracking-wider">Usuário Unix</label>
              <div class="relative">
                <User class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  v-model="username" 
                  type="text" 
                  placeholder="Ex: hellen.magalhaes" 
                  class="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 font-medium shadow-inner transition-all" 
                  required 
                />
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-600 uppercase tracking-wider">Senha</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  v-model="password" 
                  type="password" 
                  placeholder="••••••••" 
                  class="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 font-medium shadow-inner transition-all" 
                  required 
                />
              </div>
            </div>

            <div v-if="error" class="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-bold animate-shake border border-red-100">
              <AlertTriangle class="w-5 h-5 shrink-0" /> 
              <span>{{ error }}</span>
            </div>

            <button 
              type="submit" 
              :disabled="isLoading || unitsLoading || units.length === 0"
              class="w-full bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg text-white font-bold py-4 rounded-xl shadow-xl shadow-indigo-500/20 transform active:scale-95 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed mt-2 cursor-pointer"
            >
              <span v-if="!isLoading">Acessar Sistema</span>
              <span v-else>Autenticando...</span>
              <ArrowRight v-if="!isLoading" class="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div class="mt-6 border-t border-slate-100 pt-5 text-center">
            <p class="text-xs text-slate-500 mb-2">
              Esqueceu sua senha ou precisa de uma nova conta?
            </p>
            <a 
              :href="portalUnixUrl"
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
