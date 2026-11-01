import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useFinance } from '@/hooks/useFinance';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { MovementType } from '@/types/finance';
import { CategorySummary } from '@/components/finance/CategorySummary';
import type { CategoryStat } from '@/features/categories/categoryStats';
import { MonthSwitcher, type SelectedMonth } from '@/components/finance/MonthSwitcher';

export function MovementCategoriesScreen({ type, initialPeriod }: { type: MovementType; initialPeriod: SelectedMonth }) {
  const finance = useFinance();
  const { colors } = useAppTheme();
  const [period, setPeriod] = useState<SelectedMonth>(initialPeriod);
  const [items, setItems] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    finance.getCategoryOverview(period.year, period.month, type)
      .then(rows => { if (active) setItems(rows); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [finance, period.year, period.month, type]));

  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
    <Text style={[styles.title, { color: colors.text }]}>Categorias de {type === 'EXPENSE' ? 'despesas' : 'receitas'}</Text>
    <Text style={[styles.description, { color: colors.muted }]}>Totais, participação e quantidade de lançamentos por categoria.</Text>
    <MonthSwitcher value={period} onChange={setPeriod} />
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/movements/history',
      params: { type, year: String(period.year), month: String(period.month) } })}
      style={[styles.link, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={{ color: colors.primary, fontWeight: '700' }}>Ver todos os lançamentos ›</Text>
    </Pressable>
    {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 22 }} />
      : error ? <Text style={{ color: colors.expense }}>{error}</Text>
      : items.length ? <CategorySummary items={items} type={type} />
        : <Text style={{ color: colors.muted, marginTop: 20 }}>Nenhum lançamento neste mês.</Text>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 8 },
  description: { marginTop: 6, marginBottom: 18 },
  link: { padding: 14, borderRadius: 13, borderWidth: 1 },
});
