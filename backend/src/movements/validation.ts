export type MovementType = 'entrada' | 'saida';

export type MovementInput = {
  materialId: number;
  quantity: string;
  type: MovementType;
  location: string;
  locationId?: number | null;
  origin: string | null;
  originId?: number | null;
  reason: string;
};

export class MovementRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function parseMovementInput(body: Record<string, unknown>): MovementInput {
  const materialId = Number(body.materialId ?? body.material_id);
  const quantityRaw = String(body.quantidade ?? body.quantity ?? '').trim().replace(',', '.');
  const type = String(body.tipo ?? body.type ?? '').toLowerCase();
  const location = String(body.location ?? '').trim();
  const locationIdRaw = Number(body.locationId);
  const locationId = Number.isInteger(locationIdRaw) && locationIdRaw > 0 ? locationIdRaw : null;
  const origin = body.origem ? String(body.origem).trim() : null;
  const originIdRaw = Number(body.originId ?? body.origemId);
  const originId = Number.isInteger(originIdRaw) && originIdRaw > 0 ? originIdRaw : null;

  if (!Number.isInteger(materialId) || materialId <= 0) {
    throw new MovementRequestError('Material inválido.', 400);
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(quantityRaw) || quantityRaw.split('.')[0].length > 15 || !/[1-9]/.test(quantityRaw)) {
    throw new MovementRequestError('A quantidade deve ser um número maior que zero.', 400);
  }
  if (type !== 'entrada' && type !== 'saida') {
    throw new MovementRequestError('O tipo deve ser entrada ou saída.', 400);
  }
  if (!location && !locationId) {
    throw new MovementRequestError('A localização é obrigatória.', 400);
  }
  if (type === 'entrada' && !origin && !originId) {
    throw new MovementRequestError('A origem é obrigatória para entradas.', 400);
  }

  const normalized: MovementInput = {
    materialId,
    quantity: quantityRaw,
    type,
    location,
    origin: type === 'entrada' ? origin : null,
    reason: String(body.observacao ?? body.reason ?? '').trim(),
  };
  if (locationId !== null) normalized.locationId = locationId;
  if (originId !== null) normalized.originId = type === 'entrada' ? originId : null;
  return normalized;
}
