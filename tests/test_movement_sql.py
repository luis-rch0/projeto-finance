"""Valida consultas agregadas da visão rápida usando SQLite real, sem tocar no Android."""
import pathlib
import re
import sqlite3
import unittest

SOURCE = (pathlib.Path(__file__).resolve().parents[1] / 'src/database/repositories/transactionRepository.ts').read_text(encoding='utf-8')


def query(pattern: str) -> str:
    match = re.search(pattern, SOURCE, re.S)
    if not match:
        raise AssertionError('Consulta não localizada no repository')
    return match.group(1)


class MovementQueryTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
          CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, color TEXT, icon TEXT);
          CREATE TABLE transactions (id TEXT PRIMARY KEY, category_id TEXT, type TEXT,
                                      amount_cents INTEGER, date TEXT, created_at TEXT);
          INSERT INTO categories VALUES ('food','Alimentação','#ff0000','🍽️');
          INSERT INTO categories VALUES ('salary','Salário','#00ff00','💼');
          INSERT INTO transactions VALUES ('a','food','EXPENSE',1200,'2026-10-01','2026-10-01');
          INSERT INTO transactions VALUES ('b','food','EXPENSE',350,'2026-10-20','2026-10-20');
          INSERT INTO transactions VALUES ('c','food','EXPENSE',900,'2026-11-01','2026-11-01');
          INSERT INTO transactions VALUES ('d','salary','INCOME',350000,'2026-10-09','2026-10-09');
        ''')

    def tearDown(self):
        self.db.close()

    def test_monthly_overview_is_scoped_by_type_and_date(self):
        sql = query(r'getMonthlyTypeOverview.*?`(SELECT COALESCE\(SUM\(amount_cents\).*?date<\?)`')
        row = self.db.execute(sql, ('EXPENSE','2026-10-01','2026-11-01')).fetchone()
        self.assertEqual(row, (1550, 2))
        row = self.db.execute(sql, ('INCOME','2026-10-01','2026-11-01')).fetchone()
        self.assertEqual(row, (350000, 1))

    def test_category_totals_do_not_include_other_months(self):
        sql = query(r'getMonthlyCategoryTotals.*?`(SELECT c\.id.*?COLLATE NOCASE)`')
        rows = self.db.execute(sql, ('EXPENSE','2026-10-01','2026-11-01')).fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], 'food')
        self.assertEqual(rows[0][4:6], (1550, 2))


if __name__ == '__main__':
    unittest.main()
