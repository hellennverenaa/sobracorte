<script setup>
defineProps({ loading: Boolean, error: String, empty: Boolean, emptyMessage: { type: String, default: 'Nenhum registro encontrado.' } });
defineEmits(['retry']);
</script>

<template>
  <div v-if="loading" role="status" aria-live="polite" class="p-6 text-center text-sm text-slate-500">Carregando…</div>
  <div v-else-if="error" role="alert" class="p-6 text-center text-sm text-red-700">
    <p>{{ error }}</p>
    <button type="button" class="mt-3 rounded-lg border border-red-300 px-4 py-2 font-bold" @click="$emit('retry')">Tentar novamente</button>
  </div>
  <div v-else-if="empty" role="status" class="p-6 text-center text-sm text-slate-500">{{ emptyMessage }}</div>
</template>
