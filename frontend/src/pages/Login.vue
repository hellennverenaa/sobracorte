<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Lock, User, ArrowRight, AlertTriangle, ExternalLink, UserPlus, X } from 'lucide-vue-next'
import { api, authApi } from '@/services/httpClient'
import {
  isLegacyUnit,
  selectInitialUnit,
  shouldDiscardStoredUnit,
} from '@/services/auth/loginFlow'
import {
  externalRegistrationErrorMessage,
  firstExternalRegistrationError,
  registerExternalUser,
  validateExternalRegistration,
} from '@/services/auth/externalRegistration'

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
const lastUnitStorageKey = 'sobracorte:last-unit'
const isSelectedUnitLegacy = computed(() => isLegacyUnit(selectedUnit.value))
const isExternalUnitSelected = computed(() => Boolean(selectedUnit.value) && !isSelectedUnitLegacy.value)
const usernameLabel = computed(() => isSelectedUnitLegacy.value ? 'Usuário Unix' : 'Usuário')
const credentialsHint = computed(() => isSelectedUnitLegacy.value
  ? 'Informe suas credenciais Unix para acessar.'
  : 'Informe suas credenciais da unidade para acessar.')
const selectedUnitLabel = computed(() => {
  const unit = units.value.find((item) => item.code === selectedUnit.value)
  return unit ? `${unit.code} — ${unit.name}` : selectedUnit.value
})
const registrationForm = ref({
  matricula: '',
  nome: '',
  usuario: '',
  senha: '',
  confirmarSenha: '',
  setor: '',
  funcao: '',
})
const isRegistrationOpen = ref(false)
const registrationLoading = ref(false)
const registrationError = ref('')
const registrationNotice = ref('')

function loadLastUnit() {
  try {
    return localStorage.getItem(lastUnitStorageKey) || ''
  } catch {
    return ''
  }
}

function rememberLastUnit(unitCode) {
  try {
    localStorage.setItem(lastUnitStorageKey, unitCode)
  } catch {
    // A indisponibilidade do armazenamento local não deve impedir o login.
  }
}

function discardLastUnit() {
  try {
    localStorage.removeItem(lastUnitStorageKey)
  } catch {
    // A indisponibilidade do armazenamento local não deve impedir o login.
  }
}

onMounted(async () => {
  try {
    const response = await api.get('/factory-units')
    units.value = Array.isArray(response.data?.data) ? response.data.data : []
    const lastUnit = loadLastUnit()
    selectedUnit.value = selectInitialUnit(units.value, lastUnit)
    if (shouldDiscardStoredUnit(units.value, lastUnit)) discardLastUnit()
    if (units.value.length === 0) error.value = 'Nenhuma unidade está disponível para acesso.'
  } catch {
    error.value = 'Não foi possível carregar as unidades. O login está indisponível.'
  } finally {
    unitsLoading.value = false
  }
})

async function handleLogin() {
  error.value = ''
  registrationNotice.value = ''

  if (!username.value.trim()) {
    error.value = `Por favor, informe seu ${usernameLabel.value}.`
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
    rememberLastUnit(selectedUnit.value)
    router.push('/')
  } catch (err) {
    error.value = err.message || 'Erro ao conectar ao serviço de autenticação.'
  } finally {
    isLoading.value = false
  }
}

function clearRegistrationPasswords() {
  registrationForm.value.senha = ''
  registrationForm.value.confirmarSenha = ''
}

function openExternalRegistration() {
  if (!isExternalUnitSelected.value) return
  registrationError.value = ''
  registrationNotice.value = ''
  isRegistrationOpen.value = true
}

function closeExternalRegistration() {
  if (registrationLoading.value) return
  isRegistrationOpen.value = false
  registrationError.value = ''
  clearRegistrationPasswords()
}

async function handleExternalRegistration() {
  registrationError.value = ''
  const validation = validateExternalRegistration({
    ...registrationForm.value,
    unidade: selectedUnit.value,
  })
  if (!validation.valid) {
    registrationError.value = firstExternalRegistrationError(validation)
    return
  }

  registrationLoading.value = true
  try {
    await registerExternalUser(authApi, {
      ...registrationForm.value,
      unidade: selectedUnit.value,
    })
    username.value = registrationForm.value.usuario.trim()
    isRegistrationOpen.value = false
    clearRegistrationPasswords()
    registrationNotice.value = 'Cadastro concluído. Agora entre normalmente com seu usuário e senha.'
  } catch (registrationRequestError) {
    registrationError.value = registrationRequestError.validation
      ? firstExternalRegistrationError(registrationRequestError.validation)
      : externalRegistrationErrorMessage(registrationRequestError)
  } finally {
    registrationLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 p-4">
    
    <div class="bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-5xl flex flex-col md:flex-row min-h-[620px]">
      
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

           <div v-if="isSelectedUnitLegacy" class="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 px-3 py-1.5 rounded-full text-xs text-indigo-200">
             <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
             Integrado ao Portal Unix
           </div>
        </div>

        <div class="relative z-10 text-sm text-indigo-300/60 font-medium pt-8">
          &copy; 2026 Grupo DASS - Equipe de Desenvolvimento SEST v2.0
        </div>
      </div>

      <div class="md:w-1/2 p-10 md:p-12 flex flex-col justify-between bg-white relative">
        <div class="max-w-md mx-auto w-full my-auto">
          <h2 class="text-3xl font-bold text-gray-900 mb-2">Bem-vindo de volta</h2>
          <p class="text-gray-500 mb-6">{{ credentialsHint }}</p>

          <div v-if="registrationNotice" class="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700" role="status">
            {{ registrationNotice }}
          </div>

          <form @submit.prevent="handleLogin" class="space-y-4">
            <div class="space-y-1">
              <label class="text-xs font-bold text-gray-600 uppercase tracking-wider">Unidade</label>
              <select
                v-model="selectedUnit"
                :disabled="unitsLoading || units.length === 0"
                class="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 font-medium disabled:opacity-60"
                required
              >
                <option value="" disabled>{{ unitsLoading ? 'Carregando unidades...' : 'Selecione uma unidade' }}</option>
                <option v-for="unit in units" :key="unit.code" :value="unit.code">
                  {{ unit.code }} — {{ unit.name }}
                </option>
              </select>
            </div>
            
            <div class="space-y-1">
              <label class="text-xs font-bold text-gray-600 uppercase tracking-wider">{{ usernameLabel }}</label>
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

            <div v-if="error" class="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-bold animate-shake">
              <AlertTriangle class="w-5 h-5 shrink-0" /> 
              <span>{{ error }}</span>
            </div>

            <button 
              type="submit" 
              :disabled="isLoading || unitsLoading || units.length === 0"
              class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-xl shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              <span v-if="!isLoading">Acessar Sistema</span>
              <span v-else>Autenticando...</span>
              <ArrowRight v-if="!isLoading" class="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div v-if="isExternalUnitSelected" class="mt-5 text-center">
            <button
              type="button"
              @click="openExternalRegistration"
              class="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              <UserPlus class="h-4 w-4" />
              Realizar cadastro
            </button>
          </div>

          <div v-if="isSelectedUnitLegacy" class="mt-6 border-t border-gray-100 pt-5 text-center">
            <p class="text-xs text-gray-500 mb-2">
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

    <div
      v-if="isRegistrationOpen"
      class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="external-registration-title"
      @click.self="closeExternalRegistration"
      @keydown.esc="closeExternalRegistration"
    >
      <div class="my-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" @click.stop>
        <div class="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 id="external-registration-title" class="text-xl font-bold text-slate-900">Realizar cadastro</h2>
            <p class="mt-1 text-sm text-slate-500">Crie seu acesso para a unidade selecionada.</p>
          </div>
          <button
            type="button"
            aria-label="Fechar cadastro"
            :disabled="registrationLoading"
            @click="closeExternalRegistration"
            class="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X class="h-5 w-5" />
          </button>
        </div>

        <form class="space-y-4 px-6 py-6" @submit.prevent="handleExternalRegistration">
          <div class="space-y-1">
            <label for="registration-unit" class="text-xs font-bold uppercase tracking-wider text-gray-600">Unidade</label>
            <input
              id="registration-unit"
              :value="selectedUnitLabel"
              type="text"
              readonly
              disabled
              class="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-600 outline-none disabled:cursor-not-allowed disabled:opacity-80"
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1">
              <label for="registration-matricula" class="text-xs font-bold uppercase tracking-wider text-gray-600">Matrícula</label>
              <input
                id="registration-matricula"
                v-model="registrationForm.matricula"
                type="text"
                autocomplete="off"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div class="space-y-1">
              <label for="registration-name" class="text-xs font-bold uppercase tracking-wider text-gray-600">Nome</label>
              <input
                id="registration-name"
                v-model="registrationForm.nome"
                type="text"
                autocomplete="name"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          <div class="space-y-1">
            <label for="registration-username" class="text-xs font-bold uppercase tracking-wider text-gray-600">Usuário</label>
            <input
              id="registration-username"
              v-model="registrationForm.usuario"
              type="text"
              autocomplete="username"
              class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1">
              <label for="registration-password" class="text-xs font-bold uppercase tracking-wider text-gray-600">Senha</label>
              <input
                id="registration-password"
                v-model="registrationForm.senha"
                type="password"
                autocomplete="new-password"
                minlength="8"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div class="space-y-1">
              <label for="registration-password-confirmation" class="text-xs font-bold uppercase tracking-wider text-gray-600">Confirmar senha</label>
              <input
                id="registration-password-confirmation"
                v-model="registrationForm.confirmarSenha"
                type="password"
                autocomplete="new-password"
                minlength="8"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1">
              <label for="registration-sector" class="text-xs font-bold uppercase tracking-wider text-gray-600">Setor <span class="font-normal normal-case text-gray-400">(opcional)</span></label>
              <input
                id="registration-sector"
                v-model="registrationForm.setor"
                type="text"
                autocomplete="organization-title"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div class="space-y-1">
              <label for="registration-function" class="text-xs font-bold uppercase tracking-wider text-gray-600">Função <span class="font-normal normal-case text-gray-400">(opcional)</span></label>
              <input
                id="registration-function"
                v-model="registrationForm.funcao"
                type="text"
                autocomplete="organization-title"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div v-if="registrationError" class="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-600" role="alert">
            <AlertTriangle class="h-5 w-5 shrink-0" />
            <span>{{ registrationError }}</span>
          </div>

          <div class="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              :disabled="registrationLoading"
              @click="closeExternalRegistration"
              class="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :disabled="registrationLoading"
              class="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span v-if="registrationLoading" class="animate-spin">⏳</span>
              {{ registrationLoading ? 'Cadastrando...' : 'Concluir cadastro' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
.animate-shake { animation: shake 0.3s ease-in-out; }
</style>
