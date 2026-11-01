import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { AccountRepository } from '@/database/repositories/accountRepository';
import { CategoryRepository } from '@/database/repositories/categoryRepository';
import { RecurrenceRepository } from '@/database/repositories/recurrenceRepository';
import type { NewRecurrence } from '@/types/finance';
import { validDate } from '@/utils/date';
import { datesForMonth } from '@/utils/recurrence';

export class RecurrenceService {
  readonly rules: RecurrenceRepository;
  private accounts: AccountRepository;
  private categories: CategoryRepository;
  constructor(private db: SQLiteDatabase) {
    this.rules = new RecurrenceRepository(db);
    this.accounts = new AccountRepository(db);
    this.categories = new CategoryRepository(db);
  }
  async create(input: NewRecurrence): Promise<void> {
    if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) throw new Error('Valor inválido.');
    if (!input.description.trim() || input.description.trim().length > 150) throw new Error('Descrição inválida.');
    if (!validDate(input.start_date) || (input.end_date && (!validDate(input.end_date) || input.end_date < input.start_date))) {
      throw new Error('Datas da recorrência inválidas.');
    }
    if (!['WEEKLY','MONTHLY','YEARLY'].includes(input.frequency)) throw new Error('Frequência inválida.');
    const [account, category] = await Promise.all([
      this.accounts.findById(input.account_id), this.categories.findById(input.category_id),
    ]);
    if (!account || !category || category.archived_at || category.type !== input.type) throw new Error('Conta ou categoria inválida.');
    const now = new Date().toISOString();
    await this.rules.create({ ...input, description: input.description.trim(), id: Crypto.randomUUID(), created_at: now,
      updated_at: now, archived_at: null });
  }
  async listMonth(year: number, month: number) {
    await this.db.withExclusiveTransactionAsync(async tx => {
      // Geramos ocorrências sob demanda somente no mês exibido.
      const rules = await tx.getAllAsync<{
        id: string; start_date: string; end_date: string | null; frequency: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
      }>('SELECT id,start_date,end_date,frequency FROM recurrence_rules WHERE archived_at IS NULL');
      for (const rule of rules) {
        for (const date of datesForMonth(rule.start_date,rule.end_date,rule.frequency,year,month)) {
          await tx.runAsync(`INSERT OR IGNORE INTO recurrence_occurrences
            (id,rule_id,occurrence_date,status,transaction_id) VALUES (?,?,?,'PENDING',NULL)`,
          [Crypto.randomUUID(),rule.id,date]);
        }
      }
    });
    return this.rules.findMonth(year,month);
  }
  /** Edita apenas uma ocorrência pendente. A data original permanece como chave
   * da recorrência para evitar que o próximo refresh a recrie duplicada. */
  async editOccurrence(
    id: string,
    input: { date: string; amount_cents: number; description: string },
  ): Promise<void> {
    const description = input.description.trim();
    if (!validDate(input.date)) throw new Error('Data inválida (DD/MM/AAAA).');
    if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) throw new Error('Valor inválido.');
    if (!description || description.length > 150) throw new Error('Descrição deve ter de 1 a 150 caracteres.');
    await this.db.withExclusiveTransactionAsync(async tx => {
      const row = await tx.getFirstAsync<{
        status: string; archived_at: string | null; occurrence_date: string;
        amount_cents: number; description: string;
      }>(`SELECT o.status,r.archived_at,o.occurrence_date,r.amount_cents,r.description
          FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.rule_id
          WHERE o.id=?`, [id]);
      if (!row || row.archived_at || row.status !== 'PENDING') {
        throw new Error('Somente vencimentos recorrentes pendentes e ativos podem ser editados.');
      }
      const result = await tx.runAsync(`UPDATE recurrence_occurrences
        SET override_date=?, override_cents=?, override_description=?
        WHERE id=? AND status='PENDING' AND transaction_id IS NULL`, [
        input.date === row.occurrence_date ? null : input.date,
        input.amount_cents === row.amount_cents ? null : input.amount_cents,
        description === row.description ? null : description,
        id,
      ]);
      if (!result.changes) throw new Error('Não foi possível atualizar o vencimento.');
    });
  }

  async confirm(id: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async tx => {
      const row = await tx.getFirstAsync<{
        status: string; transaction_id: string | null; archived_at: string | null;
        type: string; account_id: string; category_id: string; amount_cents: number;
        description: string; occurrence_date: string;
      }>(`SELECT o.status,o.transaction_id,r.archived_at,r.type,r.account_id,r.category_id,
        COALESCE(o.override_cents,r.amount_cents) AS amount_cents,
        COALESCE(o.override_description,r.description) AS description,
        COALESCE(o.override_date,o.occurrence_date) AS occurrence_date FROM recurrence_occurrences o
        JOIN recurrence_rules r ON r.id=o.rule_id WHERE o.id=?`, [id]);
      if (!row || row.status !== 'PENDING' || row.archived_at) throw new Error('Ocorrência não está pendente.');
      const category = await tx.getFirstAsync<{ archived_at: string | null }>('SELECT archived_at FROM categories WHERE id=?',[row.category_id]);
      if (!category || category.archived_at) throw new Error('Categoria arquivada. Atualize a recorrência.');
      const now = new Date().toISOString();
      const transactionId = Crypto.randomUUID();
      await tx.runAsync(`INSERT INTO transactions
        (id,account_id,category_id,type,amount_cents,description,date,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`,
      [transactionId,row.account_id,row.category_id,row.type,row.amount_cents,row.description,
        row.occurrence_date,now,now]);
      const result = await tx.runAsync(`UPDATE recurrence_occurrences SET status='CONFIRMED',transaction_id=?
        WHERE id=? AND status='PENDING'`,[transactionId,id]);
      if (!result.changes) throw new Error('Ocorrência já processada.');
    });
  }
  async skip(id: string): Promise<void> {
    const result = await this.db.runAsync(`UPDATE recurrence_occurrences SET status='SKIPPED'
      WHERE id=? AND status='PENDING'`,[id]);
    if (!result.changes) throw new Error('Somente ocorrências pendentes podem ser ignoradas.');
  }
  async reopen(id: string): Promise<void> {
    const result = await this.db.runAsync(`UPDATE recurrence_occurrences SET status='PENDING'
      WHERE id=? AND status='SKIPPED'`,[id]);
    if (!result.changes) throw new Error('Somente ocorrências ignoradas podem ser reabertas.');
  }
  archive(id: string) { return this.rules.archive(id); }
}
