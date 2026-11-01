import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  AccountTransfer,
  AccountTransferDetail,
  AccountWithBalance,
} from '@/types/finance';

/** O extrato de transferências não integra os relatórios de consumo. */
export class TransferRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(transfer: AccountTransfer): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO account_transfers
        (id, from_account_id, to_account_id, amount_cents, date, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transfer.id,
        transfer.from_account_id,
        transfer.to_account_id,
        transfer.amount_cents,
        transfer.date,
        transfer.description,
        transfer.created_at,
      ],
    );
  }

  listRecent(limit = 50): Promise<AccountTransferDetail[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Limite de histórico inválido.');
    }

    return this.db.getAllAsync<AccountTransferDetail>(
      `SELECT t.*, origin.name AS from_account_name, destination.name AS to_account_name
       FROM account_transfers t
       JOIN accounts origin ON origin.id = t.from_account_id
       JOIN accounts destination ON destination.id = t.to_account_id
       ORDER BY t.date DESC, t.created_at DESC, t.id DESC
       LIMIT ?`,
      [limit],
    );
  }

  /** Saldo = inicial + receitas - despesas + entradas - saídas entre contas. */
  listAccountsWithBalance(): Promise<AccountWithBalance[]> {
    return this.db.getAllAsync<AccountWithBalance>(
      `SELECT a.*,
        a.initial_balance_cents
        + COALESCE((SELECT SUM(CASE WHEN type='INCOME' THEN amount_cents ELSE -amount_cents END)
                    FROM transactions WHERE account_id=a.id), 0)
        + COALESCE((SELECT SUM(amount_cents) FROM account_transfers WHERE to_account_id=a.id), 0)
        - COALESCE((SELECT SUM(amount_cents) FROM account_transfers WHERE from_account_id=a.id), 0)
          AS balance_cents
       FROM accounts a ORDER BY a.name COLLATE NOCASE`,
    );
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.runAsync(
      'DELETE FROM account_transfers WHERE id = ?',
      [id],
    );
    if (!result.changes) throw new Error('Transferência não encontrada.');
  }
}
