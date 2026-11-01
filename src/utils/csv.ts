/** CSV para Excel pt-BR: UTF-8 BOM, separador ; e números em reais com vírgula. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  let raw = value == null ? '' : String(value);
  // Evita que células importadas no Excel executem fórmulas externas.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(raw)) raw = `'${raw}`;
  return `"${raw.replace(/"/g, '""')}"`;
}
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return '\uFEFF' + rows.map(row => row.map(escapeCsvCell).join(';')).join('\r\n') + '\r\n';
}
export function centsAsBrazilianNumber(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Valor monetário inválido para CSV.');
  return `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents)/100)},${String(Math.abs(cents)%100).padStart(2,'0')}`;
}
