"""Garantias de integridade das transferências no SQLite (sem Expo Go)."""
import sqlite3
import unittest

from test_migrations import migration


class TransferDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys = ON')
        for version in range(1, 12):
            self.db.executescript(migration(version))
        self.db.executemany(
            'INSERT INTO accounts(id,name,type,initial_balance_cents,created_at) VALUES (?,?,?,?,?)',
            [('wallet', 'Carteira', 'CASH', 20000, 'now'),
             ('bank', 'Banco', 'CHECKING', 5000, 'now')],
        )
        self.db.execute(
            "INSERT INTO categories(id,name,type,color,icon) VALUES ('food','Alimentação','EXPENSE','#fff','icon')"
        )

    def tearDown(self):
        self.db.close()

    def insert_transfer(self, from_id='wallet', to_id='bank', cents=8000, identifier='t1'):
        self.db.execute(
            '''INSERT INTO account_transfers
               (id,from_account_id,to_account_id,amount_cents,date,description,created_at)
               VALUES (?,?,?,?,?,?,?)''',
            (identifier, from_id, to_id, cents, '2026-10-19', 'Teste', 'now'),
        )

    def test_migration_preserves_transactions_and_adds_transfer_table(self):
        self.db.execute(
            "INSERT INTO transactions(id,account_id,category_id,type,amount_cents,description,date,created_at,updated_at) VALUES ('expense','wallet','food','EXPENSE',1000,'Almoço','2026-10-19','now','now')"
        )
        self.insert_transfer()
        self.assertEqual(self.db.execute('SELECT amount_cents FROM transactions').fetchone()[0], 1000)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM account_transfers').fetchone()[0], 1)

    def test_no_fake_income_expense_and_total_is_constant(self):
        self.insert_transfer()
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM transactions').fetchone()[0], 0)
        balance = self.db.execute('''
            SELECT a.id,
              a.initial_balance_cents
              + COALESCE((SELECT SUM(CASE WHEN type='INCOME' THEN amount_cents ELSE -amount_cents END)
                          FROM transactions WHERE account_id=a.id),0)
              + COALESCE((SELECT SUM(amount_cents) FROM account_transfers WHERE to_account_id=a.id),0)
              - COALESCE((SELECT SUM(amount_cents) FROM account_transfers WHERE from_account_id=a.id),0)
            FROM accounts a ORDER BY a.id
        ''').fetchall()
        self.assertEqual(dict(balance), {'bank': 13000, 'wallet': 12000})
        self.assertEqual(sum(value for _, value in balance), 25000)

    def test_same_account_and_nonpositive_amount_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert_transfer(to_id='wallet')
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert_transfer(cents=0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM account_transfers').fetchone()[0], 0)

    def test_account_fk_and_deletion_guard(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert_transfer(to_id='missing')
        self.insert_transfer()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM accounts WHERE id='wallet'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM accounts WHERE id='bank'")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_removing_transfer_reverses_without_touching_transactions(self):
        self.insert_transfer()
        self.db.execute("DELETE FROM account_transfers WHERE id='t1'")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM account_transfers').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM transactions').fetchone()[0], 0)

    def test_migration_11_applies_to_existing_database(self):
        db = sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys = ON')
        try:
            for version in range(1, 11):
                db.executescript(migration(version))
            db.execute("INSERT INTO accounts VALUES ('old','Minha conta','CASH',12345,'now')")
            db.executescript(migration(11))
            self.assertEqual(db.execute("SELECT initial_balance_cents FROM accounts WHERE id='old'").fetchone()[0], 12345)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM account_transfers').fetchone()[0], 0)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        finally:
            db.close()


if __name__ == '__main__':
    unittest.main()
