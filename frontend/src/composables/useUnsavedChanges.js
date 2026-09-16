import { onMounted, onUnmounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

const pendingForms = new Set();
const message = 'Há alterações não salvas. Deseja descartá-las e continuar?';

export function confirmPendingChanges() {
  if (![...pendingForms].some((isDirty) => isDirty())) return true;
  return window.confirm(message);
}

export function useUnsavedChanges(isDirty) {
  const confirmDiscard = () => !isDirty() || window.confirm(message);
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
