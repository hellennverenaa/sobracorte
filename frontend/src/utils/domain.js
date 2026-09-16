export const SECTOR_OPTIONS = [
  { id: 'TODOS', label: 'Todos os Setores' },
  { id: 'CORTE', label: 'Corte (Matéria-Prima)', shortLabel: 'Corte' },
  { id: 'APOIO', label: 'Apoio (Moldes/Peças)', shortLabel: 'Apoio' },
  { id: 'PRE_FABRICADO', label: 'Pré-Fabricado (Solas)' },
  { id: 'DISTRIBUICAO', label: 'Distribuição' },
  { id: 'MONTAGEM', label: 'Montagem (Pés Órfãos)' },
  { id: 'CONSUMO', label: 'Consumo (Insumos)' },
];

export const ROLE_LABELS = {
  admin: 'Administrador', admin_setor: 'Administrador de setor',
  lider: 'Líder', movimentador: 'Movimentador', leitor: 'Leitor',
};

export function normalizeSector(sector) {
  const value = String(sector || 'TODOS').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ -]+/g, '_');
  if (['EXPEDICAO', 'CABEDAIS'].includes(value)) return 'DISTRIBUICAO';
  return SECTOR_OPTIONS.some((option) => option.id === value) ? value : 'TODOS';
}

export function requestErrorMessage(error, fallback = 'Não foi possível carregar os dados.') {
  const status = error?.response?.status;
  if (status === 403) return 'Você não tem permissão para esta operação.';
  if (status === 503 || !error?.response) return 'Serviço indisponível. Tente novamente.';
  return error.response.data?.error || error.response.data?.message || fallback;
}
