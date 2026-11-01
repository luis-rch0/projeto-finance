import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BudgetRepository } from '@/database/repositories/budgetRepository';
import { toCsv, centsAsBrazilianNumber } from '@/utils/csv';
import { monthBounds } from '@/utils/date';

interface ExportTransaction {
  date: string; type: 'EXPENSE' | 'INCOME'; description: string;
  category: string; account: string; amount_cents: number;
}
interface ExportGoal {
  title: string; target_cents: number; target_date: string | null;
  saved_cents: number; archived_at: string | null;
}
async function shareCsv(content: string, name: string): Promise<void> {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) throw new Error('Armazenamento temporário indisponível.');
  const uri = `${base}${name}`;
  if (!await Sharing.isAvailableAsync()) throw new Error('Compartilhamento não disponível no aparelho.');
  await FileSystem.writeAsStringAsync(uri, content);
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Exportar dados do Finance' });
}

export async function exportTransactionsCsv(db: SQLiteDatabase, month: string | null): Promise<number> {
  let where = '';
  let params: string[] = [];
  if (month !== null) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
    const [year, number] = month.split('-').map(Number);
    const [start,end] = monthBounds(year,number);
    where = 'WHERE t.date>=? AND t.date<?'; params=[start,end];
  }
  const items = await db.getAllAsync<ExportTransaction>(`
    SELECT t.date,t.type,t.description,c.name AS category,a.name AS account,t.amount_cents
    FROM transactions t JOIN categories c ON c.id=t.category_id
    JOIN accounts a ON a.id=t.account_id
    ${where} ORDER BY t.date DESC,t.created_at DESC`,params);
  const rows: Array<Array<string|number>> = [['Data','Tipo','Descrição','Categoria','Conta','Valor (R$)']];
  items.forEach(t => rows.push([t.date,t.type==='EXPENSE'?'Despesa':'Receita',t.description,t.category,t.account,centsAsBrazilianNumber(t.amount_cents)]));
  await shareCsv(toCsv(rows), `finance-movimentacoes-${month ?? 'todas'}-${Date.now()}.csv`);
  return items.length;
}

export async function exportGoalsCsv(db: SQLiteDatabase): Promise<number> {
  const goals = await db.getAllAsync<ExportGoal>(`
    SELECT g.title,g.target_cents,g.target_date,g.archived_at,
      COALESCE((SELECT SUM(amount_cents) FROM goal_contributions WHERE goal_id=g.id),0) AS saved_cents
    FROM savings_goals g ORDER BY g.created_at DESC`);
  const rows: Array<Array<string|number>> = [['Objetivo','Valor desejado (R$)','Reservado (R$)','Prazo','Situação']];
  goals.forEach(g => rows.push([g.title,centsAsBrazilianNumber(g.target_cents),
    centsAsBrazilianNumber(g.saved_cents),g.target_date??'',g.archived_at?'Arquivado':g.saved_cents>=g.target_cents?'Concluído':'Em andamento']));
  await shareCsv(toCsv(rows),`finance-metas-${Date.now()}.csv`);
  return goals.length;
}

export async function exportBudgetsCsv(db: SQLiteDatabase, month: string): Promise<number> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  const items = await new BudgetRepository(db).findByMonth(month);
  const rows: Array<Array<string|number>> = [['Mês','Categoria','Limite (R$)','Gasto (R$)','Disponível (R$)','Origem']];
  items.forEach(b => rows.push([month,b.category_name,centsAsBrazilianNumber(b.limit_cents),
    centsAsBrazilianNumber(b.spent_cents),centsAsBrazilianNumber(b.limit_cents-b.spent_cents),
    b.is_recurring?'Automático':'Mensal']));
  await shareCsv(toCsv(rows),`finance-limites-${month}-${Date.now()}.csv`);
  return items.length;
}
