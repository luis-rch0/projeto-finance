"""Testes com SQLite real: python tests/test_backup_roundtrip.py"""
import re
import sqlite3
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
ORDER = [
    'accounts','categories','savings_goals','transactions','goal_contributions',
    'monthly_budgets','recurrence_rules','recurrence_occurrences',
    'installment_plans','installment_items','budget_recurrence_rules',
]

def make_database():
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    for num in range(1, 7):
        text = (BASE/'src'/'database'/'migrations'/f'migration{num:03}.ts').read_text(encoding='utf8')
        query = re.search(r'db\.execAsync\(`(.*?)`\)', text, re.S)
        assert query, f'Migração {num} não encontrada'
        db.executescript(query.group(1))
    return db

def seed(db):
    now = '2026-10-13T12:00:00Z'
    statements = [
        ('INSERT INTO accounts VALUES (?,?,?,?,?)', ('acc','Carteira','CASH',10000,now)),
        ('INSERT INTO categories VALUES (?,?,?,?,?,?)', ('cat-food','Alimentação','EXPENSE','#123456','1',None)),
        ('INSERT INTO categories VALUES (?,?,?,?,?,?)', ('cat-salary','Salário','INCOME','#654321','2',None)),
        ('INSERT INTO savings_goals VALUES (?,?,?,?,?,?,?)', ('goal','Viagem',600000,'2027-06-01',now,now,None)),
        ('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?)', ('tx-exp','acc','cat-food','EXPENSE',5000,'Compra','2026-10-13',now,now)),
        ('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?)', ('tx-inc','acc','cat-salary','INCOME',200000,'Salário','2026-10-12',now,now)),
        ('INSERT INTO goal_contributions VALUES (?,?,?,?,?)', ('contrib','goal',7000,'2026-10-13',now)),
        ('INSERT INTO monthly_budgets VALUES (?,?,?,?,?,?)', ('budget','cat-food','2026-10',40000,now,now)),
        ('INSERT INTO recurrence_rules VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
         ('rule','EXPENSE','acc','cat-food',5000,'Compra','MONTHLY','2026-10-13',None,now,now,None)),
        ('INSERT INTO recurrence_occurrences VALUES (?,?,?,?,?)', ('occ','rule','2026-10-13','CONFIRMED','tx-exp')),
        ('INSERT INTO installment_plans VALUES (?,?,?,?,?,?,?,?,?)', ('plan','Compra parcelada','acc','cat-food',10001,2,'2026-10-31',now,None)),
        ('INSERT INTO installment_items VALUES (?,?,?,?,?,?,?)', ('item1','plan',1,5001,'2026-10-31','PENDING',None)),
        ('INSERT INTO installment_items VALUES (?,?,?,?,?,?,?)', ('item2','plan',2,5000,'2026-11-30','PENDING',None)),
    ]
    for sql, values in statements:
        db.execute(sql, values)
    db.commit()

def snapshot(db):
    return {table:[dict(row) for row in db.execute(f'SELECT * FROM {table} ORDER BY id')] for table in ORDER}

def apply_restore(db, data, fail_on=None):
    # Mesmo fluxo SQL usado pelo backupService: DELETE reverso e INSERT normal em UMA transação.
    with db:
        for table in reversed(ORDER):
            db.execute(f'DELETE FROM {table}')
        for table in ORDER:
            rows = data[table]
            if rows:
                cols = list(rows[0].keys())
                sql = f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})"
                for row in rows:
                    if fail_on == row['id']:
                        raise RuntimeError('Falha simulada durante a restauração')
                    db.execute(sql, [row[col] for col in cols])
            count = db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
            if count != len(rows):
                raise RuntimeError('Contagem inesperada')
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('Chave estrangeira inválida')
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise RuntimeError('Banco inconsistente')

class BackupRoundtripTest(unittest.TestCase):
    def setUp(self):
        self.db = make_database()
        seed(self.db)

    def tearDown(self):
        self.db.close()

    def test_roundtrip_com_todas_as_tabelas(self):
        original = snapshot(self.db)
        self.db.execute('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?)',
            ('extra','acc','cat-food','EXPENSE',999,'Teste temporário','2026-10-14',
             '2026-10-13T12:00:00Z','2026-10-13T12:00:00Z'))
        self.db.commit()
        apply_restore(self.db, original)
        self.assertEqual(snapshot(self.db), original)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_erro_durante_importacao_faz_rollback_completo(self):
        original = snapshot(self.db)
        with self.assertRaisesRegex(RuntimeError, 'Falha simulada'):
            apply_restore(self.db, original, fail_on='tx-inc')
        self.assertEqual(snapshot(self.db), original)

    def test_chave_estrangeira_inexistente_faz_rollback_completo(self):
        original = snapshot(self.db)
        invalid = snapshot(self.db)
        invalid['transactions'][0]['account_id'] = 'nao-existe'
        with self.assertRaises(sqlite3.IntegrityError):
            apply_restore(self.db, invalid)
        self.assertEqual(snapshot(self.db), original)

if __name__ == '__main__':
    unittest.main(verbosity=2)
