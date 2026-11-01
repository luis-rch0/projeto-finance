import type { SQLiteDatabase } from 'expo-sqlite';

/** Aditiva: preserva todos os lançamentos, limites, metas e recorrências existentes. */
export async function migration005(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE installment_plans (
      id TEXT PRIMARY KEY NOT NULL,
      description TEXT NOT NULL CHECK(length(trim(description)) > 0),
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      total_cents INTEGER NOT NULL CHECK(total_cents > 0),
      installments_count INTEGER NOT NULL CHECK(installments_count BETWEEN 2 AND 60),
      first_due_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      archived_at TEXT,
      CHECK(total_cents >= installments_count)
    );
    CREATE TABLE installment_items (
      id TEXT PRIMARY KEY NOT NULL,
      plan_id TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE RESTRICT,
      sequence INTEGER NOT NULL CHECK(sequence >= 1),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','SKIPPED')),
      transaction_id TEXT UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
      UNIQUE(plan_id,sequence),
      CHECK((status='CONFIRMED' AND transaction_id IS NOT NULL) OR
        (status IN ('PENDING','SKIPPED') AND transaction_id IS NULL))
    );
    CREATE INDEX idx_installment_items_due ON installment_items(due_date,status);
    CREATE INDEX idx_installment_items_plan ON installment_items(plan_id,sequence);
    CREATE TRIGGER installment_category_insert BEFORE INSERT ON installment_plans
      WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category_id AND type='EXPENSE')
      BEGIN SELECT RAISE(ABORT, 'Parcelamento deve utilizar categoria de despesa'); END;
    CREATE TRIGGER installment_category_update BEFORE UPDATE OF category_id ON installment_plans
      WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category_id AND type='EXPENSE')
      BEGIN SELECT RAISE(ABORT, 'Parcelamento deve utilizar categoria de despesa'); END;
    CREATE TRIGGER category_type_installment_update BEFORE UPDATE OF type ON categories
      WHEN NEW.type!='EXPENSE' AND EXISTS (SELECT 1 FROM installment_plans WHERE category_id=OLD.id)
      BEGIN SELECT RAISE(ABORT, 'Categoria utilizada em parcelamento'); END;
  `);
}
