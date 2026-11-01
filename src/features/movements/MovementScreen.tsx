import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useFinance } from '@/hooks/useFinance';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { MovementType, TransactionDetail } from '@/types/finance';
import { formatMoney } from '@/utils/currency';
import { MonthSwitcher, type SelectedMonth } from '@/components/finance/MonthSwitcher';
import { TransactionRow } from '@/components/finance/TransactionRow';
import { ActionButton } from '@/components/ui/ActionButton';

const currentMonth = (): SelectedMonth => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

type Overview = { totalCents: number; count: number; recent: TransactionDetail[] };

/** Uma aba de consulta rápida; pesquisa detalhada e categorias ficam em telas específicas. */
export function MovementScreen({ type }: { type: MovementType }) {
  const finance = useFinance();
  const { colors } = useAppTheme();
  const [period, setPeriod] = useState<SelectedMonth>(currentMonth);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const isExpense = type === 'EXPENSE';

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    finance.getMovementOverview(period.year, period.month, type)
      .then(value => { if (active) setOverview(value); })
      .catch(cause => {
        if (active) {
          setOverview(null);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [finance, period.year, period.month, type]));

  const params = { type, year: String(period.year), month: String(period.month) };
  const openHistory = () => router.push({ pathname: '/movements/history', params });
  const openCategories = () => router.push({ pathname: '/movements/categories', params });
  const openRecurrences = () => router.push({ pathname: '/recurrences', params: { type } });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <Text style={[styles.title, { color: colors.text }]}>{isExpense ? 'Despesas' : 'Receitas'}</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        {isExpense ? 'Seus gastos, de forma simples.' : 'Suas entradas em um só lugar.'}
      </Text>
      <MonthSwitcher value={period} onChange={setPeriod} />

      <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.muted }}>Total {isExpense ? 'gasto' : 'recebido'} no mês</Text>
        <Text style={[styles.amount, { color: isExpense ? colors.expense : colors.income }]}>
          {loading || error ? '—' : formatMoney(overview?.totalCents ?? 0)}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {loading ? 'Carregando...' : error ? 'Resumo indisponível' : `${overview?.count ?? 0} lançamentos`}
        </Text>
      </View>

      <ActionButton
        title={isExpense ? '+ Nova despesa' : '+ Nova receita'}
        onPress={() => router.push({ pathname: '/transaction/new', params: { type } })}
        style={{ marginTop: 16, marginBottom: 18 }}
      />

      <View style={styles.shortcuts}>
        <Pressable accessibilityRole="button" onPress={openHistory}
          style={[styles.shortcut, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.shortcutTitle, { color: colors.text }]}>⌕  Histórico</Text>
          <Text style={[styles.shortcutHelp, { color: colors.muted }]}>Buscar e filtrar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={openCategories}
          style={[styles.shortcut, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.shortcutTitle, { color: colors.text }]}>▦  Categorias</Text>
          <Text style={[styles.shortcutHelp, { color: colors.muted }]}>Ver distribuição</Text>
        </Pressable>
      </View>

      <View style={styles.headingRow}>
        <Text style={[styles.section, { color: colors.text }]}>Últimos lançamentos</Text>
        <Pressable accessibilityRole="button" onPress={openHistory} hitSlop={8}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Ver todos ›</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        : error ? <Text style={{ color: colors.expense }}>{error}</Text>
        : <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {overview?.recent.length ? overview.recent.map(item => (
            <TransactionRow key={item.id} item={item}
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })} />
          )) : <Text style={{ color: colors.muted, padding: 16 }}>Nenhum lançamento neste mês.</Text>}
        </View>}

      <Pressable accessibilityRole="button" onPress={() => setMoreOpen(value => !value)}
        style={[styles.moreToggle, { borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Outras operações</Text>
        <Text style={{ color: colors.primary, fontWeight: '800' }}>{moreOpen ? '−' : '+'}</Text>
      </Pressable>
      {moreOpen && <View style={[styles.otherActions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {isExpense && <>
          <Pressable onPress={() => router.push('/installments')} style={styles.action}>
            <Text style={{ color: colors.text }}>Compras parceladas</Text>
            <Text style={{ color: colors.primary }}>›</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/due')} style={styles.action}>
            <Text style={{ color: colors.text }}>Vencimentos</Text>
            <Text style={{ color: colors.primary }}>›</Text>
          </Pressable>
        </>}
        <Pressable onPress={openRecurrences} style={styles.action}>
          <Text style={{ color: colors.text }}>{isExpense ? 'Despesas recorrentes' : 'Receitas recorrentes'}</Text>
          <Text style={{ color: colors.primary }}>›</Text>
        </Pressable>
      </View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 50 },
  title: { fontSize: 27, fontWeight: '800', marginTop: 8 },
  subtitle: { marginBottom: 18, marginTop: 4 },
  summary: { borderWidth: 1, borderRadius: 18, padding: 19, gap: 8 },
  amount: { fontSize: 30, fontWeight: '800' },
  shortcuts: { flexDirection: 'row', gap: 10 },
  shortcut: { flex: 1, borderWidth: 1, borderRadius: 15, padding: 13, gap: 4 },
  shortcutTitle: { fontSize: 15, fontWeight: '700' },
  shortcutHelp: { fontSize: 12 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 },
  section: { fontSize: 18, fontWeight: '800' },
  list: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 13 },
  moreToggle: { paddingVertical: 16, borderBottomWidth: 1, marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' },
  otherActions: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, marginTop: 10 },
  action: { paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between' },
});
