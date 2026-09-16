import { nextTick, watch, onUnmounted } from 'vue';

export function useModalFocus(show, container, cancel) {
  let previousFocus;
  const controls = () => [...(container.value?.querySelectorAll(
    'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
  ) || [])].filter((el) => !el.hidden);
  const onKeydown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    if (event.key !== 'Tab') return;
    const nodes = controls();
    const first = nodes[0];
    const last = nodes.at(-1);
    if (!first) { event.preventDefault(); container.value?.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === container.value)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };
  const restore = () => {
    document.removeEventListener('keydown', onKeydown);
    previousFocus?.focus();
  };
  watch(show, async (visible) => {
    if (!visible) { restore(); return; }
    previousFocus = document.activeElement;
    await nextTick();
    if (!show()) return;
    (controls()[0] || container.value)?.focus();
    document.addEventListener('keydown', onKeydown);
  }, { immediate: true });
  onUnmounted(restore);
}
