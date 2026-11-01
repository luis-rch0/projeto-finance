import type { SQLiteDatabase } from 'expo-sqlite';

export async function migration004(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE recurrence_rules (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      description TEXT NOT NULL CHECK(length(trim(description)) > 0),
      frequency TEXT NOT NULL CHECK(frequency IN ('WEEKLY','MONTHLY','YEARLY')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      CHECK(end_date IS NULL OR end_date >= start_date)
    );
    CREATE TABLE recurrence_occurrences (
      id TEXT PRIMARY KEY NOT NULL,
      rule_id TEXT NOT NULL REFERENCES recurrence_rules(id) ON DELETE RESTRICT,
      occurrence_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING','CONFIRMED','SKIPPED')),
      transaction_id TEXT UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
      UNIQUE(rule_id, occurrence_date),
      CHECK((status='CONFIRMED' AND transaction_id IS NOT NULL) OR
            (status IN ('PENDING','SKIPPED') AND transaction_id IS NULL))
    );
    CREATE INDEX idx_recurrence_occurrences_month ON recurrence_occurrences(occurrence_date,status);
    CREATE INDEX idx_recurrence_rules_active ON recurrence_rules(archived_at,start_date);
    CREATE TRIGGER recurrence_category_insert BEFORE INSERT ON recurrence_rules
      WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category_id AND type=NEW.type)
      BEGIN SELECT RAISE(ABORT,'Categoria incompatível com recorrência'); END;
    CREATE TRIGGER recurrence_category_update BEFORE UPDATE OF category_id,type ON recurrence_rules
      WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category_id AND type=NEW.type)
      BEGIN SELECT RAISE(ABORT,'Categoria incompatível com recorrência'); END;
    CREATE TRIGGER category_type_recurrence_update BEFORE UPDATE OF type ON categories
      WHEN EXISTS (SELECT 1 FROM recurrence_rules WHERE category_id=OLD.id AND type!=NEW.type)
      BEGIN SELECT RAISE(ABORT,'Categoria utilizada em recorrência de outro tipo'); END;
  `);
}
