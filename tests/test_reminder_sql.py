import sqlite3
import unittest

class ReminderSQLTest(unittest.TestCase):
    def test_only_pending_and_non_archived_items(self):
        db = sqlite3.connect(':memory:')
        db.executescript('''
            CREATE TABLE installment_plans(id TEXT PRIMARY KEY, description TEXT, archived_at TEXT);
            CREATE TABLE installment_items(id TEXT, plan_id TEXT, due_date TEXT, status TEXT);
            CREATE TABLE recurrence_rules(id TEXT PRIMARY KEY, description TEXT, archived_at TEXT, type TEXT);
            CREATE TABLE recurrence_occurrences(id TEXT, rule_id TEXT, occurrence_date TEXT, status TEXT);
            INSERT INTO installment_plans VALUES('p','Internet',NULL),('old','Antigo','2026-01-01');
            INSERT INTO installment_items VALUES('i1','p','2026-11-01','PENDING'),('i2','p','2026-11-02','CONFIRMED'),('i3','old','2026-11-03','PENDING');
            INSERT INTO recurrence_rules VALUES('r','Aluguel',NULL,'EXPENSE'),('arch','Antiga', '2026-01-01', 'EXPENSE');
            INSERT INTO recurrence_occurrences VALUES('o1','r','2026-11-01','PENDING'),('o2','r','2026-11-05','SKIPPED'),('o3','arch','2026-11-07','PENDING');
        ''')
        installments = db.execute('''SELECT i.id FROM installment_items i JOIN installment_plans p ON p.id=i.plan_id
          WHERE i.status='PENDING' AND p.archived_at IS NULL AND i.due_date >= ? AND i.due_date <= ?''',
            ('2026-11-01','2026-11-30')).fetchall()
        recurring = db.execute('''SELECT o.id FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.rule_id
          WHERE o.status='PENDING' AND r.archived_at IS NULL AND o.occurrence_date >= ? AND o.occurrence_date <= ?''',
            ('2026-11-01','2026-11-30')).fetchall()
        self.assertEqual(installments, [('i1',)])
        self.assertEqual(recurring, [('o1',)])

if __name__ == '__main__': unittest.main()
