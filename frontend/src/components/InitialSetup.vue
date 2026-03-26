<script setup>
import { ref } from 'vue'
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
    const response = await fetch(`${API_URL}/seed`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    })

    const data = await response.json()

    if (response.ok) {
      message.value = `✅ ${data.message}`
      seedComplete.value = true
    } else {
      message.value = `❌ Erro: ${data.error}`
    }
  } catch (error) {
    message.value = '❌ Erro ao popular banco de dados'
    console.error('Seed error:', error)
  } finally {
    isSeeding.value = false
  }
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
