import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { AccountType, NewTransaction } from '@/types/finance';
import { validDate } from '@/utils/date';
import { validCardDay } from '@/utils/creditCards';
import { CreditCardService } from '@/services/creditCardService';

export interface PaymentCard {
  id: string;
  name: string;
  linked_account_id: string | null;
  allows_debit: number;
  allows_credit: number;
  closing_day: number | null;
  due_day: number | null;
  archived_at: string | null;
  deleted_at: string | null;
}
export interface CardDraft {
  name: string;
  linkedAccountId: string | null;
  debit: boolean;
  credit: boolean;
  closingDay?: number;
  dueDay?: number;
}
export type PaymentOption =
  | { method: 'ACCOUNT'; accountId: string; kind: 'CASH'|'PIX'|'TRANSFER'|'OTHER' }
  | { method: 'DEBIT'; cardId: string }
  | { method: 'CREDIT'; cardId: string; installmentsCount: number };

const activeCardSql = `SELECT pc.*, cc.closing_day, cc.due_day FROM payment_cards pc
 LEFT JOIN credit_cards cc ON cc.id=pc.id`;

export class PaymentService {
  private readonly credit: CreditCardService;
  constructor(private readonly db: SQLiteDatabase) { this.credit = new CreditCardService(db); }

  /** Por padrão esconde os excluídos; o histórico continua no banco. */
  listCards(includeRemoved = false): Promise<PaymentCard[]> {
    const where = includeRemoved ? '' : ' WHERE pc.deleted_at IS NULL';
    return this.db.getAllAsync<PaymentCard>(
      `${activeCardSql}${where} ORDER BY pc.archived_at IS NOT NULL, pc.name COLLATE NOCASE`
    );
  }

  async saveAccount(input: { id?: string; name: string; type: AccountType }): Promise<void> {
    const name = input.name.trim();
    if (!name || name.length > 80 || !['CASH','CHECKING','SAVINGS','OTHER'].includes(input.type)) {
      throw new Error('Informe um nome e tipo de conta válidos.');
    }
    if (input.id) {
      const result = await this.db.runAsync('UPDATE accounts SET name=?,type=? WHERE id=?',
        [name,input.type,input.id]);
      if (!result.changes) throw new Error('Conta não encontrada.');
    } else {
      await this.db.runAsync(`INSERT INTO accounts (id,name,type,initial_balance_cents,created_at)
        VALUES (?,?,?,0,?)`, [Crypto.randomUUID(),name,input.type,new Date().toISOString()]);
    }
  }

  async saveCard(input: CardDraft, id?: string): Promise<void> {
    const name = input.name.trim();
    if (!name || name.length > 80 || (!input.debit && !input.credit)) {
      throw new Error('Informe um nome e ao menos uma modalidade.');
    }
    if (input.debit && !input.linkedAccountId) throw new Error('Selecione a conta associada ao débito.');
    if (input.credit && (!validCardDay(input.closingDay ?? 0) || !validCardDay(input.dueDay ?? 0))) {
      throw new Error('Fechamento e vencimento devem ficar entre os dias 1 e 28.');
    }
    await this.db.withExclusiveTransactionAsync(async tx => {
      if (input.linkedAccountId) {
        const account = await tx.getFirstAsync<{id:string}>('SELECT id FROM accounts WHERE id=?',[input.linkedAccountId]);
        if (!account) throw new Error('Conta vinculada não encontrada.');
      }
      const timestamp = new Date().toISOString();
      const cardId = id ?? Crypto.randomUUID();
      if (id) {
        const old = await tx.getFirstAsync<PaymentCard>(`${activeCardSql} WHERE pc.id=?`,[id]);
        if (!old || old.deleted_at) throw new Error('Cartão não disponível para edição.');
        if (old.allows_credit && !input.credit) {
          const used = await tx.getFirstAsync<{id:string}>('SELECT id FROM credit_card_purchases WHERE card_id=? LIMIT 1',[id]);
          if (used) throw new Error('O cartão possui compras: mantenha a opção crédito ativa.');
          await tx.runAsync('DELETE FROM credit_cards WHERE id=?',[id]);
        }
        await tx.runAsync(`UPDATE payment_cards SET name=?,linked_account_id=?,allows_debit=?,allows_credit=? WHERE id=?`,
          [name,input.linkedAccountId,Number(input.debit),Number(input.credit),id]);
      } else {
        await tx.runAsync(`INSERT INTO payment_cards
          (id,name,linked_account_id,allows_debit,allows_credit,created_at,archived_at)
          VALUES (?,?,?,?,?,?,NULL)`,
          [cardId,name,input.linkedAccountId,Number(input.debit),Number(input.credit),timestamp]);
      }
      if (input.credit) {
        const present = await tx.getFirstAsync<{id:string}>('SELECT id FROM credit_cards WHERE id=?',[cardId]);
        if (present) {
          // Evita realocar compras antigas para outro ciclo de fatura.
          const used = await tx.getFirstAsync<{id:string}>('SELECT id FROM credit_card_purchases WHERE card_id=? LIMIT 1',[cardId]);
          const old = await tx.getFirstAsync<{closing_day:number;due_day:number}>(
            'SELECT closing_day,due_day FROM credit_cards WHERE id=?',[cardId]);
          if (used && (old?.closing_day !== input.closingDay || old?.due_day !== input.dueDay)) {
            throw new Error('Não é possível mudar o ciclo de um cartão com compras.');
          }
          await tx.runAsync('UPDATE credit_cards SET name=?,closing_day=?,due_day=? WHERE id=?',
            [name,input.closingDay!,input.dueDay!,cardId]);
        } else {
          await tx.runAsync(`INSERT INTO credit_cards(id,name,closing_day,due_day,created_at,archived_at)
            VALUES (?,?,?,?,?,NULL)`,[cardId,name,input.closingDay!,input.dueDay!,timestamp]);
        }
      }
    });
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async tx => {
      const date = archived ? new Date().toISOString() : null;
      const result = await tx.runAsync('UPDATE payment_cards SET archived_at=? WHERE id=? AND deleted_at IS NULL',[date,id]);
      if (!result.changes) throw new Error('Cartão não encontrado.');
      await tx.runAsync('UPDATE credit_cards SET archived_at=? WHERE id=?',[date,id]);
    });
  }

  /** Excluir da lista, sem DELETE físico ou CASCADE: tudo no histórico permanece. */
  async setRemoved(id: string, removed: boolean): Promise<void> {
    const value = removed ? new Date().toISOString() : null;
    const result = await this.db.runAsync(
      `UPDATE payment_cards SET deleted_at=?
       WHERE id=? AND ${removed ? 'deleted_at IS NULL' : 'deleted_at IS NOT NULL'}`,
      [value, id]
    );
    if (result.changes !== 1) {
      throw new Error(removed ? 'Cartão não encontrado ou já removido.' : 'Cartão não encontrado ou não removido.');
    }
  }

  /** Conta e débito entram no caixa; compra de crédito entra somente na fatura. */
  async registerExpense(input: Omit<NewTransaction,'type'|'account_id'>, payment: PaymentOption): Promise<void> {
    if (!validDate(input.date) || !input.description.trim() ||
      !Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) {
      throw new Error('Confira data, descrição e valor da despesa.');
    }
    const category = await this.db.getFirstAsync<{id:string}>(
      `SELECT id FROM categories WHERE id=? AND type='EXPENSE' AND archived_at IS NULL`,[input.category_id]);
    if (!category) throw new Error('Selecione uma categoria de despesa válida.');
    if (payment.method === 'CREDIT') {
      const card = await this.getActiveCard(payment.cardId);
      if (!card.allows_credit) throw new Error('Este cartão não aceita crédito.');
      if (!Number.isInteger(payment.installmentsCount) || payment.installmentsCount < 1 ||
        payment.installmentsCount > 60) throw new Error('Digite uma quantidade entre 1 e 60 parcelas.');
      await this.credit.createPurchase({ card_id: card.id, category_id: input.category_id,
        purchase_date: input.date, total_cents: input.amount_cents,
        description: input.description, installments_count: payment.installmentsCount });
      return;
    }
    let accountId: string;
    let kind: string;
    let cardId: string | null = null;
    if (payment.method === 'DEBIT') {
      const card = await this.getActiveCard(payment.cardId);
      if (!card.allows_debit || !card.linked_account_id) throw new Error('Cartão sem conta de débito válida.');
      accountId=card.linked_account_id;
      cardId=card.id;
      kind='DEBIT';
    } else {
      accountId=payment.accountId;
      kind=payment.kind;
    }
    await this.db.withExclusiveTransactionAsync(async tx => {
      const account = await tx.getFirstAsync<{id:string}>('SELECT id FROM accounts WHERE id=?',[accountId]);
      if (!account) throw new Error('Conta de pagamento inválida.');
      const id=Crypto.randomUUID();
      const now=new Date().toISOString();
      await tx.runAsync(`INSERT INTO transactions
        (id,account_id,category_id,type,amount_cents,description,date,created_at,updated_at,payment_kind,payment_card_id)
        VALUES (?,?,?,'EXPENSE',?,?,?,?,?,?,?)`,
        [id,accountId,input.category_id,input.amount_cents,input.description.trim(),input.date,now,now,kind,cardId]);
    });
  }

  private async getActiveCard(cardId: string): Promise<PaymentCard> {
    const card = await this.db.getFirstAsync<PaymentCard>(`${activeCardSql} WHERE pc.id=?`,[cardId]);
    if (!card || card.archived_at || card.deleted_at) throw new Error('Selecione um cartão ativo.');
    return card;
  }
}
