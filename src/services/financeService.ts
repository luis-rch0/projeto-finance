import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { AccountRepository } from '@/database/repositories/accountRepository';
import { CategoryRepository } from '@/database/repositories/categoryRepository';
import { TransactionRepository } from '@/database/repositories/transactionRepository';
import type { FinanceTransaction, MovementFilters, MovementType, NewTransaction } from '@/types/finance';
import { validDate } from '@/utils/date';

export class FinanceService {
  readonly accounts: AccountRepository;
  private db: SQLiteDatabase;
  readonly categories: CategoryRepository;
  readonly transactions: TransactionRepository;

  constructor(db: SQLiteDatabase) {
    this.db = db;
    this.accounts = new AccountRepository(db);
    this.categories = new CategoryRepository(db);
    this.transactions = new TransactionRepository(db);
  }

  async createTransaction(input: NewTransaction): Promise<void> {
    if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) throw new Error('O valor deve ser positivo.');
    if (!validDate(input.date)) throw new Error('Data inválida. Use DD/MM/AAAA.');
    if (!input.description.trim()) throw new Error('Informe uma descrição.');
    if (input.type !== 'INCOME' && input.type !== 'EXPENSE') throw new Error('Tipo inválido.');
    const [account, category] = await Promise.all([
      this.accounts.findById(input.account_id), this.categories.findById(input.category_id),
    ]);
    if (!account) throw new Error('Selecione uma conta válida.');
    if (!category || category.archived_at || category.type !== input.type) throw new Error('Selecione uma categoria compatível.');
    const now = new Date().toISOString();
    await this.transactions.create({ ...input, description: input.description.trim(),
      id: Crypto.randomUUID(), created_at: now, updated_at: now });
  }

  async updateTransaction(input: FinanceTransaction): Promise<void> {
    const linkedCardInvoice = await this.db.getFirstAsync<{ id: string }>(
      'SELECT id FROM credit_card_invoice_payments WHERE transaction_id=?', [input.id]);
    if (linkedCardInvoice) throw new Error('Para modificar o pagamento de uma fatura, estorne-o na tela de Cartões.');
    const existing = await this.transactions.findById(input.id);
    if (!existing) throw new Error('Movimentação não encontrada.');
    if (existing.payment_kind === 'DEBIT' &&
      (existing.account_id !== input.account_id || input.type !== 'EXPENSE')) {
      throw new Error('Este débito está associado a um cartão. Para mudar a conta ou o tipo, exclua e registre um novo lançamento.');
    }
    if (!validDate(input.date) || !Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0 || !input.description.trim()) {
      throw new Error('Dados inválidos.');
    }
    const [account, category] = await Promise.all([
      this.accounts.findById(input.account_id), this.categories.findById(input.category_id),
    ]);
    if (!account || !category || category.type !== input.type || (category.archived_at && category.id !== existing.category_id)) throw new Error('Conta ou categoria inválida.');
    await this.transactions.update({ ...input, created_at: existing.created_at, description: input.description.trim(), updated_at: new Date().toISOString() });
  }

  async getMovementOverview(year: number, month: number, type: MovementType) {
    const [totals, recent] = await Promise.all([
      this.transactions.getMonthlyTypeOverview(year, month, type),
      this.transactions.findRecentByMonthAndType(year, month, type, 5),
    ]);
    return { ...totals, recent };
  }

  async getCategoryOverview(year: number, month: number, type: MovementType) {
    const rows = await this.transactions.getMonthlyCategoryTotals(year, month, type);
    const totalCents = rows.reduce((sum, row) => sum + row.cents, 0);
    return rows.map(row => ({ ...row, percent: totalCents > 0 ? row.cents / totalCents * 100 : 0 }));
  }

  searchMovements(filters: MovementFilters) {
    if (filters.fromDate && !validDate(filters.fromDate)) throw new Error('Data inicial inválida.');
    if (filters.toDate && !validDate(filters.toDate)) throw new Error('Data final inválida.');
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) throw new Error('A data inicial é posterior à final.');
    if (filters.minCents !== undefined && (!Number.isSafeInteger(filters.minCents) || filters.minCents < 0)) throw new Error('Valor mínimo inválido.');
    if (filters.maxCents !== undefined && (!Number.isSafeInteger(filters.maxCents) || filters.maxCents < 0)) throw new Error('Valor máximo inválido.');
    return this.transactions.search(filters);
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async tx => {
      const linkedCardInvoice = await tx.getFirstAsync<{ id: string }>(
        'SELECT id FROM credit_card_invoice_payments WHERE transaction_id=?', [id]);
      if (linkedCardInvoice) throw new Error('Estorne primeiro a fatura na tela de Cartões.');
      // Uma confirmação de recorrência volta a ficar pendente se o registro for excluído.
      await tx.runAsync(`UPDATE recurrence_occurrences SET status='PENDING',transaction_id=NULL WHERE transaction_id=?`, [id]);
      await tx.runAsync(`UPDATE installment_items SET status='PENDING',transaction_id=NULL WHERE transaction_id=?`, [id]);
      const result = await tx.runAsync('DELETE FROM transactions WHERE id=?', [id]);
      if (!result.changes) throw new Error('Movimentação não encontrada.');
    });
  }

  listMovements(year: number, month: number, type: MovementType) {
    return this.transactions.findByMonthAndType(year, month, type);
  }

  monthlyComparison(year: number, month: number) {
    return this.transactions.getMonthlySummary(year, month);
  }
}
