import { z } from 'zod';

export const SectorEnum = z.enum([
  'CORTE',
  'APOIO',
  'PRE_FABRICADO',
  'EXPEDICAO',
  'MONTAGEM',
  'CONFIGURACOES',
]);

export const ComponentTypeEnum = z.enum([
  'MATERIA_PRIMA',
  'PECA_CORTADA',
  'SOLADO',
  'CABEDAL',
  'PE_PRONTO',
]);

export const FootSideEnum = z.enum(['E', 'D']);

export const MovementTypeEnum = z.enum([
  'ENTRADA',
  'SAIDA',
  'TRANSFERENCIA',
  'REFUGO',
  'CASAMENTO_PAR',
  'EXCLUSAO_CONFIGURACAO',
  'EDICAO_CONFIGURACAO',
]);

// 🔹 1. CORTE: Matéria-Prima
export const CorteItemSchema = z.object({
  sector: z.literal('CORTE'),
  code: z.string().trim().min(1, 'Código da matéria-prima é obrigatório'),
  name: z.string().trim().min(1, 'Descrição/Nome é obrigatório'),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  unit: z.string().trim().default('UN'),
  type: z.string().trim().default('OUTROS'),
  minStock: z.coerce.number().min(0).default(0),
  location: z.string().trim().min(1, 'Prateleira/Localização é obrigatória'),
  observation: z.string().trim().optional().default(''),
});

// 🔹 2. APOIO: Peças Cortadas / Moldes
export const ApoioItemSchema = z.object({
  sector: z.literal('APOIO'),
  pieceCode: z.string().trim().min(1, 'Código do Molde/Peça é obrigatório'),
  description: z.string().trim().min(1, 'Descrição da peça é obrigatória'),
  materialColor: z.string().trim().min(1, 'Material e Cor são obrigatórios'),
  sizeGrade: z.string().trim().min(1, 'Grade/Numeração é obrigatória'),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  location: z.string().trim().min(1, 'Prateleira/Localização é obrigatória'),
  observation: z.string().trim().optional().default(''),
});

// 🔹 3. PRÉ-FABRICADO: Solas por Produto
export const PreFabricadoItemSchema = z.object({
  sector: z.literal('PRE_FABRICADO'),
  productName: z.string().trim().min(1, 'Código do Produto/SKU é obrigatório'),
  color: z.string().trim().min(1, 'COMBINAÇÃO é obrigatória'),
  sizeGrade: z.string().trim().min(1, 'Grade/Numeração é obrigatória'),
  footSide: FootSideEnum.optional().nullable(),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  location: z.string().trim().min(1, 'Prateleira/Localização é obrigatória'),
  observation: z.string().trim().optional().default(''),
});

// 🔹 4. EXPEDIÇÃO: Cabedais por SKU
export const ExpedicaoItemSchema = z.object({
  sector: z.literal('EXPEDICAO'),
  sku: z.string().trim().min(1, 'Código do Produto/SKU é obrigatório'),
  color: z.string().trim().min(1, 'Combinação do cabedal é obrigatória'),
  sizeGrade: z.string().trim().min(1, 'Grade/Numeração é obrigatória'),
  footSide: FootSideEnum.optional().nullable(),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  location: z.string().trim().min(1, 'Prateleira/Localização é obrigatória'),
  observation: z.string().trim().optional().default(''),
});

// 🔹 5. MONTAGEM: Pés Prontos / Órfãos
export const MontagemItemSchema = z.object({
  sector: z.literal('MONTAGEM'),
  sku: z.string().trim().min(1, 'Código do Produto/SKU é obrigatório'),
  sizeGrade: z.string().trim().min(1, 'Grade/Numeração é obrigatória'),
  footSide: FootSideEnum,
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  location: z.string().trim().min(1, 'Prateleira/Localização é obrigatória'),
  observation: z.string().trim().optional().default(''),
});

// 🌟 Discriminated Union dos 5 Setores
export const StockItemUnionSchema = z.discriminatedUnion('sector', [
  CorteItemSchema,
  ApoioItemSchema,
  PreFabricadoItemSchema,
  ExpedicaoItemSchema,
  MontagemItemSchema,
]);

// 📦 Cadastro em Lote
export const BatchCreateStockItemSchema = z.object({
  items: z.array(StockItemUnionSchema).min(1, 'Ao menos um item deve ser informado no lote'),
});

// 👞 Casamento de Pares Multi-Setor (Montagem, Solas, Cabedais)
export const ExecuteMatchSchema = z.object({
  leftStockItemId: z.number().int().positive('ID do Pé Esquerdo é inválido'),
  rightStockItemId: z.number().int().positive('ID do Pé Direito é inválido'),
  quantity: z.coerce.number().positive('Quantidade a casar deve ser maior que zero'),
  sector: SectorEnum.optional().default('MONTAGEM'),
  reason: z.string().trim().optional().default('Casamento de par confirmado pelo operador'),
});

// 🔄 Movimentações de Entrada / Saída / Refugo / Transferência
export const CreateStockMovementSchema = z.object({
  stockItemId: z.number().int().positive('ID do item de estoque é obrigatório'),
  type: z.enum(['ENTRADA', 'SAIDA', 'REFUGO', 'TRANSFERENCIA']),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  locationId: z.number().int().positive().optional(),
  destinationLocationId: z.number().int().positive().optional(),
  origem: z.string().trim().optional().default(''),
  reason: z.string().trim().optional().default(''),
});

// 🔍 Filtro de Histórico de Movimentações
export const MovementHistoryFilterSchema = z.object({
  sector: SectorEnum.optional(),
  stockItemId: z.coerce.number().int().positive().optional(),
  operatorId: z.string().trim().optional(),
  type: MovementTypeEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Tipos Inferidos
export type CorteItemDTO = z.infer<typeof CorteItemSchema>;
export type ApoioItemDTO = z.infer<typeof ApoioItemSchema>;
export type PreFabricadoItemDTO = z.infer<typeof PreFabricadoItemSchema>;
export type ExpedicaoItemDTO = z.infer<typeof ExpedicaoItemSchema>;
export type MontagemItemDTO = z.infer<typeof MontagemItemSchema>;
export type StockItemUnionDTO = z.infer<typeof StockItemUnionSchema>;
export type BatchCreateStockItemDTO = z.infer<typeof BatchCreateStockItemSchema>;
export type ExecuteMatchDTO = z.infer<typeof ExecuteMatchSchema>;
export type CreateStockMovementDTO = z.infer<typeof CreateStockMovementSchema>;
export type MovementHistoryFilterDTO = z.infer<typeof MovementHistoryFilterSchema>;

export interface OperatorContext {
  factoryUnitId: number;
  operatorId?: string | null;
  operatorName?: string | null;
}
