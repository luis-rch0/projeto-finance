import type { SQLiteDatabase } from 'expo-sqlite';

/** Cartões em tabelas próprias: compras previstas nunca entram diretamente no caixa. */
export async function migration008(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE credit_cards (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
      closing_day INTEGER NOT NULL CHECK(closing_day BETWEEN 1 AND 28),
      due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 28),
      created_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE credit_card_purchases (
      id TEXT PRIMARY KEY NOT NULL,
      card_id TEXT NOT NULL REFERENCES credit_cards(id) ON DELETE RESTRICT,
      description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 150),
      purchase_date TEXT NOT NULL,
      total_cents INTEGER NOT NULL CHECK(total_cents > 0),
      installments_count INTEGER NOT NULL CHECK(installments_count BETWEEN 1 AND 60),
      created_at TEXT NOT NULL,
      CHECK(total_cents >= installments_count)
    );
    CREATE INDEX idx_card_purchases_card ON credit_card_purchases(card_id,purchase_date);
    CREATE TABLE credit_card_installments (
      id TEXT PRIMARY KEY NOT NULL,
      purchase_id TEXT NOT NULL REFERENCES credit_card_purchases(id) ON DELETE RESTRICT,
      sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 60),
      invoice_month TEXT NOT NULL CHECK(length(invoice_month)=7),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      UNIQUE(purchase_id, sequence)
    );
    CREATE INDEX idx_card_installments_month ON credit_card_installments(invoice_month,purchase_id);
    CREATE TABLE credit_card_invoice_payments (
      id TEXT PRIMARY KEY NOT NULL,
      card_id TEXT NOT NULL REFERENCES credit_cards(id) ON DELETE RESTRICT,
      invoice_month TEXT NOT NULL CHECK(length(invoice_month)=7),
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      paid_date TEXT NOT NULL,
      transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      UNIQUE(card_id, invoice_month)
    );
    CREATE INDEX idx_card_invoice_payments_month ON credit_card_invoice_payments(invoice_month);
    CREATE TRIGGER card_invoice_category_insert BEFORE INSERT ON credit_card_invoice_payments
      WHEN NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND type='EXPENSE')
      BEGIN SELECT RAISE(ABORT,'Categoria de fatura deve ser de despesa'); END;
    CREATE TRIGGER card_invoice_category_update BEFORE UPDATE OF category_id ON credit_card_invoice_payments
      WHEN NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND type='EXPENSE')
      BEGIN SELECT RAISE(ABORT,'Categoria de fatura deve ser de despesa'); END;
  `);
}
