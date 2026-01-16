<script setup lang="ts">
import type { Component } from 'vue'

interface Props {
  title: string
  value: number | string
  icon: Component
  color: string
  bgColor: string
  subtitle?: string
}

defineProps<Props>()
</script>

<template>
  <div class="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
    <div class="flex items-center justify-between">
      <div class="flex-1">
        <p class="text-sm font-medium text-gray-600 mb-1">{{ title }}</p>
        <p class="text-3xl font-bold text-gray-900">{{ value }}</p>
        <p v-if="subtitle" class="text-xs text-gray-500 mt-1">{{ subtitle }}</p>
      </div>
      <div :class="[bgColor, 'p-4 rounded-xl flex-shrink-0']">
        <component :is="icon" :class="['w-8 h-8', color]" />
      </div>
    </div>
  </div>
</template>
