export type MovementType = 'entrada' | 'saida';

export type MovementInput = {
  materialId: number;
  quantity: number;
  type: MovementType;
  location: string;
  origin: string | null;
  reason: string;
};

export class MovementRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function parseMovementInput(body: Record<string, unknown>): MovementInput {
  const materialId = Number(body.materialId ?? body.material_id);
  const quantity = Number(body.quantidade ?? body.quantity);
  const type = String(body.tipo ?? body.type ?? '').toLowerCase();
  const location = String(body.location ?? '').trim();
  const origin = body.origem ? String(body.origem).trim() : null;

  if (!Number.isInteger(materialId) || materialId <= 0) {
    throw new MovementRequestError('Material inválido.', 400);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new MovementRequestError('A quantidade deve ser um número maior que zero.', 400);
  }
  if (type !== 'entrada' && type !== 'saida') {
    throw new MovementRequestError('O tipo deve ser entrada ou saída.', 400);
  }
  if (!location) {
    throw new MovementRequestError('A localização é obrigatória.', 400);
  }
  if (type === 'entrada' && !origin) {
    throw new MovementRequestError('A origem é obrigatória para entradas.', 400);
  }

  return {
    materialId,
    quantity,
    type,
    location,
    origin: type === 'entrada' ? origin : null,
    reason: String(body.observacao ?? body.reason ?? '').trim(),
  };
}
