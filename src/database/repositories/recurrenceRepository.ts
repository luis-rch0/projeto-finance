import type { SQLiteDatabase } from 'expo-sqlite';
import type { OccurrenceDetail, RecurrenceOccurrence, RecurrenceRule } from '@/types/finance';
import { monthBounds } from '@/utils/date';

export class RecurrenceRepository {
  constructor(private db: SQLiteDatabase) {}
  async create(rule: RecurrenceRule): Promise<void> {
    await this.db.runAsync(`INSERT INTO recurrence_rules
      (id,type,account_id,category_id,amount_cents,description,frequency,start_date,end_date,created_at,updated_at,archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [rule.id,rule.type,rule.account_id,rule.category_id,rule.amount_cents,rule.description,rule.frequency,
      rule.start_date,rule.end_date,rule.created_at,rule.updated_at,rule.archived_at]);
  }
  findById(id: string): Promise<RecurrenceRule | null> {
    return this.db.getFirstAsync<RecurrenceRule>('SELECT * FROM recurrence_rules WHERE id=?', [id]);
  }
  findActive(): Promise<RecurrenceRule[]> {
    return this.db.getAllAsync<RecurrenceRule>('SELECT * FROM recurrence_rules WHERE archived_at IS NULL ORDER BY created_at DESC');
  }
  async archive(id: string): Promise<void> {
    const now = new Date().toISOString();
    const result = await this.db.runAsync('UPDATE recurrence_rules SET archived_at=?,updated_at=? WHERE id=? AND archived_at IS NULL', [now,now,id]);
    if (!result.changes) throw new Error('Recorrência não encontrada.');
  }
  findMonth(year: number, month: number): Promise<OccurrenceDetail[]> {
    const [start, end] = monthBounds(year, month);
    return this.db.getAllAsync<OccurrenceDetail>(`
      SELECT o.id,o.rule_id,
        COALESCE(o.override_date,o.occurrence_date) AS occurrence_date,
        o.status,o.transaction_id,
        COALESCE(o.override_description,r.description) AS description,
        COALESCE(o.override_cents,r.amount_cents) AS amount_cents,
        r.type,r.frequency,c.name AS category_name
      FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.rule_id
      JOIN categories c ON c.id=r.category_id
      WHERE COALESCE(o.override_date,o.occurrence_date)>=?
        AND COALESCE(o.override_date,o.occurrence_date)<? AND r.archived_at IS NULL
      ORDER BY o.occurrence_date ASC,r.description COLLATE NOCASE`, [start,end]);
  }
  findOccurrence(id: string): Promise<RecurrenceOccurrence | null> {
    return this.db.getFirstAsync<RecurrenceOccurrence>('SELECT * FROM recurrence_occurrences WHERE id=?', [id]);
  }
}
