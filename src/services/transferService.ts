import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { TransferRepository } from '@/database/repositories/transferRepository';
import type { NewAccountTransfer } from '@/types/finance';
import { validDate } from '@/utils/date';

export class TransferService {
  private readonly repository: TransferRepository;

  constructor(private readonly db: SQLiteDatabase) {
    this.repository = new TransferRepository(db);
  }

  listAccountsWithBalance() {
    return this.repository.listAccountsWithBalance();
  }

  listRecent(limit = 50) {
    return this.repository.listRecent(limit);
  }

  async create(input: NewAccountTransfer): Promise<void> {
    if (!input.from_account_id || !input.to_account_id) {
      throw new Error('Selecione as contas de origem e destino.');
    }
    if (input.from_account_id === input.to_account_id) {
      throw new Error('Origem e destino devem ser contas diferentes.');
    }
    if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) {
      throw new Error('Informe um valor positivo válido.');
    }
    if (!validDate(input.date)) {
      throw new Error('Informe uma data válida no formato DD/MM/AAAA.');
    }
    if (typeof input.description !== 'string') {
      throw new Error('Descrição inválida.');
    }
    const description = input.description.trim();
    if (description.length > 160) {
      throw new Error('A descrição deve ter até 160 caracteres.');
    }

    await this.db.withExclusiveTransactionAsync(async tx => {
      const accounts = await tx.getAllAsync<{ id: string }>(
        'SELECT id FROM accounts WHERE id IN (?, ?)',
        [input.from_account_id, input.to_account_id],
      );
      if (accounts.length !== 2) {
        throw new Error('Uma das contas não existe mais. Atualize a lista.');
      }

      await new TransferRepository(tx).create({
        ...input,
        id: Crypto.randomUUID(),
        description,
        created_at: new Date().toISOString(),
      });
    });
  }

  async delete(id: string): Promise<void> {
    if (!id) throw new Error('Selecione uma transferência válida.');
    await this.repository.delete(id);
  }
}
