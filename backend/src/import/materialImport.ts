import { prisma } from '../prisma';
import { parseDecimal, ParsedMaterialRow } from './csvParser';

export type MaterialImportInput = {
  code: unknown;
  name: unknown;
  quantity: unknown;
  categoryId?: unknown;
  unitId?: unknown;
  locationId?: unknown;
  category?: unknown;
  unit?: unknown;
  location?: unknown;
  originId?: unknown;
  origin?: unknown;
  minStock?: unknown;
};

export type ImportLineError = { line: number; message: string };

export class ImportValidationError extends Error {
  constructor(public readonly errors: ImportLineError[]) {
    super('A importação contém dados inválidos. Nenhuma alteração foi aplicada.');
    this.name = 'ImportValidationError';
  }
}

type ResolvedInput = {
  line: number;
  code: string;
  name: string;
  quantity: string;
  minStock: string;
  categoryId: number;
  unitId: number;
  locationId: number;
  originId: number | null;
  originName: string | null;
  categoryName: string;
  unitSymbol: string;
  locationName: string;
};

function positiveId(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(String(value ?? ''));
  return Number.isInteger(number) && number > 0 ? number : null;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function decimal(value: unknown): string | null {
  return parseDecimal(String(value ?? ''));
}

function nameFor(value: unknown): string {
  return text(value).toLocaleUpperCase('pt-BR');
}

/**
 * Shared importer for CSV and JSON bulk uploads. It validates the entire batch,
 * resolves every domain value, and only then opens one transaction.
 * `prisma` is intentionally accessed through a narrow dynamic boundary because
 * this service is used while the Decimal/domain-ID schema is generated.
 */
export async function importMaterials(
  tenantId: number,
  inputs: MaterialImportInput[],
  user?: { matricula?: unknown; nome?: string; usuario?: string },
  client: any = prisma,
): Promise<{ inseridos: number; processados: number }> {
  const errors: ImportLineError[] = [];
  const normalized = inputs.map((input, index) => {
    const line = index + 1;
    const code = text(input.code);
    const name = text(input.name).toUpperCase();
    const quantity = decimal(input.quantity);
    const minStock = decimal(input.minStock ?? '0');
    if (!code) errors.push({ line, message: 'código obrigatório' });
    if (!name) errors.push({ line, message: 'descrição obrigatória' });
    if (quantity === null) errors.push({ line, message: 'quantidade deve ser decimal não negativa com até 3 casas' });
    if (minStock === null) errors.push({ line, message: 'estoque mínimo inválido' });
    return {
      line, code, name, quantity: quantity ?? '0.000', minStock: minStock ?? '0.000',
      categoryId: positiveId(input.categoryId), unitId: positiveId(input.unitId), locationId: positiveId(input.locationId),
      category: nameFor(input.category), unit: nameFor(input.unit), location: text(input.location),
      originId: positiveId(input.originId), origin: text(input.origin),
    };
  });

  const codes = normalized.map((item) => item.code).filter(Boolean);
  if (new Set(codes).size !== codes.length) {
    const seen = new Set<string>();
    normalized.forEach((item) => {
      if (!item.code || seen.has(item.code)) errors.push({ line: item.line, message: `código duplicado no arquivo: ${item.code}` });
      seen.add(item.code);
    });
  }
  if (errors.length > 0) throw new ImportValidationError(errors);

  const [categories, units, locations, origins, existing] = await Promise.all([
    client.categoryConfig.findMany({ where: { factoryUnitId: tenantId } }),
    client.unitConfig.findMany({ where: { factoryUnitId: tenantId, active: true } }),
    client.location.findMany({ where: { factoryUnitId: tenantId }, include: { categories: true } }),
    client.originConfig.findMany({ where: { factoryUnitId: tenantId } }),
    client.material.findMany({ where: { factoryUnitId: tenantId, code: { in: codes } }, select: { code: true } }),
  ]);
  const categoryByName = new Map<string, any>(categories.map((item: any) => [nameFor(item.name), item]));
  const unitBySymbol = new Map<string, any>(units.flatMap((item: any) => [[nameFor(item.symbol), item], [nameFor(item.name), item]]));
  const locationByName = new Map<string, any>(locations.map((item: any) => [nameFor(item.name), item]));
  const originByName = new Map<string, any>(origins.map((item: any) => [nameFor(item.name), item]));
  const existingCodes = new Set(existing.map((item: any) => item.code));

  const resolved: ResolvedInput[] = [];
  for (const item of normalized) {
    if (existingCodes.has(item.code)) errors.push({ line: item.line, message: `código já cadastrado: ${item.code}` });
    const category = item.categoryId ? categories.find((candidate: any) => candidate.id === item.categoryId) : categoryByName.get(item.category);
    const unit = item.unitId ? units.find((candidate: any) => candidate.id === item.unitId) : unitBySymbol.get(item.unit);
    const location = item.locationId ? locations.find((candidate: any) => candidate.id === item.locationId) : locationByName.get(nameFor(item.location));
    if (!category) errors.push({ line: item.line, message: `categoria não encontrada ou inativa: ${item.category || item.categoryId}` });
    if (!unit) errors.push({ line: item.line, message: `unidade não encontrada ou inativa: ${item.unit || item.unitId}` });
    if (!location) errors.push({ line: item.line, message: `localização não encontrada: ${item.location || item.locationId}` });
    if (category && location) {
      const compatible = (location.categories ?? []).some((link: any) => link.categoryId === category.id);
      if (!compatible) errors.push({ line: item.line, message: `localização incompatível com a categoria: ${location.name}` });
    }
    if (category && unit && category.unitLocked && category.defaultUnitId !== unit.id) {
      errors.push({ line: item.line, message: `a categoria exige a unidade ${category.defaultUnitId}` });
    }
    const origin = positiveId(item.originId)
      ? origins.find((candidate: any) => candidate.id === positiveId(item.originId))
      : originByName.get(nameFor(item.origin)) || originByName.get('OUTROS');
    if (Number(item.quantity) > 0 && !origin) errors.push({ line: item.line, message: 'origem "Outros" não está configurada para esta unidade' });
    if (category && unit && location && (origin || Number(item.quantity) === 0)) {
      resolved.push({ line: item.line, code: item.code, name: item.name, quantity: item.quantity, minStock: item.minStock, categoryId: category.id, unitId: unit.id, locationId: location.id, originId: origin?.id ?? null, originName: origin?.name ?? null, categoryName: category.name, unitSymbol: unit.symbol, locationName: location.name });
    }
  }
  if (errors.length > 0) throw new ImportValidationError(errors);

  await client.$transaction(async (tx: any) => {
    for (const item of resolved) {
      const material = await tx.material.create({
        data: {
          factoryUnitId: tenantId,
          code: item.code,
          name: item.name,
          quantity: item.quantity,
          categoryId: item.categoryId,
          unitId: item.unitId,
          minStock: item.minStock,
          observation: 'Importado via planilha de materiais CSV',
          locations: { create: { locationId: item.locationId, quantity: item.quantity } },
        },
      });
      if (Number(item.quantity) > 0) {
        await tx.movement.create({
          data: {
            materialId: material.id,
            factoryUnitId: tenantId,
            type: 'entrada',
            quantity: item.quantity,
            locationId: item.locationId,
            locationName: item.locationName,
            originId: item.originId,
            originName: item.originName,
            materialCode: item.code,
            materialName: item.name,
            materialCategory: item.categoryName,
            materialUnit: item.unitSymbol,
            reason: 'Saldo Inicial de Implantação',
            operatorId: user?.matricula == null ? null : String(user.matricula),
            operatorName: user?.nome || user?.usuario || 'Sistema / Implantação',
          },
        });
      }
    }
  });
  return { inseridos: resolved.length, processados: inputs.length };
}

export function csvRowsToImportInput(rows: ParsedMaterialRow[]): MaterialImportInput[] {
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    category: row.category,
    unit: row.unit,
    quantity: row.quantity,
    location: row.location,
  }));
}
