export const DEFAULT_MEASUREMENT_UNITS = [
  { name: 'Metro', symbol: 'm' },
  { name: 'Metro Quadrado', symbol: 'm²' },
  { name: 'Quilograma', symbol: 'kg' },
  { name: 'Grama', symbol: 'g' },
  { name: 'Unidade', symbol: 'un' },
  { name: 'Par', symbol: 'par' },
  { name: 'Rolo', symbol: 'rolo' },
  { name: 'Centímetro', symbol: 'cm' },
  { name: 'Litro', symbol: 'l' },
  { name: 'Caixa', symbol: 'cx' },
] as const;

export const DEFAULT_ORIGINS = [
  'Consumo',
  'Devolução de Produção',
  'Dublagem / Tirada',
  'Erro de Enfesto/Corte',
  'Ganho no Rolo do Material',
  'Outros',
  'Retalho Aproveitável',
  'Sobra de Requisição',
] as const;
