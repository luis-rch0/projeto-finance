import type { SQLiteDatabase } from 'expo-sqlite';
export async function migration001(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('CASH','CHECKING','SAVINGS','OTHER')),
      initial_balance_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),
      color TEXT NOT NULL, icon TEXT NOT NULL, UNIQUE(name, type)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), description TEXT NOT NULL,
      date TEXT NOT NULL CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE TRIGGER IF NOT EXISTS transaction_type_insert BEFORE INSERT ON transactions
    WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND type = NEW.type)
    BEGIN SELECT RAISE(ABORT, 'Categoria incompatível com a transação'); END;
    CREATE TRIGGER IF NOT EXISTS transaction_type_update BEFORE UPDATE OF category_id,type ON transactions
    WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND type = NEW.type)
    BEGIN SELECT RAISE(ABORT, 'Categoria incompatível com a transação'); END;
    CREATE TRIGGER IF NOT EXISTS category_type_update BEFORE UPDATE OF type ON categories
    WHEN EXISTS (SELECT 1 FROM transactions WHERE category_id = OLD.id AND type != NEW.type)
    BEGIN SELECT RAISE(ABORT, 'Categoria utilizada em transações de outro tipo'); END;
  `);
}
