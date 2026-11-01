"""Testa integridade da migração 008 com SQLite real, sem bibliotecas externas."""
import re
import sqlite3
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]

def schema(db, version):
    text = (BASE / 'src/database/migrations' / f'migration{version:03}.ts').read_text(encoding='utf8')
    match = re.search(r'db\.execAsync\(`(.*?)`\)', text, re.S)
    assert match, f'Migração {version} não encontrada'
    db.executescript(match.group(1))

class CreditCardTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for num in range(1,9):
            schema(self.db,num)
        self.db.execute("INSERT INTO accounts VALUES ('a','Carteira','CASH',0,'now')")
        self.db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('c','Outros','EXPENSE','#00AB00','🏷️')")
        self.db.execute("INSERT INTO credit_cards VALUES ('card','Cartão principal',10,17,'now',NULL)")
        self.db.execute("INSERT INTO credit_card_purchases VALUES ('purchase','card','Compra', '2026-10-11', 10001, 3,'now')")
        for number, month, amount in [(1,'2026-11',3334),(2,'2026-12',3334),(3,'2027-01',3333)]:
            self.db.execute('INSERT INTO credit_card_installments VALUES (?,?,?,?,?)',
                (f'ci{number}','purchase',number,month,amount))
        self.db.commit()
    def tearDown(self):
        self.db.close()
    def test_faturas_separadas_de_despesas(self):
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM transactions').fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT sum(amount_cents) FROM credit_card_installments WHERE invoice_month='2026-11'").fetchone()[0],3334)
        self.assertEqual(self.db.execute('SELECT sum(amount_cents) FROM credit_card_installments').fetchone()[0],10001)
    def test_pagamento_unico_e_integridade(self):
        self.db.execute("INSERT INTO transactions VALUES ('t','a','c','EXPENSE',3334,'Fatura','2026-11-17','now','now')")
        self.db.execute("INSERT INTO credit_card_invoice_payments VALUES ('pay','card','2026-11','a','c',3334,'2026-11-17','t','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO credit_card_invoice_payments VALUES ('pay2','card','2026-11','a','c',3334,'2026-11-17','t','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM transactions WHERE id='t'")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
    def test_migracao_nao_apaga_dados_anteriores(self):
        self.db.execute("INSERT INTO transactions VALUES ('old','a','c','EXPENSE',999,'Anterior','2026-10-09','now','now')")
        self.assertEqual(self.db.execute("SELECT amount_cents FROM transactions WHERE id='old'").fetchone()[0],999)


# Teste de atualização do banco preexistente sem tabelas de cartões.
class UpgradeTest(unittest.TestCase):
    def test_upgrade_from_v7_is_additive(self):
        db = sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        for num in range(1,8):
            schema(db,num)
        db.execute("INSERT INTO accounts VALUES ('old-a','Carteira','CASH',0,'now')")
        db.execute("INSERT INTO categories(id,name,type,color,icon) VALUES ('old-c','Compras','EXPENSE','#00AB00','🏷️')")
        db.execute("INSERT INTO transactions VALUES ('old-t','old-a','old-c','EXPENSE',3999,'Antiga','2026-09-02','now','now')")
        schema(db,8)
        self.assertEqual(db.execute("SELECT amount_cents FROM transactions WHERE id='old-t'").fetchone()[0],3999)
        self.assertEqual(db.execute("SELECT count(*) FROM credit_cards").fetchone()[0],0)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        db.close()

if __name__ == "__main__":
    unittest.main(verbosity=2)
