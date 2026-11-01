import type { MovementType } from '@/types/finance';
import type { SelectedMonth } from '@/components/finance/MonthSwitcher';

/** Valores vindos da URL não são confiáveis: validar antes de filtrar o banco. */
export function parseMovementRouteParams(input: { type?: string; year?: string; month?: string; categoryId?: string }): {
  type: MovementType; period: SelectedMonth; categoryId: string
} {
  const now = new Date();
  const year = Number(input.year);
  const month = Number(input.month);
  return {
    type: input.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
    period: {
      year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : now.getFullYear(),
      month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
    },
    categoryId: input.categoryId ?? '',
  };
}
