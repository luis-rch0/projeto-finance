import type { SQLiteDatabase } from 'expo-sqlite';
import type { MonthlyBudget, MonthlyBudgetProgress } from '@/types/finance';
import { monthBounds } from '@/utils/date';

export interface BudgetRule {
  id: string;
  category_id: string;
  start_month: string;
  limit_cents: number;
  enabled: number;
  created_at: string;
}

export class BudgetRepository {
  constructor(private db: SQLiteDatabase) {}

  findByCategoryAndMonth(categoryId: string, month: string): Promise<MonthlyBudget | null> {
    return this.db.getFirstAsync<MonthlyBudget>(
      'SELECT * FROM monthly_budgets WHERE category_id=? AND month=?', [categoryId, month],
    );
  }

  async upsert(budget: MonthlyBudget): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO monthly_budgets (id,category_id,month,limit_cents,created_at,updated_at)
       VALUES (?,?,?,?,?,?) ON CONFLICT(category_id,month) DO UPDATE
       SET limit_cents=excluded.limit_cents,updated_at=excluded.updated_at`,
      [budget.id, budget.category_id, budget.month, budget.limit_cents, budget.created_at, budget.updated_at],
    );
  }

  /** Regra versionada por mês. Não altera os orçamentos dos meses anteriores. */
  async saveRule(rule: BudgetRule): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO budget_recurrence_rules (id,category_id,start_month,limit_cents,enabled,created_at)
       VALUES (?,?,?,?,?,?) ON CONFLICT(category_id,start_month) DO UPDATE
       SET limit_cents=excluded.limit_cents,enabled=excluded.enabled`,
      [rule.id,rule.category_id,rule.start_month,rule.limit_cents,rule.enabled,rule.created_at],
    );
  }

  /** Busca limites mensais específicos e, na ausência deles, a regra válida do mês. */
  /** Limites representam consumo: compras no crédito entram na compra; faturas pagas não duplicam despesas. */
  async findByMonth(month: string): Promise<MonthlyBudgetProgress[]> {
    const [year, num] = month.split('-').map(Number);
    const [start, end] = monthBounds(year, num);
    return this.db.getAllAsync<MonthlyBudgetProgress>(`
      WITH recent_rule AS (
        SELECT r.* FROM budget_recurrence_rules r
        WHERE r.start_month<=? AND NOT EXISTS (
          SELECT 1 FROM budget_recurrence_rules later
          WHERE later.category_id=r.category_id AND later.start_month<=?
            AND later.start_month>r.start_month)
      ), effective AS (
        SELECT b.id,b.category_id,b.limit_cents,0 AS is_recurring
        FROM monthly_budgets b WHERE b.month=?
        UNION ALL
        SELECT r.id,r.category_id,r.limit_cents,1 AS is_recurring
        FROM recent_rule r WHERE r.enabled=1
          AND NOT EXISTS (SELECT 1 FROM monthly_budgets b WHERE b.category_id=r.category_id AND b.month=?)
      )
      SELECT e.id,e.category_id,? AS month,e.limit_cents,e.is_recurring,c.name AS category_name,
        (COALESCE((SELECT SUM(t.amount_cents) FROM transactions t
          WHERE t.category_id=e.category_id AND t.type='EXPENSE' AND t.date>=? AND t.date<?
            AND NOT EXISTS (SELECT 1 FROM credit_card_invoice_payments pay WHERE pay.transaction_id=t.id)),0)
        + COALESCE((SELECT SUM(p.total_cents) FROM credit_card_purchases p
          WHERE p.category_id=e.category_id AND p.purchase_date>=? AND p.purchase_date<?),0)) AS spent_cents
      FROM effective e JOIN categories c ON c.id=e.category_id
      ORDER BY c.name COLLATE NOCASE`, [month,month,month,month,month,start,end,start,end]);
  }

  async findRuleForMonth(categoryId: string, month: string): Promise<BudgetRule | null> {
    return this.db.getFirstAsync<BudgetRule>(
      'SELECT * FROM budget_recurrence_rules WHERE category_id=? AND start_month<=? ORDER BY start_month DESC LIMIT 1',
      [categoryId,month],
    );
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.runAsync('DELETE FROM monthly_budgets WHERE id=?', [id]);
    if (!result.changes) throw new Error('Limite mensal não encontrado.');
  }
}
