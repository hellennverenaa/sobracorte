<script setup>
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const activeUnitKey = computed(() => authStore.user?.unit?.code || 'anonymous')
</script>

<template>
  <RouterView :key="activeUnitKey" />
</template>

<style>
/* Global styles já vêm do globals.css */
</style>
