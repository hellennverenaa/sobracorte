<script setup>
import PageState from './PageState.vue'

defineProps({
  loading: Boolean,
  error: { type: String, default: '' },
  empty: Boolean,
  lastUpdated: { type: [Date, String, Number], default: null },
})
const emit = defineEmits(['retry'])
</script>

<template>
  <PageState :loading="loading" :error="error" :empty="empty" empty-message="Nenhum indicador disponível." @retry="emit('retry')" />
  <p v-if="lastUpdated && !error" class="text-[10px] text-slate-400" aria-live="polite">
    Última atualização: {{ new Date(lastUpdated).toLocaleString('pt-BR') }}
  </p>
</template>
