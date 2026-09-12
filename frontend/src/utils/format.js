/**
 * Utilitários de formatação compartilhados entre as páginas.
 * Elimina a redeclaração de formatNumber e formatDate em cada componente.
 */

/**
 * Formata um número para o padrão pt-BR com até 3 casas decimais.
 * @param {number|string} num
 * @returns {string}
 */
export function formatNumber(num) {
  return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/**
 * Formata uma data ISO ou objeto Date para DD/MM/YYYY HH:MM.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
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

/**
 * Formata uma data ISO ou objeto Date para DD/MM/YYYY (sem hora).
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateShort(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
