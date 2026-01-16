export interface User {
  id: string
  nome: string
  email: string
  role: 'admin' | 'operador'
}

export interface Material {
  id: string
  codigo: string
  descricao: string
  tipo: 'madeira' | 'chapa_metalica' | 'plastico' | 'vidro' | 'outro'
  quantidade: number
  unidade: 'kg' | 'm' | 'm2' | 'unidade'
  localizacao: string
  observacoes?: string
  data_entrada: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  material_id: string
  tipo: 'entrada' | 'saida'
  quantidade: number
  observacoes?: string
  usuario_id: string
  usuario_nome: string
  created_at: string
  material_codigo?: string
  material_descricao?: string
}

export interface Stats {
  total_materials: number
  low_stock_count: number
  today_transactions: number
  total_entradas: number
  total_saidas: number
}

export type MaterialTipo = 'madeira' | 'chapa_metalica' | 'plastico' | 'vidro' | 'outro'
export type MaterialUnidade = 'kg' | 'm' | 'm2' | 'unidade'
export type TransactionTipo = 'entrada' | 'saida'
export type UserRole = 'admin' | 'operador'
