import type { SQLiteDatabase } from 'expo-sqlite';

/** Exclusão lógica de cartão: preserva compras, parcelas, faturas e transações. */
export async function migration010(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE payment_cards ADD COLUMN deleted_at TEXT;
    CREATE INDEX idx_payment_cards_deleted_at ON payment_cards(deleted_at);
  `);
}
