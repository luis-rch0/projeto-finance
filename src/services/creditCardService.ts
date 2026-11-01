import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  firstInvoiceMonth,
  invoiceDueDate,
  shiftInvoiceMonth,
  splitCardInstallments,
  validCardDay,
  validInvoiceMonth,
} from "@/utils/creditCards";
import { validDate } from "@/utils/date";

export interface CreditCard {
  id: string;
  name: string;
  closing_day: number;
  due_day: number;
  created_at: string;
  archived_at: string | null;
}
export interface CardPurchaseInput {
  card_id: string;
  description: string;
  purchase_date: string;
  total_cents: number;
  installments_count: number;
  category_id?: string | null;
}
export interface CardInvoiceItem {
  id: string;
  purchase_id: string;
  description: string;
  purchase_date: string;
  sequence: number;
  installments_count: number;
  amount_cents: number;
  category_id: string | null;
}
export interface CardInvoicePayment {
  id: string;
  card_id: string;
  invoice_month: string;
  amount_cents: number;
  paid_date: string;
  transaction_id: string;
}
export interface CardInvoice {
  card: CreditCard;
  month: string;
  due_date: string;
  items: CardInvoiceItem[];
  total_cents: number;
  payment: CardInvoicePayment | null;
}

const nowISO = () => new Date().toISOString();
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CreditCardService {
  constructor(private readonly db: SQLiteDatabase) {}

  /** Cartões removidos não aparecem na escolha normal, mas suas faturas ainda existem. */
  listCards(includeRemoved = false): Promise<CreditCard[]> {
    return this.db.getAllAsync<CreditCard>(
      `SELECT cc.* FROM credit_cards cc
       JOIN payment_cards pc ON pc.id=cc.id
       ${includeRemoved ? "" : "WHERE pc.deleted_at IS NULL"}
       ORDER BY cc.archived_at IS NOT NULL, cc.name COLLATE NOCASE`,
    );
  }

  async createCard(
    name: string,
    closingDay: number,
    dueDay: number,
  ): Promise<void> {
    const clean = name.trim();
    if (
      !clean ||
      clean.length > 80 ||
      !validCardDay(closingDay) ||
      !validCardDay(dueDay)
    ) {
      throw new Error(
        "Informe o nome e dias de fechamento/vencimento entre 1 e 28.",
      );
    }
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const id = Crypto.randomUUID();
      const now = nowISO();
      await tx.runAsync(
        `INSERT INTO payment_cards
        (id,name,linked_account_id,allows_debit,allows_credit,created_at,archived_at)
        VALUES (?,?,NULL,0,1,?,NULL)`,
        [id, clean, now],
      );
      await tx.runAsync(
        `INSERT INTO credit_cards (id,name,closing_day,due_day,created_at) VALUES (?,?,?,?,?)`,
        [id, clean, closingDay, dueDay, now],
      );
    });
  }

  async setArchived(cardId: string, archived: boolean): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const date = archived ? nowISO() : null;
      const result = await tx.runAsync(
        "UPDATE credit_cards SET archived_at=? WHERE id=?",
        [date, cardId],
      );
      if (!result.changes) throw new Error("Cartão não encontrado.");
      await tx.runAsync("UPDATE payment_cards SET archived_at=? WHERE id=?", [
        date,
        cardId,
      ]);
    });
  }

  async createPurchase(input: CardPurchaseInput): Promise<void> {
    const description = input.description.trim();
    if (
      !description ||
      description.length > 150 ||
      !validDate(input.purchase_date)
    ) {
      throw new Error("Informe uma descrição e data válidas para a compra.");
    }
    const values = splitCardInstallments(
      input.total_cents,
      input.installments_count,
    );
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const card = await tx.getFirstAsync<CreditCard>(
        `SELECT cc.* FROM credit_cards cc
         JOIN payment_cards pc ON pc.id=cc.id
         WHERE cc.id=? AND pc.deleted_at IS NULL AND pc.archived_at IS NULL`,
        [input.card_id],
      );
      if (!card || card.archived_at)
        throw new Error("Selecione um cartão ativo.");
      const firstMonth = firstInvoiceMonth(
        input.purchase_date,
        card.closing_day,
        card.due_day,
      );
      const months = values.map((_, index) =>
        shiftInvoiceMonth(firstMonth, index),
      );
      // Não permitir adicionar retroativamente parcelas em faturas quitadas.
      const paid = await tx.getFirstAsync<{ invoice_month: string }>(
        `SELECT invoice_month FROM credit_card_invoice_payments
         WHERE card_id=? AND invoice_month IN (${months.map(() => "?").join(",")}) LIMIT 1`,
        [card.id, ...months],
      );
      if (paid)
        throw new Error(
          `A fatura de ${paid.invoice_month} já foi paga. Altere a data da compra ou estorne antes.`,
        );
      const id = Crypto.randomUUID();
      if (input.category_id) {
        const category = await tx.getFirstAsync<{ id: string }>(
          `SELECT id FROM categories WHERE id=? AND type='EXPENSE' AND archived_at IS NULL`,
          [input.category_id],
        );
        if (!category) throw new Error("Categoria de compra inválida.");
      }
      await tx.runAsync(
        `INSERT INTO credit_card_purchases
         (id,card_id,description,purchase_date,total_cents,installments_count,created_at,category_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          id,
          card.id,
          description,
          input.purchase_date,
          input.total_cents,
          values.length,
          nowISO(),
          input.category_id ?? null,
        ],
      );
      for (let index = 0; index < values.length; index++) {
        await tx.runAsync(
          `INSERT INTO credit_card_installments (id,purchase_id,sequence,invoice_month,amount_cents)
           VALUES (?,?,?,?,?)`,
          [Crypto.randomUUID(), id, index + 1, months[index], values[index]],
        );
      }
    });
  }

  /** Dados da compra completa, não apenas de uma parcela visível na fatura. */
  async getPurchase(purchaseId: string): Promise<CardPurchaseInput | null> {
    return this.db.getFirstAsync<CardPurchaseInput>(
      `SELECT card_id, description, purchase_date, total_cents, installments_count, category_id
       FROM credit_card_purchases WHERE id=?`,
      [purchaseId],
    );
  }

  /**
   * Edição atômica: mantém o ID original da compra, recria somente as parcelas
   * previstas e impede alterações em qualquer fatura já paga (origem ou destino).
   * Não mexe em transactions nem em pagamentos já confirmados.
   */
  async editPurchase(
    purchaseId: string,
    input: {
      description: string;
      purchase_date: string;
      total_cents: number;
      installments_count: number;
    },
  ): Promise<string> {
    const description = input.description.trim();
    if (
      !description ||
      description.length > 150 ||
      !validDate(input.purchase_date)
    ) {
      throw new Error("Confira o nome e a data da compra (DD/MM/AAAA).");
    }
    const amounts = splitCardInstallments(
      input.total_cents,
      input.installments_count,
    );
    let invoiceMonth = "";

    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const purchase = await tx.getFirstAsync<{ card_id: string }>(
        "SELECT card_id FROM credit_card_purchases WHERE id=?",
        [purchaseId],
      );
      if (!purchase) throw new Error("Compra não encontrada.");
      const card = await tx.getFirstAsync<CreditCard>(
        "SELECT * FROM credit_cards WHERE id=?",
        [purchase.card_id],
      );
      if (!card) throw new Error("Cartão não encontrado.");

      const originalPaid = await tx.getFirstAsync<{ invoice_month: string }>(
        `SELECT pay.invoice_month FROM credit_card_invoice_payments pay
         JOIN credit_card_installments i ON i.invoice_month=pay.invoice_month
         WHERE pay.card_id=? AND i.purchase_id=? LIMIT 1`,
        [purchase.card_id, purchaseId],
      );
      if (originalPaid) {
        throw new Error(
          "Esta compra possui parcela em fatura paga. Estorne o pagamento antes de editar.",
        );
      }

      const firstMonth = firstInvoiceMonth(
        input.purchase_date,
        card.closing_day,
        card.due_day,
      );
      const months = amounts.map((_, i) => shiftInvoiceMonth(firstMonth, i));
      const destinationPaid = await tx.getFirstAsync<{ invoice_month: string }>(
        `SELECT invoice_month FROM credit_card_invoice_payments
         WHERE card_id=? AND invoice_month IN (${months.map(() => "?").join(",")}) LIMIT 1`,
        [purchase.card_id, ...months],
      );
      if (destinationPaid) {
        throw new Error(
          `A fatura ${destinationPaid.invoice_month} já foi paga. Ajuste a compra ou estorne primeiro.`,
        );
      }

      await tx.runAsync(
        `UPDATE credit_card_purchases
         SET description=?, purchase_date=?, total_cents=?, installments_count=?
         WHERE id=?`,
        [
          description,
          input.purchase_date,
          input.total_cents,
          amounts.length,
          purchaseId,
        ],
      );
      await tx.runAsync(
        "DELETE FROM credit_card_installments WHERE purchase_id=?",
        [purchaseId],
      );
      for (let i = 0; i < amounts.length; i++) {
        await tx.runAsync(
          `INSERT INTO credit_card_installments
           (id,purchase_id,sequence,invoice_month,amount_cents) VALUES (?,?,?,?,?)`,
          [Crypto.randomUUID(), purchaseId, i + 1, months[i], amounts[i]],
        );
      }
       invoiceMonth = firstMonth;
    });

      return invoiceMonth; }

  async getInvoice(cardId: string, month: string): Promise<CardInvoice> {
    if (!validInvoiceMonth(month)) throw new Error("Mês inválido.");
    const card = await this.db.getFirstAsync<CreditCard>(
      "SELECT * FROM credit_cards WHERE id=?",
      [cardId],
    );
    if (!card) throw new Error("Cartão não encontrado.");
    const [items, payment] = await Promise.all([
      this.db.getAllAsync<CardInvoiceItem>(
        `SELECT i.id, p.id AS purchase_id, p.description, p.purchase_date,
                i.sequence, p.installments_count, i.amount_cents, p.category_id
         FROM credit_card_installments i
         JOIN credit_card_purchases p ON p.id=i.purchase_id
         WHERE p.card_id=? AND i.invoice_month=?
         ORDER BY p.purchase_date ASC, p.created_at ASC, i.sequence ASC`,
        [cardId, month],
      ),
      this.db.getFirstAsync<CardInvoicePayment>(
        "SELECT * FROM credit_card_invoice_payments WHERE card_id=? AND invoice_month=?",
        [cardId, month],
      ),
    ]);
    const total = items.reduce((sum, item) => sum + item.amount_cents, 0);
    return {
      card,
      month,
      due_date: invoiceDueDate(month, card.due_day),
      items,
      total_cents: total,
      payment: payment ?? null,
    };
  }

  /** Classifica compras legadas sem alterar a fatura, inclusive as já pagas. */
  async setPurchaseCategory(
    purchaseId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.db.getFirstAsync<{ id: string }>(
      `SELECT id FROM categories WHERE id=? AND type='EXPENSE'`,
      [categoryId],
    );
    if (!category) throw new Error("Selecione uma categoria de despesa.");
    const result = await this.db.runAsync(
      "UPDATE credit_card_purchases SET category_id=? WHERE id=?",
      [categoryId, purchaseId],
    );
    if (!result.changes) throw new Error("Compra não encontrada.");
  }

  async removePurchase(purchaseId: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const purchase = await tx.getFirstAsync<{ card_id: string }>(
        "SELECT card_id FROM credit_card_purchases WHERE id=?",
        [purchaseId],
      );
      if (!purchase) throw new Error("Compra não encontrada.");
      const paid = await tx.getFirstAsync<{ id: string }>(
        `SELECT pay.id FROM credit_card_invoice_payments pay
         JOIN credit_card_installments i ON i.invoice_month=pay.invoice_month
         JOIN credit_card_purchases p ON p.id=i.purchase_id AND p.card_id=pay.card_id
         WHERE p.id=? LIMIT 1`,
        [purchaseId],
      );
      if (paid)
        throw new Error(
          "Esta compra já pertence a uma fatura paga. Estorne a fatura antes de excluir.",
        );
      await tx.runAsync(
        "DELETE FROM credit_card_installments WHERE purchase_id=?",
        [purchaseId],
      );
      await tx.runAsync("DELETE FROM credit_card_purchases WHERE id=?", [
        purchaseId,
      ]);
    });
  }

  async payInvoice(input: {
    card_id: string;
    invoice_month: string;
    account_id: string;
    category_id?: string;
    paid_date: string;
  }): Promise<void> {
    if (
      !validInvoiceMonth(input.invoice_month) ||
      !validDate(input.paid_date)
    ) {
      throw new Error("Informe mês e data de pagamento válidos.");
    }
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      // O pagamento não é uma nova compra: categoria interna para o registro de caixa.
      let categoryId = input.category_id;
      if (!categoryId) {
        const internal = await tx.getFirstAsync<{ id: string }>(
          `SELECT id FROM categories WHERE name='Pagamento de fatura' AND type='EXPENSE' LIMIT 1`,
        );
        if (internal) {
          categoryId = internal.id;
          await tx.runAsync(
            "UPDATE categories SET archived_at=NULL WHERE id=?",
            [categoryId],
          );
        } else {
          categoryId = Crypto.randomUUID();
          await tx.runAsync(
            `INSERT INTO categories(id,name,type,color,icon,archived_at)
            VALUES (?,'Pagamento de fatura','EXPENSE','#13845B','💳',NULL)`,
            [categoryId],
          );
        }
      }
      const [card, account, category, existing, sum] = await Promise.all([
        tx.getFirstAsync<CreditCard>("SELECT * FROM credit_cards WHERE id=?", [
          input.card_id,
        ]),
        tx.getFirstAsync<{ id: string }>("SELECT id FROM accounts WHERE id=?", [
          input.account_id,
        ]),
        tx.getFirstAsync<{ id: string }>(
          `SELECT id FROM categories WHERE id=? AND type='EXPENSE' AND archived_at IS NULL`,
          [categoryId],
        ),
        tx.getFirstAsync<{ id: string }>(
          "SELECT id FROM credit_card_invoice_payments WHERE card_id=? AND invoice_month=?",
          [input.card_id, input.invoice_month],
        ),
        tx.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(i.amount_cents),0) AS total
           FROM credit_card_installments i
           JOIN credit_card_purchases p ON p.id=i.purchase_id
           WHERE p.card_id=? AND i.invoice_month=?`,
          [input.card_id, input.invoice_month],
        ),
      ]);
      if (!card || !account || !category)
        throw new Error("Cartão, conta ou categoria inválidos.");
      if (existing) throw new Error("Esta fatura já foi paga.");
      const total = sum?.total ?? 0;
      if (!Number.isSafeInteger(total) || total <= 0)
        throw new Error("Não há compras para pagar nesta fatura.");
      const transactionId = Crypto.randomUUID();
      const now = nowISO();
      await tx.runAsync(
        `INSERT INTO transactions (id,account_id,category_id,type,amount_cents,description,date,created_at,updated_at)
         VALUES (?,?,?,'EXPENSE',?,?,?,?,?)`,
        [
          transactionId,
          input.account_id,
          categoryId!,
          total,
          `Fatura ${card.name} · ${input.invoice_month}`,
          input.paid_date,
          now,
          now,
        ],
      );
      await tx.runAsync(
        `INSERT INTO credit_card_invoice_payments
         (id,card_id,invoice_month,account_id,category_id,amount_cents,paid_date,transaction_id,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          Crypto.randomUUID(),
          input.card_id,
          input.invoice_month,
          input.account_id,
          categoryId!,
          total,
          input.paid_date,
          transactionId,
          now,
        ],
      );
    });
  }

  async reversePayment(cardId: string, month: string): Promise<void> {
    if (!validInvoiceMonth(month)) throw new Error("Mês inválido.");
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const payment = await tx.getFirstAsync<CardInvoicePayment>(
        "SELECT * FROM credit_card_invoice_payments WHERE card_id=? AND invoice_month=?",
        [cardId, month],
      );
      if (!payment) throw new Error("Esta fatura não está marcada como paga.");
      // Excluir nesta ordem para satisfazer FK RESTRICT, sem tocar nas compras.
      await tx.runAsync("DELETE FROM credit_card_invoice_payments WHERE id=?", [
        payment.id,
      ]);
      const deleted = await tx.runAsync("DELETE FROM transactions WHERE id=?", [
        payment.transaction_id,
      ]);
      if (deleted.changes !== 1)
        throw new Error(
          "O lançamento financeiro da fatura não foi localizado.",
        );
    });
  }
}
