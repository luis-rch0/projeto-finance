import type { SQLiteDatabase } from 'expo-sqlite';

/** Migração aditiva: mantém IDs, registros, limites e metas existentes. */
export async function migration003(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE categories ADD COLUMN archived_at TEXT;
    CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(type, archived_at, name);
    CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, date DESC);
  `);
}
