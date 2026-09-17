<script setup>
import { computed, watch } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useStockStore } from '@/stores/stockStore'

const authStore = useAuthStore()
const activeUnitKey = computed(() => authStore.user?.unit?.code || 'anonymous')
watch(activeUnitKey, () => useStockStore().resetUnitData(), { flush: 'sync' })
</script>

<template>
  <RouterView :key="activeUnitKey" />
</template>

<style>
/* Global styles já vêm do globals.css */
</style>
