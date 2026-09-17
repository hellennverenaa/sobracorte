/** Normaliza aliases sem converter setores desconhecidos em um setor válido. */
export function normalizeSector(value: string): string {
  const sector = value.trim().toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[ -]+/g, '_');
  return sector === 'CABEDAIS' || sector === 'EXPEDICAO' ? 'DISTRIBUICAO' : sector;
}
