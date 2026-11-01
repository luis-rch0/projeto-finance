import type { SQLiteDatabase } from 'expo-sqlite';
import type { InstallmentDetail, InstallmentPlan } from '@/types/finance';
import { monthBounds } from '@/utils/date';

export class InstallmentRepository {
  constructor(private db: SQLiteDatabase) {}
  findActive(): Promise<InstallmentPlan[]> {
    return this.db.getAllAsync<InstallmentPlan>(
      'SELECT * FROM installment_plans WHERE archived_at IS NULL ORDER BY created_at DESC');
  }
  findMonth(year: number, month: number): Promise<InstallmentDetail[]> {
    const [start,end] = monthBounds(year,month);
    return this.db.getAllAsync<InstallmentDetail>(`SELECT i.*,p.description,p.installments_count,c.name AS category_name
      FROM installment_items i JOIN installment_plans p ON p.id=i.plan_id
      JOIN categories c ON c.id=p.category_id
      WHERE i.due_date>=? AND i.due_date<? AND p.archived_at IS NULL
      ORDER BY i.due_date ASC,p.description COLLATE NOCASE`, [start,end]);
  }
  async archive(id: string): Promise<void> {
    const result = await this.db.runAsync('UPDATE installment_plans SET archived_at=? WHERE id=? AND archived_at IS NULL',
      [new Date().toISOString(),id]);
    if (!result.changes) throw new Error('Parcelamento não encontrado.');
  }
}
