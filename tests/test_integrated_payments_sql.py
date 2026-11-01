"""Testa migração 009 e separação entre consumo e movimentação com SQLite real."""
import re
import sqlite3
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]

def migrate(db,version):
    src=(BASE/'src'/'database'/'migrations'/f'migration{version:03}.ts').read_text(encoding='utf8')
    sql=re.search(r'db\.execAsync\(`(.*?)`\)',src,re.S)
    assert sql, f'SQL não encontrado em migration{version:03}'
    db.executescript(sql.group(1))

class IntegratedPaymentsSQLTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for version in range(1,9):migrate(self.db,version)
        self.db.execute("INSERT INTO accounts VALUES ('a','Banco','CHECKING',0,'2026-10-15T00:00:00Z')")
        self.db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('cat','Alimentação','EXPENSE','#16845D','🍽️')")
        self.db.execute("INSERT INTO credit_cards VALUES ('card','Cartão antigo',10,17,'2026-10-15T00:00:00Z',NULL)")
        self.db.execute("INSERT INTO credit_card_purchases VALUES ('old','card','Antes', '2026-09-10', 1000, 1,'2026-09-10T00:00:00Z')")
        self.db.execute("INSERT INTO credit_card_installments VALUES ('oldi','old',1,'2026-09',1000)")
        self.db.execute("INSERT INTO transactions VALUES ('oldtx','a','cat','EXPENSE',2500,'Antiga','2026-10-01','now','now')")
        migrate(self.db,9)

    def tearDown(self):self.db.close()

    def test_migra_sem_perder_dados(self):
        self.assertEqual(self.db.execute('SELECT amount_cents FROM transactions WHERE id="oldtx"').fetchone()[0],2500)
        self.assertEqual(self.db.execute('SELECT category_id FROM credit_card_purchases WHERE id="old"').fetchone()[0],None)
        self.assertEqual(self.db.execute('SELECT allows_debit,allows_credit FROM payment_cards WHERE id="card"').fetchone(),(0,1))
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_cartao_debito_sem_fatura(self):
        self.db.execute("INSERT INTO payment_cards VALUES ('debit','Cartão de débito','a',1,0,'now',NULL)")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM credit_cards WHERE id="debit"').fetchone()[0],0)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO payment_cards VALUES ('invalid','Inválido',NULL,1,0,'now',NULL)")

    def test_compra_credito_nao_duplica_fluxo_caixa(self):
        self.db.execute("UPDATE credit_card_purchases SET category_id='cat' WHERE id='old'")
        self.db.execute("INSERT INTO credit_card_purchases VALUES ('purchase','card','Supermercado','2026-10-15',30000,3,'now','cat')")
        for idx,month in enumerate(['2026-11','2026-12','2027-01']):
            self.db.execute('INSERT INTO credit_card_installments VALUES (?,?,?,?,?)',
                (f'ci{idx}','purchase',idx+1,month,10000))
        self.db.execute("INSERT INTO transactions VALUES ('pay','a','cat','EXPENSE',10000,'Fatura','2026-11-17','now','now',NULL,NULL)")
        self.db.execute("INSERT INTO credit_card_invoice_payments VALUES ('invoice','card','2026-11','a','cat',10000,'2026-11-17','pay','now')")
        consumption=self.db.execute('''
          SELECT SUM(cents) FROM (
            SELECT t.amount_cents AS cents FROM transactions t
              WHERE t.type='EXPENSE' AND t.date>='2026-10-01' AND t.date<'2026-11-01'
              AND NOT EXISTS(SELECT 1 FROM credit_card_invoice_payments p WHERE p.transaction_id=t.id)
            UNION ALL
            SELECT p.total_cents FROM credit_card_purchases p
              WHERE p.purchase_date>='2026-10-01' AND p.purchase_date<'2026-11-01'
          )''').fetchone()[0]
        cash_oct=self.db.execute("SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE type='EXPENSE' AND date>='2026-10-01' AND date<'2026-11-01'").fetchone()[0]
        cash_nov=self.db.execute("SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE type='EXPENSE' AND date>='2026-11-01' AND date<'2026-12-01'").fetchone()[0]
        self.assertEqual((consumption,cash_oct,cash_nov),(32500,2500,10000))
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

if __name__=='__main__':unittest.main(verbosity=2)
