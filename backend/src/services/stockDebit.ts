import { Prisma } from '../generated/prisma';
import { requiresIntegerQuantity } from '../utils/unitHelper';

type ItemWithLocations = Prisma.StockItemGetPayload<{ include: { locations: { include: { location: true } } } }>;

/** A transação chamadora deve bloquear a unidade antes de ler o item. */
export async function debitStockItem(tx: Prisma.TransactionClient, item: ItemWithLocations, quantity: number, locationId?: number) {
  const amount = new Prisma.Decimal(quantity);
  if (!amount.isPositive() || amount.decimalPlaces() > 3 || (requiresIntegerQuantity(item.unit, item.sector) && !amount.isInteger())) {
    throw new Error('Quantidade inválida para o setor ou precisão superior a três casas decimais.');
  }
  const locationTotal = item.locations.reduce((sum, link) => sum.plus(link.quantity), new Prisma.Decimal(0));
  if (!locationTotal.equals(item.quantity) || item.locations.some(link => new Prisma.Decimal(link.quantity).isNegative())) {
    throw new Error('O saldo do item diverge das localizações. Regularize o estoque antes da baixa.');
  }
  const locations = item.locations.filter(link => locationId === undefined || link.locationId === locationId)
    .sort((a, b) => a.locationId - b.locationId);
  if (locationId !== undefined && !locations.length) throw new Error('A localização informada não contém este item de estoque.');
  let remaining = amount;
  const debits = [];
  for (const link of locations) {
    if (remaining.isZero()) break;
    const debit = Prisma.Decimal.min(link.quantity, remaining);
    if (!debit.isPositive()) continue;
    debits.push({ locationId: link.locationId, locationName: link.location.name, quantity: debit });
    remaining = remaining.minus(debit);
  }
  if (!remaining.isZero()) throw new Error('Saldo insuficiente nas localizações selecionadas para realizar a baixa.');
  const updated = await tx.stockItem.updateMany({
    where: { id: item.id, factoryUnitId: item.factoryUnitId, quantity: { gte: amount } },
    data: { quantity: { decrement: amount } },
  });
  if (updated.count !== 1) throw new Error('Saldo total insuficiente para realizar a baixa.');
  for (const debit of debits) {
    const updatedLocation = await tx.stockItemLocation.updateMany({
      where: { stockItemId: item.id, factoryUnitId: item.factoryUnitId, locationId: debit.locationId, quantity: { gte: debit.quantity } },
      data: { quantity: { decrement: debit.quantity } },
    });
    if (updatedLocation.count !== 1) throw new Error('O saldo da localização mudou. Tente novamente.');
  }
  return { debits, remainingQuantity: new Prisma.Decimal(item.quantity).minus(amount) };
}
