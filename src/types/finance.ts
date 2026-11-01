export type MovementType = 'INCOME' | 'EXPENSE';
export type AccountType = 'CASH' | 'CHECKING' | 'SAVINGS' | 'OTHER';
export interface Account { id: string; name: string; type: AccountType; initial_balance_cents: number; created_at: string }
export interface Category { id: string; name: string; type: MovementType; color: string; icon: string; archived_at: string | null }
export interface FinanceTransaction { id: string; account_id: string; category_id: string; type: MovementType; amount_cents: number; description: string; date: string; created_at: string; updated_at: string }
export interface TransactionDetail extends FinanceTransaction { category_name: string; category_color: string; account_name: string; payment_kind: 'CASH' | 'PIX' | 'TRANSFER' | 'DEBIT' | 'OTHER' | null; payment_card_id: string | null }
export type NewTransaction = Pick<FinanceTransaction, 'account_id' | 'category_id' | 'type' | 'amount_cents' | 'description' | 'date'>;
export interface MonthlySummary { incomeCents: number; expenseCents: number }
export interface MovementFilters {
  type: MovementType;
  year: number;
  month: number;
  search?: string;
  categoryId?: string;
  accountId?: string;
  fromDate?: string;
  toDate?: string;
  minCents?: number;
  maxCents?: number;
}
export interface SavingsGoal { id: string; title: string; target_cents: number; target_date: string | null; created_at: string; updated_at: string; archived_at: string | null }
export interface SavingsGoalProgress extends SavingsGoal { saved_cents: number; contributions_count: number }
export interface GoalContribution { id: string; goal_id: string; amount_cents: number; date: string; created_at: string }
export interface MonthlyBudget { id: string; category_id: string; month: string; limit_cents: number; created_at: string; updated_at: string }
export interface MonthlyBudgetProgress extends Pick<MonthlyBudget, 'id' | 'category_id' | 'month' | 'limit_cents'> { category_name: string; spent_cents: number; is_recurring: number }
export type RecurrenceFrequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type OccurrenceStatus = 'PENDING' | 'CONFIRMED' | 'SKIPPED';
export interface RecurrenceRule {
  id: string; type: MovementType; account_id: string; category_id: string; amount_cents: number;
  description: string; frequency: RecurrenceFrequency; start_date: string; end_date: string | null;
  created_at: string; updated_at: string; archived_at: string | null;
}
export type NewRecurrence = Pick<RecurrenceRule, 'type' | 'account_id' | 'category_id' | 'amount_cents' | 'description' | 'frequency' | 'start_date' | 'end_date'>;
export interface RecurrenceOccurrence {
  id: string; rule_id: string; occurrence_date: string; status: OccurrenceStatus; transaction_id: string | null;
}
export interface OccurrenceDetail extends RecurrenceOccurrence {
  description: string; amount_cents: number; type: MovementType; frequency: RecurrenceFrequency;
  category_name: string;
}

export type InstallmentStatus = 'PENDING' | 'CONFIRMED' | 'SKIPPED';
export interface InstallmentPlan {
  id: string; description: string; account_id: string; category_id: string;
  total_cents: number; installments_count: number; first_due_date: string;
  created_at: string; archived_at: string | null;
}
export interface NewInstallment {
  description: string; account_id: string; category_id: string;
  total_cents: number; installments_count: number; first_due_date: string;
}
export interface InstallmentItem {
  id: string; plan_id: string; sequence: number; amount_cents: number;
  due_date: string; status: InstallmentStatus; transaction_id: string | null;
}
export interface InstallmentDetail extends InstallmentItem {
  description: string; installments_count: number; category_name: string;
}

/** Movimentação entre contas do próprio usuário, fora de receitas/despesas. */
export interface AccountTransfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount_cents: number;
  date: string;
  description: string;
  created_at: string;
}

export type NewAccountTransfer = Pick<
  AccountTransfer,
  'from_account_id' | 'to_account_id' | 'amount_cents' | 'date' | 'description'
>;

export interface AccountTransferDetail extends AccountTransfer {
  from_account_name: string;
  to_account_name: string;
}

export interface AccountWithBalance extends Account {
  balance_cents: number;
}
