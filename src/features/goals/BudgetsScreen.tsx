import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Category, MonthlyBudgetProgress } from '@/types/finance';
import { useFinance } from '@/hooks/useFinance';
import { useGoals } from '@/hooks/useGoals';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ActionButton } from '@/components/ui/ActionButton';
import { MonthSwitcher, type SelectedMonth } from '@/components/finance/MonthSwitcher';
import { ProgressBar } from '@/components/finance/ProgressBar';
import { Field } from '@/features/goals/SavingsGoalsScreen';
import { formatMoney, parseMoney } from '@/utils/currency';
import { monthKey } from '@/utils/date';

function initial(): SelectedMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
export function BudgetsScreen() {
  const finance = useFinance();
  const service = useGoals();
  const { colors } = useAppTheme();
  const [period, setPeriod] = useState<SelectedMonth>(initial);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<MonthlyBudgetProgress[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const month = monthKey(period.year, period.month);

  const refresh = useCallback(async () => {
    setBudgets(await service.budgets.findByMonth(month));
  }, [month, service]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([service.budgets.findByMonth(month), finance.categories.findByType('EXPENSE')])
      .then(([rows, cats]) => { if (active) { setBudgets(rows); setCategories(cats); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [finance, service, month]));

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); await refresh(); Alert.alert('Pronto', success); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return <View style={{ gap: 14 }}>
    <Text style={{ color: colors.muted }}>Defina limites de consumo por categoria. Compras no crédito contam na data da compra, sem duplicar o pagamento da fatura.</Text>
    <MonthSwitcher value={period} onChange={setPeriod} />
    {error ? <Text style={{ color: colors.expense, fontWeight: '600' }}>{error}</Text> : null}
    <ActionButton title={showForm ? 'Fechar formulário' : '+ Definir limite mensal'} onPress={() => setShowForm(v => !v)} />
    {showForm ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Limite para {month}</Text>
      <Text style={{ color: colors.text, fontWeight: '600' }}>Categoria de despesa</Text>
      <View style={styles.pills}>
        {categories.map(category => <Pressable key={category.id} onPress={() => {
          setCategoryId(category.id);
          const existing = budgets.find(b => b.category_id === category.id);
          setAmount(existing ? (existing.limit_cents / 100).toFixed(2).replace('.', ',') : '');
        }} style={[styles.pill, { backgroundColor: categoryId === category.id ? colors.primary : colors.background,
          borderColor: colors.border }]}>
          <Text style={{ color: categoryId === category.id ? colors.onPrimary : colors.text }}>{category.name}</Text>
        </Pressable>)}
      </View>
      <Field label="Limite de gastos (R$)" value={amount} onChangeText={setAmount} placeholder="Ex.: 500,00" numeric />
      <Pressable onPress={() => setRepeat(v => !v)} style={styles.actions} accessibilityRole="checkbox" accessibilityState={{ checked: repeat }}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>{repeat ? '☑' : '☐'} Repetir este limite nos meses seguintes</Text>
      </Pressable>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {repeat ? 'Válido a partir deste mês. Um limite específico do mês terá prioridade.' : 'Este limite vale apenas para o mês escolhido.'}
      </Text>
      <ActionButton title={busy ? 'Salvando…' : 'Salvar limite'} disabled={busy} onPress={() => run(async () => {
        if (repeat) await service.setRepeatingLimit(categoryId, month, parseMoney(amount));
        else await service.setMonthlyLimit(categoryId, month, parseMoney(amount));
        setAmount(''); setCategoryId(''); setShowForm(false); setRepeat(false);
      }, 'Limite salvo.')} />
    </View> : null}
    {loading ? <ActivityIndicator color={colors.primary} /> : budgets.length === 0
      ? <Text style={{ color: colors.muted, padding: 14 }}>Nenhum limite configurado para este mês.</Text>
      : budgets.map(budget => {
        const exceeded = budget.spent_cents > budget.limit_cents;
        return <View key={budget.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{budget.category_name}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{budget.is_recurring ? '↻ Limite automático' : 'Limite exclusivo deste mês'}</Text>
          <Text style={{ color: colors.muted }}>
            Consumido: {formatMoney(budget.spent_cents)} / Limite: {formatMoney(budget.limit_cents)}
          </Text>
          <ProgressBar current={budget.spent_cents} target={budget.limit_cents} exceeded />
          <Text style={{ color: exceeded ? colors.expense : colors.muted }}>
            {exceeded ? `Limite ultrapassado em ${formatMoney(budget.spent_cents - budget.limit_cents)}`
              : `Disponível: ${formatMoney(budget.limit_cents - budget.spent_cents)}`}
          </Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => {
              setCategoryId(budget.category_id);
              setAmount((budget.limit_cents / 100).toFixed(2).replace('.', ','));
              setRepeat(Boolean(budget.is_recurring));
              setShowForm(true);
            }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Editar</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => Alert.alert(budget.is_recurring ? 'Parar repetição?' : 'Remover limite?',
              budget.is_recurring ? 'A repetição será interrompida deste mês em diante, sem alterar os anteriores.' : 'Somente o limite deste mês será removido. Suas despesas continuam registradas.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Remover', style: 'destructive', onPress: () => void run(
                  () => budget.is_recurring ? service.stopRepeatingLimit(budget.category_id, month) : service.budgets.delete(budget.id),
                  budget.is_recurring ? 'Repetição interrompida.' : 'Limite removido.') },
              ])}><Text style={{ color: colors.expense, fontWeight: '700' }}>{budget.is_recurring ? 'Parar repetição' : 'Remover'}</Text></Pressable>
          </View>
        </View>;
      })}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 17, padding: 17, gap: 12 },
  cardTitle: { fontWeight: '800', fontSize: 17 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 50, borderWidth: 1 },
  actions: { flexDirection: 'row', gap: 24, paddingTop: 5 },
});
