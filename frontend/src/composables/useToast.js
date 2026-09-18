import { ref } from 'vue';

/**
 * Composable de notificações (Toast) compartilhado.
 * Elimina a duplicação de `notification` e `showNotification`
 * nas páginas do SobraCorte.
 *
 * @param {number} durationMs Duração padrão de exibição em milissegundos (default: 3000ms)
 * @returns {{
 *   notification: import('vue').Ref<{ show: boolean, type: string, message: string }>,
 *   showNotification: (type: string, message: string) => void,
 *   showToast: (message: string, type?: string) => void
 * }}
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

  function showToast(message, type = 'success') {
    showNotification(type, message);
  }

  return { notification, showNotification, showToast };
}
