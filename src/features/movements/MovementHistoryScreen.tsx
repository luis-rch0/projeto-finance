import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useFinance } from '@/hooks/useFinance';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { Account, Category, MovementFilters, MovementType, TransactionDetail } from '@/types/finance';
import { MonthSwitcher, type SelectedMonth } from '@/components/finance/MonthSwitcher';
import { FinanceDateField } from '@/components/ui/FinanceDateField';
import { TransactionRow } from '@/components/finance/TransactionRow';
import { formatMoney, parseMoney } from '@/utils/currency';

const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 70 },
  heading: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { marginBottom: 18 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  searchRow: { marginBottom: 12 },
  filterToggle: { paddingVertical: 12, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between' },
  filterBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginBottom: 16 },
  label: { fontWeight: '700', marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 9 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 14 },
  list: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 13 },
});

export function MovementHistoryScreen({ type, initialPeriod, initialCategoryId = '' }: {
  type: MovementType;
  initialPeriod: SelectedMonth;
  initialCategoryId?: string;
}) {
  const finance = useFinance();
  const { colors } = useAppTheme();
  const keyboardBottom = useKeyboardBottomSpacing(70);
  const [period, setPeriod] = useState<SelectedMonth>(initialPeriod);
  const [items, setItems] = useState<TransactionDetail[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [accountId, setAccountId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [filterOpen, setFilterOpen] = useState(Boolean(initialCategoryId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setRevision(value => value + 1);
    Promise.all([finance.categories.findByType(type, true), finance.accounts.findAll()])
      .then(([allCategories, allAccounts]) => {
        if (active) { setCategories(allCategories); setAccounts(allAccounts); }
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [finance, type]));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    try {
      const filters: MovementFilters = {
        type, year: period.year, month: period.month, search: debouncedQuery,
        categoryId, accountId, fromDate, toDate,
        minCents: minValue.trim() ? parseMoney(minValue) : undefined,
        maxCents: maxValue.trim() ? parseMoney(maxValue) : undefined,
      };
      finance.searchMovements(filters)
        .then(rows => { if (active) setItems(rows); })
        .catch(cause => { if (active) { setItems([]); setError(cause instanceof Error ? cause.message : String(cause)); } })
        .finally(() => { if (active) setLoading(false); });
    } catch (cause) {
      if (active) { setItems([]); setLoading(false); setError(cause instanceof Error ? cause.message : String(cause)); }
    }
    return () => { active = false; };
  }, [finance, type, period.year, period.month, debouncedQuery, categoryId, accountId, fromDate, toDate, minValue, maxValue, revision]);

  const total = items.reduce((value, item) => value + item.amount_cents, 0);
  const hasFilters = Boolean(query || categoryId || accountId || fromDate || toDate || minValue || maxValue);
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  function clearFilters() {
    setQuery(''); setCategoryId(''); setAccountId(''); setFromDate('');
    setToDate(''); setMinValue(''); setMaxValue('');
  }
  function chip(label: string, selected: boolean, onPress: () => void) {
    return <Pressable accessibilityRole="button" key={label} onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.background, borderColor: colors.border }]}>
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}>{label}</Text>
    </Pressable>;
  }

  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.page,{paddingBottom:keyboardBottom}]} keyboardShouldPersistTaps="handled">
    <Text style={[styles.heading, { color: colors.text }]}>Histórico de {type === 'EXPENSE' ? 'despesas' : 'receitas'}</Text>
    <Text style={[styles.subtitle, { color: colors.muted }]}>Encontre qualquer lançamento sem sobrecarregar a aba principal.</Text>
    <MonthSwitcher value={period} onChange={setPeriod} />
    <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por descrição..."
      placeholderTextColor={colors.muted} style={[styles.input, styles.searchRow, inputStyle]} />
    <Pressable accessibilityRole="button" onPress={() => setFilterOpen(value => !value)} style={styles.filterToggle}>
      <Text style={{ color: colors.primary, fontWeight: '700' }}>
        {filterOpen ? 'Ocultar filtros' : 'Mais filtros'}{hasFilters ? ' • ativos' : ''}
      </Text>
      <Text style={{ color: colors.primary }}>{filterOpen ? '⌃' : '⌄'}</Text>
    </Pressable>
    {filterOpen && <View style={[styles.filterBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.text }]}>Categoria</Text>
      <View style={styles.chips}>{chip('Todas', !categoryId, () => setCategoryId(''))}
        {categories.map(category => chip(category.name, categoryId === category.id, () => setCategoryId(category.id)))}</View>
      <Text style={[styles.label, { color: colors.text }]}>Conta</Text>
      <View style={styles.chips}>{chip('Todas', !accountId, () => setAccountId(''))}
        {accounts.map(account => chip(account.name, accountId === account.id, () => setAccountId(account.id)))}</View>
      <Text style={[styles.label, { color: colors.text }]}>Intervalo de datas (DD/MM/AAAA)</Text>
      <View style={styles.row}>
        <FinanceDateField value={fromDate} onChange={setFromDate} placeholder="DD/MM/AAAA" accessibilityLabel="Data inicial"
          style={[styles.input, styles.half, inputStyle]} />
        <FinanceDateField value={toDate} onChange={setToDate} placeholder="DD/MM/AAAA" accessibilityLabel="Data final"
          style={[styles.input, styles.half, inputStyle]} />
      </View>
      {!!(fromDate || toDate) && <Text style={{ color: colors.warning, fontSize: 12 }}>O intervalo de datas substitui o mês selecionado.</Text>}
      <Text style={[styles.label, { color: colors.text }]}>Faixa de valores (R$)</Text>
      <View style={styles.row}>
        <TextInput keyboardType="decimal-pad" value={minValue} onChangeText={setMinValue}
          placeholder="Mínimo" placeholderTextColor={colors.muted} style={[styles.input, styles.half, inputStyle]} />
        <TextInput keyboardType="decimal-pad" value={maxValue} onChangeText={setMaxValue}
          placeholder="Máximo" placeholderTextColor={colors.muted} style={[styles.input, styles.half, inputStyle]} />
      </View>
      <Pressable accessibilityRole="button" onPress={clearFilters} style={{ paddingVertical: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>Limpar filtros</Text>
      </Pressable>
    </View>}
    <View style={styles.totalRow}>
      <Text style={{ color: colors.muted }}>{loading ? 'Carregando...' : `${items.length} registros encontrados`}</Text>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{loading ? '—' : formatMoney(total)}</Text>
    </View>
    {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 22 }} />
      : error ? <Text style={{ color: colors.expense }}>{error}</Text>
      : <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {!items.length ? <Text style={{ color: colors.muted, padding: 15 }}>Nenhum registro encontrado.</Text>
          : items.map(item => <TransactionRow key={item.id} item={item}
            onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })} />)}
      </View>}
  </ScrollView>;
}
