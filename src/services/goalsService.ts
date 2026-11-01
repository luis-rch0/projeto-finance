import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { GoalRepository } from '@/database/repositories/goalRepository';
import { BudgetRepository } from '@/database/repositories/budgetRepository';
import { CategoryRepository } from '@/database/repositories/categoryRepository';
import { validDate } from '@/utils/date';

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('Informe um valor positivo válido.');
}
function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
}

export class GoalsService {
  readonly goals: GoalRepository;
  readonly budgets: BudgetRepository;
  private categories: CategoryRepository;

  constructor(db: SQLiteDatabase) {
    this.goals = new GoalRepository(db);
    this.budgets = new BudgetRepository(db);
    this.categories = new CategoryRepository(db);
  }

  async createSavingsGoal(title: string, targetCents: number, targetDate: string | null): Promise<void> {
    assertCents(targetCents);
    if (!title.trim()) throw new Error('Informe um nome para a meta.');
    if (targetDate && !validDate(targetDate)) throw new Error('A data deve estar no formato DD/MM/AAAA.');
    const now = new Date().toISOString();
    await this.goals.create({
      id: Crypto.randomUUID(), title: title.trim(), target_cents: targetCents,
      target_date: targetDate || null, created_at: now, updated_at: now, archived_at: null,
    });
  }

  async contribute(goalId: string, amountCents: number, date: string): Promise<void> {
    assertCents(amountCents);
    if (!validDate(date)) throw new Error('Data inválida.');
    const goal = await this.goals.findById(goalId);
    if (!goal || goal.archived_at) throw new Error('Meta não encontrada ou arquivada.');
    await this.goals.addContribution({
      id: Crypto.randomUUID(), goal_id: goalId, amount_cents: amountCents,
      date, created_at: new Date().toISOString(),
    });
  }

  async editSavingsGoal(goalId: string, title: string, targetCents: number, targetDate: string | null): Promise<void> {
    assertCents(targetCents);
    if (!title.trim()) throw new Error('Informe um nome para a meta.');
    if (targetDate && !validDate(targetDate)) throw new Error('Prazo inválido (DD/MM/AAAA).');
    const original = await this.goals.findById(goalId);
    if (!original || original.archived_at) throw new Error('Meta indisponível para edição.');
    await this.goals.updateDetails(goalId, title.trim(), targetCents, targetDate, new Date().toISOString());
  }

  archive(goalId: string): Promise<void> {
    return this.goals.archive(goalId, new Date().toISOString());
  }

  async setMonthlyLimit(categoryId: string, month: string, limitCents: number): Promise<void> {
    assertMonth(month);
    assertCents(limitCents);
    const category = await this.categories.findById(categoryId);
    if (!category || category.archived_at || category.type !== 'EXPENSE') throw new Error('Selecione uma categoria de despesa válida.');
    const now = new Date().toISOString();
    await this.budgets.upsert({
      id: Crypto.randomUUID(), category_id: categoryId, month,
      limit_cents: limitCents, created_at: now, updated_at: now,
    });
  }
  /** Atualiza o limite padrão do mês informado em diante; meses anteriores ficam intactos. */
  async setRepeatingLimit(categoryId: string, startMonth: string, limitCents: number): Promise<void> {
    assertMonth(startMonth);
    assertCents(limitCents);
    const category = await this.categories.findById(categoryId);
    if (!category || category.archived_at || category.type !== 'EXPENSE') throw new Error('Categoria de despesa inválida.');
    await this.budgets.saveRule({
      id: Crypto.randomUUID(), category_id: categoryId, start_month: startMonth,
      limit_cents: limitCents, enabled: 1, created_at: new Date().toISOString(),
    });
  }

  async stopRepeatingLimit(categoryId: string, startMonth: string): Promise<void> {
    assertMonth(startMonth);
    const active = await this.budgets.findRuleForMonth(categoryId, startMonth);
    if (!active || !active.enabled) throw new Error('Nenhum limite recorrente ativo neste mês.');
    await this.budgets.saveRule({
      id: Crypto.randomUUID(), category_id: categoryId, start_month: startMonth,
      limit_cents: 0, enabled: 0, created_at: new Date().toISOString(),
    });
  }

}
