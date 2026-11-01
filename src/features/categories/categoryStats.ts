import type { Category, TransactionDetail } from '@/types/finance';

export interface CategoryStat { id: string; name: string; color: string; icon: string; cents: number; count: number; percent: number }
/** Resultados do período e de todos os filtros ativos, nunca dados fictícios. */
export function calculateCategoryStats(items: TransactionDetail[], categories: Category[]): CategoryStat[] {
  const grouped = new Map<string, { cents: number; count: number }>();
  let total = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.amount_cents) || item.amount_cents <= 0) continue;
    total += item.amount_cents;
    const current = grouped.get(item.category_id) ?? { cents: 0, count: 0 };
    grouped.set(item.category_id, { cents: current.cents + item.amount_cents, count: current.count + 1 });
  }
  return categories.filter(c => grouped.has(c.id)).map(c => {
    const stats = grouped.get(c.id)!;
    return { id: c.id, name: c.name, color: c.color, icon: c.icon,
      cents: stats.cents, count: stats.count, percent: total ? stats.cents / total * 100 : 0 };
  }).sort((a,b) => b.cents - a.cents || a.name.localeCompare(b.name,'pt-BR'));
}

const symbols: Record<string, string> = {
  'EXPENSE:Alimentação': '🍽️', 'EXPENSE:Transporte': '🚗', 'EXPENSE:Moradia': '🏠',
  'EXPENSE:Saúde': '💊', 'EXPENSE:Educação': '📚', 'EXPENSE:Lazer': '🎮',
  'EXPENSE:Compras': '🛍️', 'EXPENSE:Outros': '📌', 'INCOME:Salário': '💼',
  'INCOME:Freelance': '💻', 'INCOME:Investimentos': '📈', 'INCOME:Outros': '💰',
};
/** Exibe símbolo no lugar do 1, 2, 3 do seed original; não altera IDs nem registros. */
export function categorySymbol(c: Pick<Category, 'name' | 'type' | 'icon'>): string {
  return /^\d+$/.test(c.icon.trim()) ? (symbols[`${c.type}:${c.name}`] ?? '🏷️') : c.icon;
}
