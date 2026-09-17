/**
 * Utilitários de formatação compartilhados entre as páginas do SobraCorte v2.0.
 * Elimina a redeclaração de formatNumber e formatDate em cada componente.
 */

/**
 * Formata um número para o padrão pt-BR com até 3 casas decimais.
 * @param {number|string} num
 * @returns {string}
 */
export function formatNumber(num) {
  if (num === null || num === undefined || num === '') return '0';
  const val = typeof num === 'number' ? num : Number(String(num).replace(',', '.'));
  if (isNaN(val)) return '0';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/**
 * Formata uma data ISO ou objeto Date para DD/MM/YYYY HH:MM.
 * @param {string|Date|null|undefined} date
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
