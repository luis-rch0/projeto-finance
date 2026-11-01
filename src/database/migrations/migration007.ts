import type { SQLiteDatabase } from 'expo-sqlite';

/** Edições pontuais de vencimentos recorrentes sem recriar a ocorrência original. */
export async function migration007(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE recurrence_occurrences ADD COLUMN override_date TEXT;
    ALTER TABLE recurrence_occurrences ADD COLUMN override_cents INTEGER CHECK(override_cents IS NULL OR override_cents > 0);
    ALTER TABLE recurrence_occurrences ADD COLUMN override_description TEXT CHECK(override_description IS NULL OR length(trim(override_description)) > 0);
    CREATE INDEX idx_recurrence_override_date ON recurrence_occurrences(override_date,status);
  `);
}
