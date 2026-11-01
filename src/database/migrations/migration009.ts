import type { SQLiteDatabase } from 'expo-sqlite';

/** Vínculo entre contas e cartões; migração aditiva e idempotente no nível do versionamento. */
export async function migration009(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE payment_cards (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
      linked_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
      allows_debit INTEGER NOT NULL CHECK(allows_debit IN (0,1)),
      allows_credit INTEGER NOT NULL CHECK(allows_credit IN (0,1)),
      created_at TEXT NOT NULL,
      archived_at TEXT,
      CHECK(allows_debit=1 OR allows_credit=1),
      CHECK(allows_debit=0 OR linked_account_id IS NOT NULL)
    );
    CREATE INDEX idx_payment_cards_account ON payment_cards(linked_account_id);
    INSERT INTO payment_cards
      (id,name,linked_account_id,allows_debit,allows_credit,created_at,archived_at)
    SELECT id,name,NULL,0,1,created_at,archived_at FROM credit_cards;
    ALTER TABLE credit_card_purchases ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT;
    ALTER TABLE transactions ADD COLUMN payment_kind TEXT
      CHECK(payment_kind IS NULL OR payment_kind IN ('CASH','PIX','TRANSFER','DEBIT','OTHER'));
    ALTER TABLE transactions ADD COLUMN payment_card_id TEXT REFERENCES payment_cards(id) ON DELETE RESTRICT;
  `);
}
