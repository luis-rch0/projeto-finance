/** Cálculos sem efeito colateral. Valores financeiros permanecem em centavos. */
export type BudgetLevel = 'NORMAL' | 'NEAR' | 'EXCEEDED';

/** Sem base comparável, retorna null (em vez de inventar uma variação infinita). */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous < 0) {
    throw new Error('Totais financeiros inválidos.');
  }
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function sharePercent(amount: number, total: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(total) || amount < 0 || total < 0) {
    throw new Error('Totais financeiros inválidos.');
  }
  return total === 0 ? 0 : (amount / total) * 100;
}

export function budgetLevel(spentCents: number, limitCents: number): BudgetLevel {
  if (!Number.isSafeInteger(spentCents) || !Number.isSafeInteger(limitCents)
      || spentCents < 0 || limitCents <= 0) {
    throw new Error('Limite ou gasto inválido.');
  }
  if (spentCents > limitCents) return 'EXCEEDED';
  if (spentCents * 100 >= limitCents * 80) return 'NEAR';
  return 'NORMAL';
}

export function signedPercent(value: number | null): string {
  if (value === null) return 'Sem base anterior';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1).replace('.', ',')}%`;
}
