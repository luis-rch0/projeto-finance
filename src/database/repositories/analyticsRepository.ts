import type { SQLiteDatabase } from 'expo-sqlite';
import { monthBounds, monthKey, stepMonth } from '@/utils/date';

export interface AnalyticsMonth {
  month: string;
  incomeCents: number;
  expenseCents: number;
  incomeCount: number;
  expenseCount: number;
}

interface MonthSql {
  month: string;
  income_cents: number;
  expense_cents: number;
  income_count: number;
  expense_count: number;
}

/** Somente transações confirmadas: previstos não participam dos totais. */
export class AnalyticsRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getMonthlyTrend(year: number, month: number, months: number): Promise<AnalyticsMonth[]> {
    if (!Number.isSafeInteger(months) || months < 1 || months > 24) {
      throw new Error('O período deve ter entre 1 e 24 meses.');
    }
    const current = monthBounds(year, month);
    const first = stepMonth(year, month, 1 - months);
    const [start] = monthBounds(first.year, first.month);
    const end = current[1];

    const rows = await this.db.getAllAsync<MonthSql>(
      `SELECT substr(date, 1, 7) AS month,
          COALESCE(SUM(CASE WHEN type='INCOME' THEN amount_cents ELSE 0 END), 0) AS income_cents,
          COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
          SUM(CASE WHEN type='INCOME' THEN 1 ELSE 0 END) AS income_count,
          SUM(CASE WHEN type='EXPENSE' THEN 1 ELSE 0 END) AS expense_count
       FROM transactions
       WHERE date >= ? AND date < ?
       GROUP BY substr(date, 1, 7)
       ORDER BY month ASC`,
      [start, end],
    );
    const found = new Map(rows.map(row => [row.month, row]));

    return Array.from({ length: months }, (_, index) => {
      const date = stepMonth(first.year, first.month, index);
      const key = monthKey(date.year, date.month);
      const row = found.get(key);
      return {
        month: key,
        incomeCents: row?.income_cents ?? 0,
        expenseCents: row?.expense_cents ?? 0,
        incomeCount: row?.income_count ?? 0,
        expenseCount: row?.expense_count ?? 0,
      };
    });
  }
}
