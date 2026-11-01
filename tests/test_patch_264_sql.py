"""Regressões v2.6.4: limite por consumo e faturas pendentes na Home."""
import re
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def sql_migration(index):
    code=(ROOT/'src'/'database'/'migrations'/f'migration{index:03}.ts').read_text(encoding='utf-8')
    return re.search(r'db\.execAsync\(`(.*?)`\)',code,re.S).group(1)

class Patch264SqlTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for number in range(1,11):self.db.executescript(sql_migration(number))
        db=self.db
        db.execute("INSERT INTO accounts VALUES ('a','Banco','CHECKING',0,'now')")
        db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('food','Alimentação','EXPENSE','#16845D','🍽️')")
        db.execute("INSERT INTO budget_recurrence_rules VALUES ('r','food','2026-10',50000,1,'now')")
        db.execute("INSERT INTO payment_cards VALUES ('card','Crédito',NULL,0,1,'now',NULL,NULL)")
        db.execute("INSERT INTO credit_cards VALUES ('card','Crédito',10,17,'now',NULL)")
        db.execute("INSERT INTO credit_card_purchases VALUES ('p','card','Mercado','2026-10-15',30000,1,'now','food')")
        db.execute("INSERT INTO credit_card_installments VALUES ('i','p',1,'2026-11',30000)")
        db.execute("INSERT INTO transactions VALUES ('cash','a','food','EXPENSE',5000,'Feira','2026-10-08','now','now',NULL,NULL)")
        db.execute("INSERT INTO transactions VALUES ('payment','a','food','EXPENSE',30000,'Fatura','2026-11-17','now','now',NULL,NULL)")
        db.execute("INSERT INTO credit_card_invoice_payments VALUES ('paid','card','2026-11','a','food',30000,'2026-11-17','payment','now')")

    def tearDown(self):self.db.close()

    def budget_query(self, month):
        source=(ROOT/'src'/'database'/'repositories'/'budgetRepository.ts').read_text(encoding='utf-8')
        sql=re.search(r'async findByMonth\(month: string\).*?getAllAsync<MonthlyBudgetProgress>\(`(.*?)`\s*,\s*\[',source,re.S).group(1)
        year,m=month.split('-')
        end='2026-11-01' if month=='2026-10' else '2026-12-01'
        start=month+'-01'
        return self.db.execute(sql,(month,month,month,month,month,start,end,start,end)).fetchall()

    def test_limit_includes_card_purchase_without_invoice_duplication(self):
        oct=self.budget_query('2026-10')
        self.assertEqual(oct[0][-1],35000)
        nov=self.budget_query('2026-11')
        self.assertEqual(nov[0][-1],0)

    def test_pending_invoices_are_shared_by_home_and_due(self):
        source=(ROOT/'src'/'services'/'dueService.ts').read_text(encoding='utf-8')
        sql=re.search(r'getAllAsync<PendingInvoiceDue>\(`(.*?)`\s*,\s*\[monthISO\]',source,re.S).group(1)
        self.assertEqual(self.db.execute(sql,('2026-11',)).fetchall(),[])
        self.db.execute("DELETE FROM credit_card_invoice_payments WHERE id='paid'")
        result=self.db.execute(sql,('2026-11',)).fetchall()
        self.assertEqual(result,[('card','Fatura Crédito','2026-11-17',30000)])
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

if __name__=='__main__':unittest.main(verbosity=2)
