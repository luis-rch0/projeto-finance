"""Valida exclusão lógica de cartões, vínculos históricos e migração 010."""
import sqlite3
import unittest
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def migrate(db,number):
    source=(ROOT/'src'/'database'/'migrations'/f'migration{number:03}.ts').read_text(encoding='utf8')
    match=re.search(r'db\.execAsync\(`(.*?)`\)',source,re.S)
    if not match:
        raise AssertionError(f'SQL não encontrado na migration{number:03}')
    db.executescript(match.group(1))

class RemovedCardSQLTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for n in range(1,11):
            migrate(self.db,n)
        self.db.execute("INSERT INTO accounts VALUES ('a','Banco','CHECKING',0,'2026-10-15T00:00:00Z')")
        self.db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('cat','Compras','EXPENSE','#13845B','💳')")
        self.db.execute("INSERT INTO payment_cards VALUES ('card','Antigo','a',1,1,'2026-10-15T00:00:00Z',NULL,NULL)")
        self.db.execute("INSERT INTO credit_cards VALUES ('card','Antigo',10,17,'2026-10-15T00:00:00Z',NULL)")
        self.db.execute("INSERT INTO credit_card_purchases VALUES ('buy','card','Compra','2026-10-11',2500,1,'now','cat')")
        self.db.execute("INSERT INTO credit_card_installments VALUES ('i','buy',1,'2026-11',2500)")
        self.db.execute("INSERT INTO transactions VALUES ('deb','a','cat','EXPENSE',500,'Lanche','2026-10-11','now','now','DEBIT','card')")
    def tearDown(self): self.db.close()

    def test_remocao_oculta_e_preserva_historico(self):
        self.db.execute("UPDATE payment_cards SET deleted_at='2026-10-15T12:00:00Z' WHERE id='card'")
        active=self.db.execute('SELECT id FROM payment_cards WHERE deleted_at IS NULL').fetchall()
        self.assertEqual(active,[])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM credit_card_purchases').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM credit_card_installments').fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT payment_card_id FROM transactions WHERE id='deb'").fetchone()[0],'card')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
        invoices=self.db.execute('''SELECT cc.id,SUM(ci.amount_cents) FROM credit_card_installments ci
          JOIN credit_card_purchases p ON p.id=ci.purchase_id
          JOIN credit_cards cc ON cc.id=p.card_id
          WHERE ci.invoice_month='2026-11'
          GROUP BY cc.id''').fetchall()
        self.assertEqual(invoices,[('card',2500)])

    def test_restaurar_nao_recria_cartao(self):
        self.db.execute("UPDATE payment_cards SET deleted_at='2026-10-15T12:00:00Z' WHERE id='card'")
        self.db.execute("UPDATE payment_cards SET deleted_at=NULL WHERE id='card'")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM payment_cards WHERE id='card' AND deleted_at IS NULL").fetchone()[0],1)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

if __name__=='__main__': unittest.main(verbosity=2)
