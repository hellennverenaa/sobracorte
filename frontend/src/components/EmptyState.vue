<script setup>
import { defineProps } from 'vue'

defineProps({
  icon: {
    // AQUI ESTÁ A CORREÇÃO: Aceita tanto Objeto quanto Função (ícone)
    type: [Object, Function], 
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  }
})

defineEmits(['action'])
</script>

<template>
  <div class="text-center py-12 px-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center">
    <div class="bg-blue-100 p-4 rounded-full mb-4">
      <component :is="icon" class="w-8 h-8 text-blue-600" />
    </div>
    <h3 class="text-lg font-medium text-gray-900 mb-1">{{ title }}</h3>
    <p v-if="description" class="text-gray-500 mb-6 max-w-sm">{{ description }}</p>
    
    <button 
      v-if="label"
      @click="$emit('action')"
      class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center"
    >
      {{ label }}
    </button>
  </div>
</template>