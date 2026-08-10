import { ref } from 'vue';

/**
 * Composable de modal de confirmação compartilhado.
 * Elimina a duplicação de `confirmState`, `openConfirmModal` e
 * `handleConfirmedAction` em Materials.vue, Settings.vue e Users.vue.
 *
 * Uso:
 *   import { useConfirmModal } from '@/composables/useConfirmModal';
 *   const { confirmState, openConfirmModal, handleConfirmedAction } = useConfirmModal();
 *
 * Template (usar junto com <ConfirmModal>):
 *   <ConfirmModal
 *     :show="confirmState.show"
 *     :title="confirmState.title"
 *     :message="confirmState.message"
 *     :confirm-text="confirmState.confirmText"
 *     :variant="confirmState.variant"
 *     :loading="confirmState.loading"
 *     @confirm="handleConfirmedAction"
 *     @cancel="confirmState.show = false"
 *   />
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

  function openConfirmModal({ title, message, confirmText = 'Excluir', variant = 'danger', action }) {
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
    }
  }

  return { confirmState, openConfirmModal, handleConfirmedAction };
}
