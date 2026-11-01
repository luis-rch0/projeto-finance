"""Executar com: python tests/test_migrations.py  (biblioteca padrão do Python)."""
import sqlite3
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

def migration(num):
    file = ROOT / 'src' / 'database' / 'migrations' / f'migration{num:03}.ts'
    text = file.read_text(encoding='utf-8')
    match = re.search(r'db\.execAsync\(`(.*?)`\)', text, re.S)
    assert match, f'SQL não encontrado em {file}'
    return match.group(1)

class MigrationTest(unittest.TestCase):
    def open_db(self):
        db = sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys = ON')
        return db

    def test_update_v2_preserves_legacy_data(self):
        db = self.open_db()
        db.executescript(migration(1))
        db.executescript(migration(2))
        db.execute("INSERT INTO accounts VALUES ('account','Carteira','CASH',0,'2026-10-01T12:00:00Z')")
        db.execute("INSERT INTO categories VALUES ('food','Alimentação','EXPENSE','#D94B56','1')")
        db.execute("INSERT INTO transactions VALUES ('tx','account','food','EXPENSE',5000,'Almoço','2026-10-13','now','now')")
        db.execute("INSERT INTO savings_goals VALUES ('goal','Computador',100000,NULL,'now','now',NULL)")
        db.execute("INSERT INTO goal_contributions VALUES ('pay','goal',1000,'2026-10-13','now')")
        db.execute("INSERT INTO monthly_budgets VALUES ('budget','food','2026-10',12000,'now','now')")
        db.commit()
        db.executescript(migration(3))
        db.executescript(migration(4))
        db.executescript(migration(5))
        db.executescript(migration(6))
        self.assertEqual(db.execute("SELECT icon FROM categories WHERE id='food'").fetchone()[0],"🍽️")
        self.assertEqual(db.execute("SELECT amount_cents FROM transactions WHERE id='tx'").fetchone()[0], 5000)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM monthly_budgets').fetchone()[0], 1)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM goal_contributions').fetchone()[0], 1)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        db.execute("UPDATE categories SET archived_at='2026-10-13' WHERE id='food'")
        self.assertEqual(db.execute("SELECT category_id FROM transactions WHERE id='tx'").fetchone()[0], 'food')
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM categories WHERE id='food'")
        db.close()

    def test_recurrence_prevents_duplicate_and_fake_confirmation(self):
        db = self.open_db()
        for num in (1,2,3,4,5): db.executescript(migration(num))
        db.execute("INSERT INTO accounts VALUES ('account','Carteira','CASH',0,'now')")
        db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('food','Alimentação','EXPENSE','#D94B56','1')")
        db.execute("INSERT INTO recurrence_rules VALUES ('rule','EXPENSE','account','food',10000,'Internet','MONTHLY','2026-10-13',NULL,'now','now',NULL)")
        db.execute("INSERT INTO recurrence_occurrences VALUES ('o1','rule','2026-10-13','PENDING',NULL)")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO recurrence_occurrences VALUES ('o2','rule','2026-10-13','PENDING',NULL)")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE recurrence_occurrences SET status='CONFIRMED' WHERE id='o1'")
        db.execute("INSERT INTO transactions VALUES ('tx','account','food','EXPENSE',10000,'Internet','2026-10-13','now','now')")
        db.execute("UPDATE recurrence_occurrences SET status='CONFIRMED',transaction_id='tx' WHERE id='o1'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM transactions WHERE id='tx'")
        db.execute("UPDATE recurrence_occurrences SET status='PENDING',transaction_id=NULL WHERE id='o1'")
        db.execute("DELETE FROM transactions WHERE id='tx'")
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        db.close()

    def test_installments_constraints_and_existing_data(self):
        db = self.open_db()
        for num in (1,2,3,4): db.executescript(migration(num))
        db.execute("INSERT INTO accounts VALUES ('a','Carteira','CASH',0,'now')")
        db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('c','Compras','EXPENSE','#D94B56','1')")
        db.execute("INSERT INTO transactions VALUES ('old','a','c','EXPENSE',1234,'Antiga','2026-10-13','now','now')")
        db.executescript(migration(5))
        self.assertEqual(db.execute("SELECT amount_cents FROM transactions WHERE id='old'").fetchone()[0],1234)
        db.execute("INSERT INTO installment_plans VALUES ('p','Celular','a','c',10001,3,'2026-10-31','now',NULL)")
        db.execute("INSERT INTO installment_items VALUES ('i1','p',1,3334,'2026-10-31','PENDING',NULL)")
        db.execute("INSERT INTO installment_items VALUES ('i2','p',2,3334,'2026-11-30','PENDING',NULL)")
        db.execute("INSERT INTO installment_items VALUES ('i3','p',3,3333,'2026-12-31','PENDING',NULL)")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO installment_items VALUES ('i4','p',1,3334,'2027-01-31','PENDING',NULL)")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE installment_items SET status='CONFIRMED' WHERE id='i1'")
        db.execute("INSERT INTO transactions VALUES ('confirmed','a','c','EXPENSE',3334,'Celular 1/3','2026-10-31','now','now')")
        db.execute("UPDATE installment_items SET status='CONFIRMED',transaction_id='confirmed' WHERE id='i1'")
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        db.close()

    def test_v6_budget_rules_preserve_historical_limits_and_fix_custom_icon(self):
        db = self.open_db()
        for num in (1,2,3,4,5): db.executescript(migration(num))
        db.execute("INSERT INTO accounts VALUES ('a','Carteira','CASH',0,'now')")
        db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('c','Personalizada','EXPENSE','#D94B56','15')")
        db.execute("INSERT INTO monthly_budgets VALUES ('old','c','2026-09',10000,'now','now')")
        db.executescript(migration(6))
        self.assertEqual(db.execute("SELECT icon FROM categories WHERE id='c'").fetchone()[0], '🏷️')
        self.assertEqual(db.execute("SELECT name FROM categories WHERE id='c'").fetchone()[0], 'Personalizada')
        self.assertEqual(db.execute("SELECT limit_cents FROM monthly_budgets WHERE id='old'").fetchone()[0],10000)
        db.execute("INSERT INTO budget_recurrence_rules VALUES ('r1','c','2026-10',20000,1,'now')")
        db.execute("INSERT INTO budget_recurrence_rules VALUES ('r2','c','2026-12',0,0,'now')")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO budget_recurrence_rules VALUES ('r3','c','2026-10',20000,1,'now')")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO budget_recurrence_rules VALUES ('r4','c','2027-01',0,1,'now')")
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        db.close()

    def test_budget_rule_resolution_obeys_override_and_stop(self):
        db = self.open_db()
        for num in range(1,11): db.executescript(migration(num))
        db.execute("INSERT INTO accounts VALUES ('a','Carteira','CASH',0,'now')")
        db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('food','Alimentação','EXPENSE','#D94B56','🍽️')")
        db.execute("INSERT INTO budget_recurrence_rules VALUES ('r1','food','2026-10',50000,1,'now')")
        db.execute("INSERT INTO monthly_budgets VALUES ('b1','food','2026-11',30000,'now','now')")
        db.execute("INSERT INTO budget_recurrence_rules VALUES ('r2','food','2026-12',0,0,'now')")
        code=(ROOT/'src'/'database'/'repositories'/'budgetRepository.ts').read_text(encoding='utf8')
        sql=re.search(r'async findByMonth\(month: string\).*?return this.db.getAllAsync<MonthlyBudgetProgress>\(`(.*?)`\s*,\s*\[',code,re.S).group(1)
        def effective(month, start, end):
            return db.execute(sql,(month,month,month,month,month,start,end,start,end)).fetchall()
        self.assertEqual(effective('2026-09','2026-09-01','2026-10-01'),[])
        self.assertEqual(effective('2026-10','2026-10-01','2026-11-01')[0][3],50000)
        nov=effective('2026-11','2026-11-01','2026-12-01')[0]
        self.assertEqual((nov[3],nov[4]),(30000,0))
        self.assertEqual(effective('2026-12','2026-12-01','2027-01-01'),[])
        db.close()

if __name__ == '__main__':
    unittest.main(verbosity=2)
