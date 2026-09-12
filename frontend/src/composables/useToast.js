import { ref } from 'vue';

/**
 * Composable de notificações (Toast) compartilhado.
 * Elimina a duplicação de `notification` e `showNotification`
 * que estava copiada em Materials.vue, Movement.vue, Reports.vue,
 * Settings.vue, Users.vue e Profile.vue.
 *
 * Uso:
 *   import { useToast } from '@/composables/useToast';
 *   const { notification, showNotification } = useToast();
 *
 * Template (adicionar uma única vez no Layout.vue ou App.vue, ou usar localmente):
 *   <div v-if="notification.show" :class="notification.type === 'success'
 *     ? 'bg-green-100 border-green-400 text-green-700'
 *     : 'bg-red-100 border-red-400 text-red-700'"
 *     class="fixed top-4 right-4 px-4 py-3 rounded border shadow-lg z-50 flex items-center transition-all duration-300">
 *     <span class="font-medium">{{ notification.message }}</span>
 *   </div>
 */
export function useToast(durationMs = 3000) {
  const notification = ref({ show: false, type: '', message: '' });
  let timer = null;

  function showNotification(type, message) {
    if (timer) clearTimeout(timer);
    notification.value = { show: true, type, message };
    timer = setTimeout(() => {
      notification.value.show = false;
    }, durationMs);
  }

  function showSuccess(message) {
    showNotification('success', message);
  }

  function showError(message) {
    showNotification('error', message);
  }

  return { notification, showNotification, showSuccess, showError };
}
