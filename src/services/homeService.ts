import type { SQLiteDatabase } from 'expo-sqlite';
import { AnalyticsRepository } from '@/database/repositories/analyticsRepository';
import { DueService, type HomeUpcoming } from '@/services/dueService';

export interface HomeMonth { month: string; incomeCents: number; expenseCents: number }
export type DuePreview = HomeUpcoming;
export interface HomeSnapshot {
  incomeCents: number;
  expenseCents: number;
  history: HomeMonth[];
  upcoming: DuePreview[];
}

/** Home e Análises passam a usar a mesma consulta mensal. */
export class HomeService {
  private readonly analytics: AnalyticsRepository;
  private readonly due: DueService;
  constructor(private readonly db: SQLiteDatabase) {
    this.analytics = new AnalyticsRepository(db);
    this.due = new DueService(db);
  }

  async load(year: number, month: number): Promise<HomeSnapshot> {
    const [history, upcoming] = await Promise.all([
      this.analytics.getMonthlyTrend(year, month, 6),
      this.due.listHomeUpcoming(year, month),
    ]);
    const current = history[history.length - 1];
    return {
      incomeCents: current?.incomeCents ?? 0,
      expenseCents: current?.expenseCents ?? 0,
      history: history.map(({ month: key, incomeCents, expenseCents }) => ({
        month: key, incomeCents, expenseCents,
      })),
      upcoming,
    };
  }
}
