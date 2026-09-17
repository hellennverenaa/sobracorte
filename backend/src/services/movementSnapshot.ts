type SnapshotItem = {
  sector?: string;
  sku?: string | null; code?: string | null; pieceCode?: string | null;
  description?: string | null; name?: string | null; productName?: string | null;
  type?: string | null; componentType?: string | null; unit?: string | null;
  sizeGrade?: string | null; footSide?: string | null; color?: string | null; materialColor?: string | null;
};

export function movementSnapshot(item: SnapshotItem) {
  return {
    itemCode: item.sku || item.pieceCode || item.code || item.productName || '',
    itemName: item.description || item.name || item.productName || '',
    itemCategory: item.type || item.componentType || '',
    itemUnit: item.unit || '',
    itemModelName: item.productName || '',
    itemSizeGrade: item.sizeGrade || '',
    itemFootSide: item.footSide || '',
    itemColor: (item.sector === 'APOIO' ? item.materialColor : item.color) || '',
  };
}
