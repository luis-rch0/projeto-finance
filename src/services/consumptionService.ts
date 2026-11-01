import type { SQLiteDatabase } from 'expo-sqlite';
import { monthBounds } from '@/utils/date';

export interface ConsumptionCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  amountCents: number;
  count: number;
}
export interface ConsumptionSnapshot {
  totalCents: number;
  count: number;
  categories: ConsumptionCategory[];
}

/** Consumo != caixa. Evita contar compra de crédito e pagamento da fatura duas vezes. */
export class ConsumptionService {
  constructor(private readonly db: SQLiteDatabase) {}
  async load(year:number,month:number):Promise<ConsumptionSnapshot>{
    const [start,end]=monthBounds(year,month);
    const categories=await this.db.getAllAsync<ConsumptionCategory>(`
      WITH consumption AS (
        SELECT t.category_id AS category_id, t.amount_cents AS cents
        FROM transactions t
        WHERE t.type='EXPENSE' AND t.date>=? AND t.date<?
          AND NOT EXISTS(SELECT 1 FROM credit_card_invoice_payments ip WHERE ip.transaction_id=t.id)
        UNION ALL
        SELECT p.category_id, p.total_cents
        FROM credit_card_purchases p
        WHERE p.purchase_date>=? AND p.purchase_date<?
      )
      SELECT COALESCE(c.id,'uncategorized') AS id,
        COALESCE(c.name,'Sem categoria') AS name,
        COALESCE(c.color,'#728579') AS color,
        COALESCE(c.icon,'🏷️') AS icon,
        SUM(com.cents) AS amountCents, COUNT(*) AS count
      FROM consumption com LEFT JOIN categories c ON c.id=com.category_id
      GROUP BY c.id,c.name,c.color,c.icon
      ORDER BY amountCents DESC,name COLLATE NOCASE`,[start,end,start,end]);
    return {categories,totalCents:categories.reduce((sum,c)=>sum+c.amountCents,0),
      count:categories.reduce((sum,c)=>sum+c.count,0)};
  }
}
