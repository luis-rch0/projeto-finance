import type { SQLiteDatabase } from 'expo-sqlite';

/** Migração aditiva: nunca altera nem recria contas, categorias ou transações antigas. */
export async function migration002(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE savings_goals (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK(length(trim(title)) > 0),
      target_cents INTEGER NOT NULL CHECK(target_cents > 0),
      target_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE goal_contributions (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_goal_contributions_goal ON goal_contributions(goal_id);
    CREATE INDEX idx_goal_contributions_date ON goal_contributions(date);
    CREATE TABLE monthly_budgets (
      id TEXT PRIMARY KEY NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      month TEXT NOT NULL CHECK(length(month) = 7 AND month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
      limit_cents INTEGER NOT NULL CHECK(limit_cents > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(category_id, month)
    );
    CREATE INDEX idx_monthly_budgets_month ON monthly_budgets(month);
    CREATE TRIGGER budget_expense_category_insert BEFORE INSERT ON monthly_budgets
    WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category_id AND type='EXPENSE')
    BEGIN SELECT RAISE(ABORT, 'Limite deve utilizar uma categoria de despesa'); END;
    CREATE TRIGGER budget_expense_category_update BEFORE UPDATE OF category_id ON monthly_budgets
    WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category_id AND type='EXPENSE')
    BEGIN SELECT RAISE(ABORT, 'Limite deve utilizar uma categoria de despesa'); END;
    CREATE TRIGGER category_type_budget_update BEFORE UPDATE OF type ON categories
    WHEN NEW.type!='EXPENSE' AND EXISTS (SELECT 1 FROM monthly_budgets WHERE category_id=OLD.id)
    BEGIN SELECT RAISE(ABORT, 'Categoria possui limite de despesas'); END;
  `);
}
