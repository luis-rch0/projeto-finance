import type { SQLiteDatabase } from 'expo-sqlite';
import type { FinanceTransaction, MonthlySummary, MovementFilters, MovementType, TransactionDetail } from '@/types/finance';
import { monthBounds } from '@/utils/date';
const detailSql = `SELECT t.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
 FROM transactions t JOIN categories c ON c.id=t.category_id JOIN accounts a ON a.id=t.account_id`;
export class TransactionRepository {
  constructor(private db: SQLiteDatabase) {}
  async create(t: FinanceTransaction): Promise<void> {
    await this.db.runAsync(`INSERT INTO transactions (id,account_id,category_id,type,amount_cents,description,date,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, [t.id,t.account_id,t.category_id,t.type,t.amount_cents,t.description,t.date,t.created_at,t.updated_at]);
  }
  findAll(): Promise<TransactionDetail[]> {
    return this.db.getAllAsync<TransactionDetail>(
      `${detailSql} ORDER BY t.date DESC, t.created_at DESC`,
    );
  }

  findById(id: string): Promise<TransactionDetail | null> {
    return this.db.getFirstAsync<TransactionDetail>(`${detailSql} WHERE t.id = ?`, [id]);
  }

  findByMonth(year: number, month: number): Promise<TransactionDetail[]> {
    const [start, end] = monthBounds(year, month);
    return this.db.getAllAsync<TransactionDetail>(
      `${detailSql} WHERE t.date >= ? AND t.date < ? ORDER BY t.date DESC, t.created_at DESC`,
      [start, end],
    );
  }

  findByMonthAndType(year: number, month: number, type: MovementType): Promise<TransactionDetail[]> {
    const [start, end] = monthBounds(year, month);
    return this.db.getAllAsync<TransactionDetail>(
      `${detailSql} WHERE t.date >= ? AND t.date < ? AND t.type = ? ORDER BY t.date DESC, t.created_at DESC`,
      [start, end, type],
    );
  }

  /** Consulta enxuta para a aba principal: não carrega o histórico inteiro na memória. */
  async getMonthlyTypeOverview(year: number, month: number, type: MovementType): Promise<{ totalCents: number; count: number }> {
    const [start, end] = monthBounds(year, month);
    const row = await this.db.getFirstAsync<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(amount_cents),0) AS total, COUNT(*) AS count
       FROM transactions WHERE type=? AND date>=? AND date<?`,
      [type, start, end],
    );
    return { totalCents: row?.total ?? 0, count: row?.count ?? 0 };
  }

  findRecentByMonthAndType(year: number, month: number, type: MovementType, limit = 5): Promise<TransactionDetail[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('Limite inválido.');
    const [start, end] = monthBounds(year, month);
    return this.db.getAllAsync<TransactionDetail>(
      `${detailSql} WHERE t.type=? AND t.date>=? AND t.date<? ORDER BY t.date DESC,t.created_at DESC LIMIT ?`,
      [type, start, end, limit],
    );
  }

  getMonthlyCategoryTotals(year: number, month: number, type: MovementType): Promise<{
    id: string; name: string; color: string; icon: string; cents: number; count: number
  }[]> {
    const [start, end] = monthBounds(year, month);
    return this.db.getAllAsync<{ id: string; name: string; color: string; icon: string; cents: number; count: number }>(
      `SELECT c.id, c.name, c.color, c.icon,
              SUM(t.amount_cents) AS cents, COUNT(*) AS count
       FROM transactions t JOIN categories c ON c.id=t.category_id
       WHERE t.type=? AND t.date>=? AND t.date<?
       GROUP BY c.id, c.name, c.color, c.icon
       ORDER BY cents DESC, c.name COLLATE NOCASE`,
      [type, start, end],
    );
  }

  search(filters: MovementFilters): Promise<TransactionDetail[]> {
    const [start, end] = monthBounds(filters.year, filters.month);
    const where = ['t.type=?'];
    const args: (string | number)[] = [filters.type];
    if (filters.fromDate || filters.toDate) {
      if (filters.fromDate) { where.push('t.date>=?'); args.push(filters.fromDate); }
      if (filters.toDate) { where.push('t.date<=?'); args.push(filters.toDate); }
    } else {
      where.push('t.date>=?', 't.date<?'); args.push(start, end);
    }
    if (filters.search?.trim()) {
      const escaped = filters.search.trim().replace(/[\\%_]/g, '\\$&');
      where.push("t.description LIKE ? ESCAPE '\\'");
      args.push(`%${escaped}%`);
    }
    if (filters.categoryId) { where.push('t.category_id=?'); args.push(filters.categoryId); }
    if (filters.accountId) { where.push('t.account_id=?'); args.push(filters.accountId); }
    if (filters.minCents !== undefined) { where.push('t.amount_cents>=?'); args.push(filters.minCents); }
    if (filters.maxCents !== undefined) { where.push('t.amount_cents<=?'); args.push(filters.maxCents); }
    return this.db.getAllAsync<TransactionDetail>(
      `${detailSql} WHERE ${where.join(' AND ')} ORDER BY t.date DESC,t.created_at DESC`, args);
  }
  findRecent(limit = 5): Promise<TransactionDetail[]> {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error('Limite inválido.');
    }

    return this.db.getAllAsync<TransactionDetail>(
      `${detailSql} ORDER BY t.date DESC, t.created_at DESC LIMIT ?`,
      [limit],
    );
  }

  async update(transaction: FinanceTransaction): Promise<void> {
    const result = await this.db.runAsync(
      `UPDATE transactions
       SET account_id = ?, category_id = ?, type = ?, amount_cents = ?,
           description = ?, date = ?, updated_at = ?,
           payment_kind = CASE WHEN type <> ? THEN NULL ELSE payment_kind END,
           payment_card_id = CASE WHEN type <> ? THEN NULL ELSE payment_card_id END
       WHERE id = ?`,
      [
        transaction.account_id,
        transaction.category_id,
        transaction.type,
        transaction.amount_cents,
        transaction.description,
        transaction.date,
        transaction.updated_at,
        transaction.type,
        transaction.type,
        transaction.id,
      ],
    );

    if (!result.changes) {
      throw new Error('Movimentação não encontrada.');
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    if (!result.changes) {
      throw new Error('Movimentação não encontrada.');
    }
  }

  async getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
    const [start, end] = monthBounds(year, month);
    const row = await this.db.getFirstAsync<{ income: number; expense: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount_cents ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount_cents ELSE 0 END), 0) AS expense
       FROM transactions WHERE date >= ? AND date < ?`,
      [start, end],
    );

    return { incomeCents: row?.income ?? 0, expenseCents: row?.expense ?? 0 };
  }

  async getTotalDelta(): Promise<number> {
    const row = await this.db.getFirstAsync<{ delta: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount_cents ELSE -amount_cents END), 0) AS delta
       FROM transactions`,
    );
    return row?.delta ?? 0;
  }
}
