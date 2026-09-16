<template>
  <nav class="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit flex-wrap" aria-label="Seções de configurações">
    <button v-for="tab in tabs" :key="tab.key" type="button"
      :aria-current="activeTab === tab.key ? 'page' : undefined"
      @click="$emit('update:activeTab', tab.key)"
      class="px-5 py-2 rounded-lg text-sm font-bold transition-all"
      :class="activeTab === tab.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
      <component :is="tab.icon" class="w-4 h-4 inline mr-1.5 -mt-0.5" aria-hidden="true" />
      {{ tab.label }}
    </button>
  </nav>
</template>

<script setup>
defineProps({ tabs: { type: Array, required: true }, activeTab: { type: String, required: true } })
defineEmits(['update:activeTab'])
</script>
