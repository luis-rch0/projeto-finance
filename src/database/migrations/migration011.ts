import type { SQLiteDatabase } from 'expo-sqlite';

/** Transferências próprias não alteram os totais de receitas e despesas. */
export async function migration011(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE account_transfers (
      id TEXT PRIMARY KEY NOT NULL,
      from_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      to_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      date TEXT NOT NULL CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      CHECK(from_account_id <> to_account_id)
    );
    CREATE INDEX idx_account_transfers_from ON account_transfers(from_account_id);
    CREATE INDEX idx_account_transfers_to ON account_transfers(to_account_id);
    CREATE INDEX idx_account_transfers_date ON account_transfers(date DESC, created_at DESC);
  `);
}
