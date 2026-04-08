<script setup>
import { ref } from 'vue'
import { authApi, api } from '../services/httpClient'
import { Database, Loader2, RefreshCw } from 'lucide-vue-next'

const isSeeding = ref(false)
const message = ref('')
const seedComplete = ref(false)

const API_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/make-server-ed830bfb`
const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

async function handleSeed() {
  isSeeding.value = true
  message.value = ''
try {
  // 1. axios.post recebe 3 parâmetros: (URL, Corpo_da_Requisicao, Configuracoes)
  // Como não estamos enviando nada no corpo, passamos null ou {}.
  const response = await api.post('/seed', null, {
    headers: {
      // Mantivemos a chave específica aqui. (Se a sua API já pegasse o token 
      // do usuário via interceptor, você nem precisaria dessa linha!)
      'Authorization': `Bearer ${publicAnonKey}` 
    }
  });

  // 2. Se a execução chegou nesta linha, é porque o status foi 200 (Sucesso garantido!)
  // O Axios já converteu o JSON, então usamos 'response.data'
  message.value = `✅ ${response.data.message}`;
  seedComplete.value = true;

} catch (error) {
  // 3. O Axios joga o "else" do response.ok direto aqui pro catch!
  // Ele guarda a resposta de erro do backend dentro de error.response.data
  const errorMessage = error.response?.data?.error || 'Erro interno ao popular banco de dados';
  
  message.value = `❌ Erro: ${errorMessage}`;
  console.error('Seed error:', error);

} finally {
  isSeeding.value = false;
}

function handleReload() {
  window.location.reload()
}
</script>

<template>
  <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
    <div class="flex items-start space-x-3">
      <Database class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <h4 class="font-semibold text-blue-900 mb-1">Primeira vez usando o sistema?</h4>
        <p class="text-sm text-blue-800 mb-3">
          Popule o banco de dados com 50 materiais de exemplo para começar a testar.
        </p>
        <div class="flex space-x-2">
          <button
            @click="handleSeed"
            :disabled="isSeeding || seedComplete"
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <template v-if="isSeeding">
              <Loader2 class="w-4 h-4 mr-2 animate-spin" />
              Populando...
            </template>
            <template v-else>
              Popular Banco de Dados
            </template>
          </button>
          <button
            v-if="seedComplete"
            @click="handleReload"
            class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center"
          >
            <RefreshCw class="w-4 h-4 mr-2" />
            Recarregar Página
          </button>
        </div>
        <p v-if="message" class="mt-2 text-sm font-medium text-blue-900">{{ message }}</p>
      </div>
    </div>
  </div>
</template>
