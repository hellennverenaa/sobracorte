<script setup>
defineProps({ notification: { type: Object, required: true } });
</script>

<template>
  <div v-if="notification.show" :role="notification.type === 'error' ? 'alert' : 'status'" aria-live="polite"
    class="fixed right-6 top-6 z-[100] rounded-xl px-5 py-3 text-sm font-bold shadow-lg"
    :class="notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'">
    {{ notification.message }}
  </div>
</template>
