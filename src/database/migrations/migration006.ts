import type { SQLiteDatabase } from 'expo-sqlite';

/** Migração aditiva. Corrige apenas ícones numéricos herdados, sem renomear
 * categorias nem tocar em IDs, transações, limites ou aportes. */
export async function migration006(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    UPDATE categories SET icon = CASE
      WHEN type='EXPENSE' AND name='Alimentação' THEN '🍽️'
      WHEN type='EXPENSE' AND name='Transporte' THEN '🚗'
      WHEN type='EXPENSE' AND name='Moradia' THEN '🏠'
      WHEN type='EXPENSE' AND name='Saúde' THEN '💊'
      WHEN type='EXPENSE' AND name='Educação' THEN '📚'
      WHEN type='EXPENSE' AND name='Lazer' THEN '🎮'
      WHEN type='EXPENSE' AND name='Compras' THEN '🛍️'
      WHEN type='EXPENSE' AND name='Outros' THEN '📌'
      WHEN type='INCOME' AND name='Salário' THEN '💼'
      WHEN type='INCOME' AND name='Freelance' THEN '💻'
      WHEN type='INCOME' AND name='Investimentos' THEN '📈'
      WHEN type='INCOME' AND name='Outros' THEN '💰'
      ELSE '🏷️'
    END
    WHERE trim(icon) <> '' AND trim(icon) NOT GLOB '*[^0-9]*';

    CREATE TABLE budget_recurrence_rules (
      id TEXT PRIMARY KEY NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      start_month TEXT NOT NULL CHECK(start_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
      limit_cents INTEGER NOT NULL CHECK(limit_cents >= 0),
      enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
      created_at TEXT NOT NULL,
      CHECK ((enabled=1 AND limit_cents > 0) OR (enabled=0 AND limit_cents = 0)),
      UNIQUE(category_id,start_month)
    );
    CREATE INDEX idx_budget_rules_period ON budget_recurrence_rules(category_id,start_month DESC);
    CREATE TRIGGER budget_rule_expense_insert BEFORE INSERT ON budget_recurrence_rules
      WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category_id AND type='EXPENSE')
      BEGIN SELECT RAISE(ABORT, 'Regra de limite deve usar categoria de despesa'); END;
    CREATE TRIGGER budget_rule_expense_update BEFORE UPDATE OF category_id ON budget_recurrence_rules
      WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category_id AND type='EXPENSE')
      BEGIN SELECT RAISE(ABORT, 'Regra de limite deve usar categoria de despesa'); END;
    CREATE TRIGGER category_type_budget_rule_update BEFORE UPDATE OF type ON categories
      WHEN NEW.type!='EXPENSE' AND EXISTS (SELECT 1 FROM budget_recurrence_rules WHERE category_id=OLD.id)
      BEGIN SELECT RAISE(ABORT, 'Categoria usada em limites automáticos'); END;
  `);
}
