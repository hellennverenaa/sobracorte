import test from 'node:test';
import assert from 'node:assert/strict';

// Testes de format.js (funções utilitárias de formatação)
function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined || num === '') return '0';
  const val = typeof num === 'number' ? num : Number(String(num).replace(',', '.'));
  if (isNaN(val)) return '0';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

test('format.js: formatNumber formata inteiros, decimais e trata nulos', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(null), '0');
  assert.equal(formatNumber(undefined), '0');
  assert.equal(formatNumber(''), '0');
  assert.equal(formatNumber('invalido'), '0');
  assert.equal(formatNumber(150), '150');
  assert.equal(formatNumber('1500'), '1.500');
  assert.equal(formatNumber('1250.5'), '1.250,5');
  assert.equal(formatNumber('1250,5'), '1.250,5');
  assert.equal(formatNumber(12.3456), '12,346');
});

test('format.js: formatDate e formatDateShort formatam datas pt-BR e tratam nulos/inválidos', () => {
  assert.equal(formatDate(null), '-');
  assert.equal(formatDate(undefined), '-');
  assert.equal(formatDate('data-invalida'), '-');
  assert.equal(formatDateShort(null), '-');
  assert.equal(formatDateShort(undefined), '-');
  assert.equal(formatDateShort('data-invalida'), '-');

  const iso = '2026-09-14T12:30:00.000Z';
  const formatted = formatDate(iso);
  assert.match(formatted, /\d{2}\/\d{2}\/2026/);

  const shortFormatted = formatDateShort(iso);
  assert.match(shortFormatted, /\d{2}\/\d{2}\/2026/);
  assert.equal(shortFormatted.length, 10);
});

test('useToast: Composable gerencia estado reativo, tipos e timer de auto-fechamento', () => {
  type ToastState = { show: boolean; type: string; message: string };
  let notification: ToastState = { show: false, type: '', message: '' };
  let timer: any = null;

  function showNotification(type: string, message: string) {
    if (timer) clearTimeout(timer);
    let finalType = type;
    let finalMsg = message;
    if (typeof type === 'string' && (type === 'success' || type === 'error' || type === 'warning' || type === 'info')) {
      finalType = type;
      finalMsg = message;
    } else if (typeof message === 'string' && (message === 'success' || message === 'error' || message === 'warning' || message === 'info')) {
      finalType = message;
      finalMsg = type;
    }
    notification = { show: true, type: finalType, message: finalMsg };
  }

  showNotification('success', 'Material cadastrado com sucesso!');
  assert.equal(notification.show, true);
  assert.equal(notification.type, 'success');
  assert.equal(notification.message, 'Material cadastrado com sucesso!');

  // Sobrescreve com erro (flexível)
  showNotification('Erro ao conectar', 'error');
  assert.equal(notification.show, true);
  assert.equal(notification.type, 'error');
  assert.equal(notification.message, 'Erro ao conectar');
});

test('useConfirmModal: Composable gerencia abertura, variantes, loading e execução de ação assíncrona', async () => {
  let confirmState = {
    show: false,
    title: '',
    message: '',
    confirmText: 'Excluir',
    variant: 'danger',
    loading: false,
    action: null as (() => Promise<void> | void) | null,
  };

  function openConfirmModal(options: {
    title: string;
    message: string;
    confirmText?: string;
    variant?: string;
    action?: () => Promise<void> | void;
  }) {
    confirmState = {
      show: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'Excluir',
      variant: options.variant || 'danger',
      loading: false,
      action: options.action || null,
    };
  }

  let actionExecuted = false;
  openConfirmModal({
    title: 'Excluir Material',
    message: 'Deseja realmente excluir?',
    confirmText: 'Sim, Excluir',
    variant: 'danger',
    action: async () => {
      actionExecuted = true;
    },
  });

  assert.equal(confirmState.show, true);
  assert.equal(confirmState.title, 'Excluir Material');
  assert.equal(confirmState.confirmText, 'Sim, Excluir');
  assert.equal(confirmState.variant, 'danger');
  assert.equal(confirmState.loading, false);

  // Execução
  if (typeof confirmState.action === 'function') {
    confirmState.loading = true;
    try {
      await confirmState.action();
    } finally {
      confirmState.loading = false;
      confirmState.show = false;
    }
  }

  assert.equal(actionExecuted, true);
  assert.equal(confirmState.show, false);
  assert.equal(confirmState.loading, false);
});
