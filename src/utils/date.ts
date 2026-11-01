export function todayISO(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
export function monthBounds(year: number, month: number): [string, string] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Mês inválido.');
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return [`${year}-${String(month).padStart(2, '0')}-01`, `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`];
}
export function displayDate(date: string): string { const [y, m, d] = date.split('-'); return `${d}/${m}/${y}`; }

export function monthKey(year: number, month: number): string {
  return monthBounds(year, month)[0].slice(0, 7);
}
export function stepMonth(year: number, month: number, step: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + step, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
export function formatMonth(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
}
