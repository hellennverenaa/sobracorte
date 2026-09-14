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
 *   showSuccess: (message: string) => void,
 *   showError: (message: string) => void,
 *   showWarning: (message: string) => void
 * }}
 */
export function useToast(durationMs = 3000) {
  const notification = ref({ show: false, type: '', message: '' });
  let timer = null;

  function showNotification(type, message) {
    if (timer) clearTimeout(timer);
    // Suporte a chamada flexível showNotification(message, type) ou showNotification(type, message)
    let finalType = type;
    let finalMsg = message;
    if (typeof type === 'string' && (type === 'success' || type === 'error' || type === 'warning' || type === 'info')) {
      finalType = type;
      finalMsg = message;
    } else if (typeof message === 'string' && (message === 'success' || message === 'error' || message === 'warning' || message === 'info')) {
      finalType = message;
      finalMsg = type;
    }
    notification.value = { show: true, type: finalType, message: finalMsg };
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

  function showWarning(message) {
    showNotification('warning', message);
  }

  return { notification, showNotification, showSuccess, showError, showWarning };
}
