import { ref } from 'vue';

/**
 * Composable de modal de confirmação compartilhado.
 * Elimina a duplicação de `confirmState`, `openConfirmModal` e
 * `handleConfirmedAction` nas páginas do SobraCorte.
 *
 * @returns {{
 *   confirmState: import('vue').Ref<{
 *     show: boolean,
 *     title: string,
 *     message: string,
 *     confirmText: string,
 *     variant: 'danger' | 'warning' | 'info',
 *     loading: boolean,
 *     action: (() => Promise<void> | void) | null
 *   }>,
 *   openConfirmModal: (options: {
 *     title: string,
 *     message: string,
 *     confirmText?: string,
 *     variant?: 'danger' | 'warning' | 'info',
 *     action?: () => Promise<void> | void
 *   }) => void,
 *   handleConfirmedAction: () => Promise<void>
 * }}
 */
export function useConfirmModal() {
  const confirmState = ref({
    show: false,
    title: '',
    message: '',
    confirmText: 'Excluir',
    variant: 'danger',
    loading: false,
    action: null,
  });

  function openConfirmModal({ title, message, confirmText = 'Excluir', variant = 'danger', action = null }) {
    confirmState.value = {
      show: true,
      title,
      message,
      confirmText,
      variant,
      loading: false,
      action,
    };
  }

  async function handleConfirmedAction() {
    if (typeof confirmState.value.action === 'function') {
      confirmState.value.loading = true;
      try {
        await confirmState.value.action();
      } finally {
        confirmState.value.loading = false;
        confirmState.value.show = false;
      }
    } else {
      confirmState.value.show = false;
    }
  }

  return { confirmState, openConfirmModal, handleConfirmedAction };
}
