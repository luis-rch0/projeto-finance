"""Regressão: arquivamento na Home, overrides e preservação do SQLite."""
import re, sqlite3, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]


def migration(n):
    source = (ROOT/'src'/'database'/'migrations'/f'migration{n:03}.ts').read_text(encoding='utf-8')
    return re.search(r'await db.execAsync\(`(.*?)`\)', source, re.S).group(1)


class EditingSqlTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        for n in range(1, 8):
            self.db.executescript(migration(n))
        self.db.execute("INSERT INTO accounts (id,name,type,initial_balance_cents,created_at) VALUES ('a','Conta','CASH',0,'now')")
        self.db.execute("INSERT INTO categories (id,name,type,color,icon) VALUES ('c','Casa','EXPENSE','#00ff00','🏠')")
        self.db.execute("INSERT INTO recurrence_rules VALUES ('r','EXPENSE','a','c',10000,'Energia','MONTHLY','2026-10-15',NULL,'now','now',NULL)")
        self.db.execute("INSERT INTO recurrence_occurrences (id,rule_id,occurrence_date,status,transaction_id) VALUES ('o','r','2026-10-15','PENDING',NULL)")
        self.db.execute("INSERT INTO installment_plans VALUES ('p','Notebook','a','c',90000,3,'2026-10-15','now',NULL)")
        for ix, date in enumerate(['2026-10-15','2026-11-15','2026-12-15'],1):
            self.db.execute('INSERT INTO installment_items VALUES (?,?,?,30000,?,\'PENDING\',NULL)',(f'i{ix}','p',ix,date))

    def tearDown(self):
        self.db.close()

    def home(self, from_date='2026-10-01', to_date='2026-11-01'):
        code = (ROOT/'src'/'services'/'dueService.ts').read_text(encoding='utf-8')
        sql = re.search(r'this\.db\.getAllAsync<HomeUpcoming>\(\s*`(.*?)`',code,re.S).group(1)
        return self.db.execute(sql,[from_date,to_date,from_date,to_date]).fetchall()

    def test_archived_disappear_home(self):
        self.assertEqual(len(self.home()),2)
        self.db.execute("UPDATE installment_plans SET archived_at='now' WHERE id='p'")
        self.assertEqual(len(self.home()),1)
        self.db.execute("UPDATE recurrence_rules SET archived_at='now' WHERE id='r'")
        self.assertEqual(len(self.home()),0)

    def test_recurring_override_moves_month_without_duplicate_key(self):
        self.db.execute("UPDATE recurrence_occurrences SET override_date='2026-11-20',override_cents=8800,override_description='Nova energia' WHERE id='o'")
        self.assertEqual(len(self.home()),1)
        next_month = self.home('2026-11-01','2026-12-01')
        self.assertEqual(len(next_month),2)
        edited = next(x for x in next_month if x['kind']=='RECURRENCE')
        self.assertEqual((edited['description'],edited['amountCents'],edited['date']),('Nova energia',8800,'2026-11-20'))
        self.db.execute("INSERT OR IGNORE INTO recurrence_occurrences (id,rule_id,occurrence_date,status) VALUES ('new','r','2026-10-15','PENDING')")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM recurrence_occurrences WHERE rule_id='r'").fetchone()[0],1)

    def test_invoice_due_day_is_clamped_for_short_months(self):
        source = (ROOT/'src'/'services'/'dueService.ts').read_text(encoding='utf-8')
        expression = re.search(r"(printf\('%s-%02d', i.invoice_month,.*?\)\)\)) AS date,", source, re.S)
        self.assertIsNotNone(expression)
        for month, expected in [('2027-02', '2027-02-28'), ('2028-02', '2028-02-29'), ('2026-04', '2026-04-30')]:
            # Os parâmetros simulam as colunas referenciadas pela expressão SQL.
            result = self.db.execute('SELECT ' + expression.group(1) + ' FROM (SELECT ? AS invoice_month) i CROSS JOIN (SELECT 31 AS due_day) c', (month,)).fetchone()[0]
            self.assertEqual(result, expected)

    def test_installment_change_updates_total_without_touching_history(self):
        self.db.execute('UPDATE installment_items SET amount_cents=34000,due_date=? WHERE id=?',('2026-10-20','i1'))
        self.db.execute('UPDATE installment_plans SET total_cents=(SELECT SUM(amount_cents) FROM installment_items WHERE plan_id=?) WHERE id=?',('p','p'))
        self.assertEqual(self.db.execute('SELECT total_cents FROM installment_plans WHERE id="p"').fetchone()[0],94000)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

if __name__ == '__main__': unittest.main()
