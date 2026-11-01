import type { RecurrenceFrequency } from '@/types/finance';
import { monthBounds, validDate } from '@/utils/date';

function atUTC(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}
function toISO(date: Date): string { return date.toISOString().slice(0, 10); }
function daysInMonth(year: number, month: number): number { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function clampDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, daysInMonth(year, month))).padStart(2, '0')}`;
}
/** Gera somente o mês solicitado; dias 29-31 são ajustados para o último dia de meses curtos. */
export function datesForMonth(startDate: string, endDate: string | null, frequency: RecurrenceFrequency, year: number, month: number): string[] {
  if (!validDate(startDate) || (endDate && !validDate(endDate))) throw new Error('Data da recorrência inválida.');
  const [start, after] = monthBounds(year, month);
  if (startDate >= after || (endDate && endDate < start)) return [];
  let dates: string[] = [];
  if (frequency === 'MONTHLY') {
    dates = [clampDate(year, month, Number(startDate.slice(8,10)))];
  } else if (frequency === 'YEARLY') {
    const originMonth = Number(startDate.slice(5,7));
    dates = originMonth === month ? [clampDate(year, month, Number(startDate.slice(8,10)))] : [];
  } else if (frequency === 'WEEKLY') {
    // Somente até cinco ocorrências por mês, sem percorrer todo o histórico.
    const first = atUTC(startDate);
    const firstMonthDate = atUTC(start);
    const dayDiff = Math.max(0, Math.ceil((firstMonthDate.getTime() - first.getTime()) / 86_400_000));
    const weeks = Math.ceil(dayDiff / 7);
    const cursor = atUTC(startDate);
    cursor.setUTCDate(cursor.getUTCDate() + weeks * 7);
    while (toISO(cursor) < after) {
      dates.push(toISO(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  } else throw new Error('Frequência inválida.');
  return dates.filter(date => date >= startDate && date >= start && date < after && (!endDate || date <= endDate));
}
