import type { SQLiteDatabase } from 'expo-sqlite';
import type { Category, MovementType } from '@/types/finance';

export class CategoryRepository {
  constructor(private db: SQLiteDatabase) {}

  async create(c: Category): Promise<void> {
    await this.db.runAsync('INSERT INTO categories (id,name,type,color,icon,archived_at) VALUES (?,?,?,?,?,NULL)',
      [c.id, c.name, c.type, c.color, c.icon]);
  }
  findAll(includeArchived = false): Promise<Category[]> {
    return this.db.getAllAsync<Category>(`SELECT * FROM categories ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY type,name COLLATE NOCASE`);
  }
  findByType(type: MovementType, includeArchived = false): Promise<Category[]> {
    return this.db.getAllAsync<Category>(`SELECT * FROM categories WHERE type=? ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY name COLLATE NOCASE`, [type]);
  }
  findById(id: string): Promise<Category | null> {
    return this.db.getFirstAsync<Category>('SELECT * FROM categories WHERE id=?', [id]);
  }
  async update(c: Category): Promise<void> {
    const result = await this.db.runAsync('UPDATE categories SET name=?,color=?,icon=? WHERE id=? AND archived_at IS NULL',
      [c.name,c.color,c.icon,c.id]);
    if (!result.changes) throw new Error('Categoria não encontrada ou arquivada.');
  }
  async archive(id: string, now: string): Promise<void> {
    const result = await this.db.runAsync('UPDATE categories SET archived_at=? WHERE id=? AND archived_at IS NULL', [now,id]);
    if (!result.changes) throw new Error('Categoria não encontrada ou já arquivada.');
  }
  async delete(id: string): Promise<void> {
    const r = await this.db.runAsync(`DELETE FROM categories WHERE id=?
      AND NOT EXISTS (SELECT 1 FROM transactions WHERE category_id=?)
      AND NOT EXISTS (SELECT 1 FROM monthly_budgets WHERE category_id=?)
      AND NOT EXISTS (SELECT 1 FROM recurrence_rules WHERE category_id=?)
      AND NOT EXISTS (SELECT 1 FROM installment_plans WHERE category_id=?)`, [id,id,id,id,id]);
    if (!r.changes) throw new Error('Categoria vinculada a registros. Arquive-a.');
  }
}
