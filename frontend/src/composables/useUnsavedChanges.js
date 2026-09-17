import { onMounted, onUnmounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ref } from 'vue';

const pendingForms = new Set();
const message = 'Há alterações não salvas. Deseja descartá-las e continuar?';
let pendingConfirmation = null;
let resolveConfirmation = null;
let dialogHostCount = 0;

export const unsavedChangesDialog = ref({
  show: false,
  title: 'Descartar alterações?',
  message,
});

export function requestDiscardConfirmation() {
  // Component tests and standalone form mounts may not have the application
  // shell that renders the shared modal. The real application registers its
  // Layout host, so this fallback is not used during normal navigation.
  if (dialogHostCount === 0) return window.confirm(message);
  if (pendingConfirmation) return pendingConfirmation;

  pendingConfirmation = new Promise((resolve) => {
    resolveConfirmation = resolve;
    unsavedChangesDialog.value = {
      show: true,
      title: 'Descartar alterações?',
      message,
    };
  });

  return pendingConfirmation;
}

export function registerUnsavedChangesHost() {
  dialogHostCount += 1;
  return () => { dialogHostCount = Math.max(0, dialogHostCount - 1); };
}

export function resolveUnsavedChanges(confirmed) {
  const resolve = resolveConfirmation;
  resolveConfirmation = null;
  pendingConfirmation = null;
  unsavedChangesDialog.value = {
    ...unsavedChangesDialog.value,
    show: false,
  };
  resolve?.(Boolean(confirmed));
}

export function confirmPendingChanges() {
  if (![...pendingForms].some((isDirty) => isDirty())) return true;
  return requestDiscardConfirmation();
}

export function useUnsavedChanges(isDirty) {
  const confirmDiscard = () => !isDirty() || requestDiscardConfirmation();
  const beforeUnload = (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  onBeforeRouteLeave(() => confirmDiscard());
  onMounted(() => {
    pendingForms.add(isDirty);
    window.addEventListener('beforeunload', beforeUnload);
  });
  onUnmounted(() => {
    pendingForms.delete(isDirty);
    window.removeEventListener('beforeunload', beforeUnload);
  });
  return { confirmDiscard };
}
