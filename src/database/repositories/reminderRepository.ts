import type { SQLiteDatabase } from 'expo-sqlite';
import type { ReminderDue } from '@/utils/reminders';

/** Consulta apenas pendências ativas. Valores e contas não são incluídos nas notificações. */
export class ReminderRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async findPendingBetween(start: string, end: string): Promise<ReminderDue[]> {
    const [installments, recurring] = await Promise.all([
      this.db.getAllAsync<{ id: string; date: string; title: string }>(`
        SELECT i.id, i.due_date AS date, p.description AS title
        FROM installment_items i JOIN installment_plans p ON p.id=i.plan_id
        WHERE i.status='PENDING' AND p.archived_at IS NULL
          AND i.due_date >= ? AND i.due_date <= ?
        ORDER BY i.due_date ASC`, [start, end]),
      this.db.getAllAsync<{ id: string; date: string; title: string; type: 'EXPENSE' | 'INCOME' }>(`
        SELECT o.id, COALESCE(o.override_date,o.occurrence_date) AS date,
          COALESCE(o.override_description,r.description) AS title, r.type
        FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.rule_id
        WHERE o.status='PENDING' AND r.archived_at IS NULL
          AND COALESCE(o.override_date,o.occurrence_date) >= ?
          AND COALESCE(o.override_date,o.occurrence_date) <= ?
        ORDER BY date ASC`, [start, end]),
    ]);
    return [
      ...installments.map(i => ({ ...i, kind: 'INSTALLMENT' as const, type: 'EXPENSE' as const })),
      ...recurring.map(r => ({ ...r, kind: 'RECURRENCE' as const })),
    ];
  }
}
