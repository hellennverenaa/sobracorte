<script setup>
import PageState from './PageState.vue'

defineProps({
  loading: Boolean,
  error: { type: String, default: '' },
  empty: Boolean,
  emptyMessage: { type: String, default: 'Nenhum relatório encontrado.' },
})
defineEmits(['retry'])
</script>

<template>
  <PageState :loading="loading" :error="error" :empty="empty" :empty-message="emptyMessage" @retry="$emit('retry')" />
</template>
