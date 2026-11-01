import type { SQLiteDatabase } from 'expo-sqlite';
import type { GoalContribution, SavingsGoal, SavingsGoalProgress } from '@/types/finance';

export class GoalRepository {
  constructor(private db: SQLiteDatabase) {}

  create(goal: SavingsGoal): Promise<unknown> {
    return this.db.runAsync(
      `INSERT INTO savings_goals (id,title,target_cents,target_date,created_at,updated_at,archived_at)
       VALUES (?,?,?,?,?,?,?)`,
      [goal.id, goal.title, goal.target_cents, goal.target_date, goal.created_at, goal.updated_at, null],
    );
  }

  findById(id: string): Promise<SavingsGoal | null> {
    return this.db.getFirstAsync<SavingsGoal>('SELECT * FROM savings_goals WHERE id=?', [id]);
  }

  findActive(): Promise<SavingsGoalProgress[]> {
    return this.db.getAllAsync<SavingsGoalProgress>(`
      SELECT g.*,
        COALESCE((SELECT SUM(amount_cents) FROM goal_contributions WHERE goal_id=g.id),0) AS saved_cents,
        (SELECT COUNT(*) FROM goal_contributions WHERE goal_id=g.id) AS contributions_count
      FROM savings_goals g WHERE g.archived_at IS NULL
      ORDER BY g.created_at DESC, g.id DESC
    `);
  }

  async updateDetails(id: string, title: string, targetCents: number, targetDate: string | null, now: string): Promise<void> {
    const result = await this.db.runAsync(
      'UPDATE savings_goals SET title=?,target_cents=?,target_date=?,updated_at=? WHERE id=? AND archived_at IS NULL',
      [title,targetCents,targetDate,now,id],
    );
    if (!result.changes) throw new Error('Objetivo não encontrado ou arquivado.');
  }

  async archive(id: string, now: string): Promise<void> {
    const result = await this.db.runAsync(
      'UPDATE savings_goals SET archived_at=?,updated_at=? WHERE id=? AND archived_at IS NULL',
      [now, now, id],
    );
    if (!result.changes) throw new Error('Meta não encontrada ou já arquivada.');
  }

  addContribution(contribution: GoalContribution): Promise<unknown> {
    return this.db.runAsync(
      'INSERT INTO goal_contributions (id,goal_id,amount_cents,date,created_at) VALUES (?,?,?,?,?)',
      [contribution.id, contribution.goal_id, contribution.amount_cents, contribution.date, contribution.created_at],
    );
  }

  findContributions(goalId: string): Promise<GoalContribution[]> {
    return this.db.getAllAsync<GoalContribution>(
      'SELECT * FROM goal_contributions WHERE goal_id=? ORDER BY date DESC,created_at DESC',
      [goalId],
    );
  }

  async deleteContribution(id: string, goalId: string): Promise<void> {
    const result = await this.db.runAsync(
      'DELETE FROM goal_contributions WHERE id=? AND goal_id=?', [id, goalId],
    );
    if (!result.changes) throw new Error('Aporte não encontrado.');
  }
}
