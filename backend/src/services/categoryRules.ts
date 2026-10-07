import { validateUnit, validateQuantity, normalizeUnit } from '../utils/unitHelper';
import { StockCategoryError } from './stockIdentity';

export type CategoryRules = {
  name: string;
  defaultUnitCode?: string | null;
  entryMode: 'QUANTITY' | 'SIDE_PAIR';
};

export function validateCategoryRules(category: CategoryRules): string {
  if (!category.defaultUnitCode) throw new StockCategoryError('Defina a unidade de medida na categoria.');
  const unit = validateUnit(category.defaultUnitCode);
  if (!['QUANTITY', 'SIDE_PAIR'].includes(category.entryMode)) {
    throw new StockCategoryError('Modo de cadastro da categoria inválido.');
  }
  if (category.entryMode === 'SIDE_PAIR' && unit !== 'UN') {
    throw new StockCategoryError('O cadastro por lado/par exige unidade UN.');
  }
  return unit;
}

export function validateCategoryEntry(category: CategoryRules, item: { unit?: string | null; quantity: number; footSide?: string | null }, allowZero = false): string {
  const unit = validateCategoryRules(category);
  if (item.unit && normalizeUnit(item.unit) !== unit) {
    throw new StockCategoryError(`A categoria ${category.name} exige a unidade ${unit}.`);
  }
  if (category.entryMode === 'SIDE_PAIR') {
    if (!['E', 'D', 'PAR'].includes(item.footSide || '')) {
      throw new StockCategoryError('Selecione esquerdo, direito ou par para esta categoria.');
    }
  } else if (item.footSide) {
    throw new StockCategoryError('Esta categoria registra quantidade sem lado ou par.');
  }
  validateQuantity(item.quantity, unit, undefined, allowZero);
  return unit;
}
