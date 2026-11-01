import { validDate } from '@/utils/date';

/** Distribui centavos sem arredondar nem perder um centavo. */
export function allocateInstallments(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || !Number.isInteger(count) || count < 2 || count > 60 || totalCents < count) {
    throw new Error('Valor ou quantidade de parcelas inválidos (2 a 60, mínimo de R$ 0,01 por parcela).');
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** Preserva o dia pretendido; 31/01 passa a 28/02 (ou 29/02) sem deriva. */
export function addMonthsClamped(date: string, offset: number): string {
  if (!validDate(date) || !Number.isInteger(offset) || offset < 0 || offset > 60) throw new Error('Data da parcela inválida.');
  const [year, month, day] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const yearOut = first.getUTCFullYear();
  const monthOut = first.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(yearOut, monthOut, 0)).getUTCDate();
  return `${yearOut}-${String(monthOut).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
