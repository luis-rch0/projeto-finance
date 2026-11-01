"""Execução SQL real, sem dependência do Expo ou internet."""
import sqlite3
import unittest

class AnalyticsQueryTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE transactions(date TEXT, type TEXT, amount_cents INTEGER)')
        self.db.executemany('INSERT INTO transactions VALUES (?,?,?)', [
            ('2026-07-01', 'INCOME', 10000),
            ('2026-08-02', 'EXPENSE', 5000),
            ('2026-08-03', 'EXPENSE', 2500),
            ('2026-09-01', 'INCOME', 16000),
            ('2026-09-02', 'EXPENSE', 6000),
            ('2026-10-05', 'EXPENSE', 200),
            ('2026-11-01', 'INCOME', 99000),  # não deve aparecer
        ])

    def test_grouped_monthly_aggregates_and_date_boundaries(self):
        sql = '''SELECT substr(date, 1, 7) AS month,
          COALESCE(SUM(CASE WHEN type='INCOME' THEN amount_cents ELSE 0 END), 0) AS income_cents,
          COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
          SUM(CASE WHEN type='INCOME' THEN 1 ELSE 0 END) AS income_count,
          SUM(CASE WHEN type='EXPENSE' THEN 1 ELSE 0 END) AS expense_count
       FROM transactions WHERE date >= ? AND date < ?
       GROUP BY substr(date, 1, 7) ORDER BY month ASC'''
        rows = self.db.execute(sql, ('2026-07-01', '2026-11-01')).fetchall()
        self.assertEqual(rows, [
            ('2026-07', 10000, 0, 1, 0),
            ('2026-08', 0, 7500, 0, 2),
            ('2026-09', 16000, 6000, 1, 1),
            ('2026-10', 0, 200, 0, 1),
        ])

if __name__ == '__main__':
    unittest.main()
