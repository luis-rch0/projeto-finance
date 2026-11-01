import type { SQLiteDatabase } from 'expo-sqlite';
import { monthBounds, monthKey } from '@/utils/date';

export interface HomeUpcoming {
  id: string;
  description: string;
  date: string;
  amountCents: number;
  kind: 'INSTALLMENT' | 'RECURRENCE' | 'CARD_INVOICE';
}

export interface PendingInvoiceDue {
  id: string;
  title: string;
  date: string;
  amount: number;
}

/** Fonte compartilhada entre a Home e a lista de vencimentos. */
export class DueService {
  constructor(private readonly db: SQLiteDatabase) {}

  /** Reúne os vencimentos da Home em uma só origem, sem alterar os lançamentos. */
  async listHomeUpcoming(year: number, month: number, limit = 4): Promise<HomeUpcoming[]> {
    const [from, to] = monthBounds(year, month);
    const [items, invoices] = await Promise.all([
      this.db.getAllAsync<HomeUpcoming>(`
        SELECT ii.id AS id,
               ip.description || ' (' || ii.sequence || '/' || ip.installments_count || ')' AS description,
               ii.due_date AS date, ii.amount_cents AS amountCents, 'INSTALLMENT' AS kind
        FROM installment_items ii
        JOIN installment_plans ip ON ip.id=ii.plan_id
        WHERE ii.status='PENDING' AND ip.archived_at IS NULL AND ii.due_date >= ? AND ii.due_date < ?
        UNION ALL
        SELECT ro.id, COALESCE(ro.override_description,rr.description),
               COALESCE(ro.override_date,ro.occurrence_date),
               COALESCE(ro.override_cents,rr.amount_cents), 'RECURRENCE'
        FROM recurrence_occurrences ro
        JOIN recurrence_rules rr ON rr.id=ro.rule_id
        WHERE ro.status='PENDING' AND rr.archived_at IS NULL
          AND COALESCE(ro.override_date,ro.occurrence_date) >= ?
          AND COALESCE(ro.override_date,ro.occurrence_date) < ?`,
        [from, to, from, to]),
      this.listPendingInvoices(year, month),
    ]);
    return [...items, ...invoices.map(invoice => ({
      id: invoice.id, description: invoice.title, date: invoice.date,
      amountCents: invoice.amount, kind: 'CARD_INVOICE' as const,
    }))].sort((a, b) => a.date.localeCompare(b.date)).slice(0, Math.max(0, limit));
  }

  listPendingInvoices(year: number, month: number): Promise<PendingInvoiceDue[]> {
    const monthISO = monthKey(year, month);
    return this.db.getAllAsync<PendingInvoiceDue>(`
      SELECT c.id AS id, 'Fatura ' || c.name AS title,
        printf('%s-%02d', i.invoice_month,
          MIN(c.due_day, CAST(strftime('%d', date(i.invoice_month || '-01', '+1 month', '-1 day')) AS INTEGER))) AS date,
        SUM(i.amount_cents) AS amount
      FROM credit_card_installments i
      JOIN credit_card_purchases p ON p.id=i.purchase_id
      JOIN credit_cards c ON c.id=p.card_id
      LEFT JOIN credit_card_invoice_payments paid
        ON paid.card_id=c.id AND paid.invoice_month=i.invoice_month
      WHERE i.invoice_month=? AND paid.id IS NULL
      GROUP BY c.id,c.name,c.due_day,i.invoice_month
      HAVING SUM(i.amount_cents)>0
      ORDER BY date ASC`, [monthISO]);
  }
}
