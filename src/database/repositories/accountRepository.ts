import type { SQLiteDatabase } from 'expo-sqlite';
import type { Account } from '@/types/finance';

export class AccountRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(account: Account): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO accounts
        (id, name, type, initial_balance_cents, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        account.id,
        account.name,
        account.type,
        account.initial_balance_cents,
        account.created_at,
      ],
    );
  }

  findAll(): Promise<Account[]> {
    return this.db.getAllAsync<Account>(
      'SELECT * FROM accounts ORDER BY name',
    );
  }

  findById(id: string): Promise<Account | null> {
    return this.db.getFirstAsync<Account>(
      'SELECT * FROM accounts WHERE id = ?',
      [id],
    );
  }

  async update(account: Account): Promise<void> {
    const result = await this.db.runAsync(
      `UPDATE accounts SET name = ?, type = ?, initial_balance_cents = ?
       WHERE id = ?`,
      [account.name, account.type, account.initial_balance_cents, account.id],
    );
    if (!result.changes) throw new Error('Conta não encontrada.');
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.runAsync(
      `DELETE FROM accounts
       WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM transactions WHERE account_id = ?)
         AND NOT EXISTS (
           SELECT 1 FROM account_transfers
           WHERE from_account_id = ? OR to_account_id = ?
         )`,
      [id, id, id, id],
    );
    if (!result.changes) {
      throw new Error('Conta inexistente ou vinculada a movimentações ou transferências.');
    }
  }
}
