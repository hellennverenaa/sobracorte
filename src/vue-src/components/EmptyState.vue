<script setup lang="ts">
import type { Component } from 'vue'

interface Props {
  icon: Component
  title: string
  description?: string
  action?: {
    label: string
  }
}

defineProps<Props>()
defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="text-center py-16">
    <div class="flex justify-center mb-4">
      <div class="bg-gray-100 p-6 rounded-full">
        <component :is="icon" class="w-12 h-12 text-gray-400" />
      </div>
    </div>
    <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ title }}</h3>
    <p v-if="description" class="text-gray-600 text-sm mb-6 max-w-sm mx-auto">
      {{ description }}
    </p>
    <button
      v-if="action"
      @click="$emit('action')"
      class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
    >
      {{ action.label }}
    </button>
  </div>
</template>
