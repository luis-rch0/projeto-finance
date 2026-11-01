import type { SQLiteDatabase } from 'expo-sqlite';
import { AnalyticsRepository, type AnalyticsMonth } from '@/database/repositories/analyticsRepository';
import { TransactionRepository } from '@/database/repositories/transactionRepository';
import { BudgetRepository } from '@/database/repositories/budgetRepository';
import { monthKey } from '@/utils/date';
import { budgetLevel, percentChange, sharePercent, type BudgetLevel } from '@/utils/analytics';

export interface CategoryInsight {
  id: string;
  name: string;
  color: string;
  icon: string;
  amountCents: number;
  count: number;
  percent: number;
}
export interface BudgetInsight {
  id: string;
  categoryId: string;
  categoryName: string;
  spentCents: number;
  limitCents: number;
  percent: number;
  level: BudgetLevel;
}
export interface AnalyticsSnapshot {
  current: AnalyticsMonth;
  previous: AnalyticsMonth;
  trend: AnalyticsMonth[];
  differenceCents: number;
  incomeChangePercent: number | null;
  expenseChangePercent: number | null;
  expenseToIncomePercent: number | null;
  expenseCategories: CategoryInsight[];
  otherExpenseCents: number;
  budgetWarnings: BudgetInsight[];
}

/** Camada única para alimentar a aba de Análises; nenhuma consulta SQL nas telas. */
export class AnalyticsService {
  private readonly analytics: AnalyticsRepository;
  private readonly transactions: TransactionRepository;
  private readonly budgets: BudgetRepository;

  constructor(db: SQLiteDatabase) {
    this.analytics = new AnalyticsRepository(db);
    this.transactions = new TransactionRepository(db);
    this.budgets = new BudgetRepository(db);
  }

  async load(year: number, month: number, months: 3 | 6 | 12 = 6): Promise<AnalyticsSnapshot> {
    const [withPrevious, categories, budgets] = await Promise.all([
      this.analytics.getMonthlyTrend(year, month, months + 1),
      this.transactions.getMonthlyCategoryTotals(year, month, 'EXPENSE'),
      this.budgets.findByMonth(monthKey(year, month)),
    ]);
    const current = withPrevious[withPrevious.length - 1];
    const previous = withPrevious[withPrevious.length - 2];
    const top = categories.slice(0, 5);
    const warnings = budgets
      .filter(row => row.limit_cents > 0)
      .map(row => ({
        id: row.id,
        categoryId: row.category_id,
        categoryName: row.category_name,
        spentCents: row.spent_cents,
        limitCents: row.limit_cents,
        percent: sharePercent(row.spent_cents, row.limit_cents),
        level: budgetLevel(row.spent_cents, row.limit_cents),
      }))
      .filter(row => row.level !== 'NORMAL')
      .sort((a, b) => b.percent - a.percent || a.categoryName.localeCompare(b.categoryName, 'pt-BR'));

    return {
      current,
      previous,
      trend: withPrevious.slice(1),
      differenceCents: current.incomeCents - current.expenseCents,
      incomeChangePercent: percentChange(current.incomeCents, previous.incomeCents),
      expenseChangePercent: percentChange(current.expenseCents, previous.expenseCents),
      expenseToIncomePercent: current.incomeCents === 0
        ? null : sharePercent(current.expenseCents, current.incomeCents),
      expenseCategories: top.map(row => ({
        id: row.id,
        name: row.name,
        color: row.color,
        icon: row.icon,
        amountCents: row.cents,
        count: row.count,
        percent: sharePercent(row.cents, current.expenseCents),
      })),
      otherExpenseCents: categories.slice(5).reduce((sum, row) => sum + row.cents, 0),
      budgetWarnings: warnings,
    };
  }
}
