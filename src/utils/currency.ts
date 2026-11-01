const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatMoney(cents: number): string { return brl.format(cents / 100); }
export function parseMoney(input: string): number {
  const value = input.trim().replace(/\s/g, '');
  if (!/^(?:\d+(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/.test(value)) throw new Error('Informe um valor válido, como 25,90.');
  const [whole, decimal = ''] = value.replace(/\./g, '').split(',');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('O valor deve ser maior que zero.');
  return cents;
}
