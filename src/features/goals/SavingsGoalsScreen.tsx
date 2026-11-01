import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { GoalContribution, SavingsGoalProgress } from '@/types/finance';
import { useGoals } from '@/hooks/useGoals';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ActionButton } from '@/components/ui/ActionButton';
import { FinanceDateField } from '@/components/ui/FinanceDateField';
import { ProgressBar } from '@/components/finance/ProgressBar';
import { formatMoney, parseMoney } from '@/utils/currency';
import { displayDate, todayISO } from '@/utils/date';

export function SavingsGoalsScreen() {
  const service = useGoals();
  const { colors } = useAppTheme();
  const [goals, setGoals] = useState<SavingsGoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [deposit, setDeposit] = useState('');
  const [depositDate, setDepositDate] = useState(todayISO());
  const [contributions, setContributions] = useState<GoalContribution[]>([]);

  const refresh = useCallback(async () => {
    const result = await service.goals.findActive();
    setGoals(result);
    if (selectedGoalId) setContributions(await service.goals.findContributions(selectedGoalId));
  }, [service, selectedGoalId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    service.goals.findActive()
      .then(rows => { if (active) setGoals(rows); })
      .catch(e => { if (active) setError(String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [service]));

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      Alert.alert('Pronto', success);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  function startEditing(goal: SavingsGoalProgress) {
    setTitle(goal.title);
    setTarget((goal.target_cents / 100).toFixed(2).replace('.', ','));
    setTargetDate(goal.target_date ?? '');
    setEditingGoalId(goal.id);
    setShowCreate(true);
  }

  function resetForm() {
    setTitle(''); setTarget(''); setTargetDate(''); setEditingGoalId(null); setShowCreate(false);
  }

  function monthlyTarget(targetCents: number, savedCents: number, deadline: string): string | null {
    const now = new Date();
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [year, month, day] = deadline.split('-').map(Number);
    const final = new Date(year, month - 1, day);
    if (final < current) return null;
    const months = (year - now.getFullYear()) * 12 + month - (now.getMonth() + 1) + 1;
    return formatMoney(Math.ceil(Math.max(0, targetCents - savedCents) / months));
  }

  async function openGoal(goalId: string) {
    if (selectedGoalId === goalId) { setSelectedGoalId(null); setContributions([]); return; }
    setError('');
    try {
      const rows = await service.goals.findContributions(goalId);
      setSelectedGoalId(goalId);
      setContributions(rows);
      setDeposit('');
      setDepositDate(todayISO());
    } catch (e) { setError(String(e)); }
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.muted }}>Crie objetivos e registre quanto você já reservou para cada um.</Text>
      {error ? <Text style={{ color: colors.expense, fontWeight: '600' }}>{error}</Text> : null}
      <ActionButton title={showCreate ? 'Fechar formulário' : '+ Novo objetivo de economia'} onPress={() => showCreate ? resetForm() : setShowCreate(true)} />
      {showCreate ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{editingGoalId ? 'Editar objetivo' : 'Criar objetivo'}</Text>
        <Field label="Nome" value={title} onChangeText={setTitle} placeholder="Ex.: Comprar computador" />
        <Field label="Valor desejado (R$)" value={target} onChangeText={setTarget} placeholder="Ex.: 3000,00" numeric />
        <Field label="Prazo opcional (DD/MM/AAAA)" value={targetDate} onChangeText={setTargetDate} placeholder="DD/MM/AAAA" date />
        <ActionButton title={busy ? 'Salvando…' : editingGoalId ? 'Salvar mudanças' : 'Criar objetivo'} disabled={busy} onPress={() => run(async () => {
          if (editingGoalId) await service.editSavingsGoal(editingGoalId, title, parseMoney(target), targetDate.trim() || null);
          else await service.createSavingsGoal(title, parseMoney(target), targetDate.trim() || null);
          resetForm();
        }, editingGoalId ? 'Objetivo atualizado.' : 'Objetivo criado.')} />
      </View> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : goals.length === 0
        ? <Text style={{ color: colors.muted, padding: 14 }}>Você ainda não criou objetivos de economia.</Text>
        : goals.map(goal => (
          <View key={goal.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{goal.title}</Text>
            <Text style={{ color: colors.muted }}>Guardado: {formatMoney(goal.saved_cents)} de {formatMoney(goal.target_cents)}</Text>
            <ProgressBar current={goal.saved_cents} target={goal.target_cents} />
            <Text style={{ color: goal.saved_cents >= goal.target_cents ? colors.income : colors.muted }}>
              {Math.round(goal.saved_cents / goal.target_cents * 100)}% da meta
              {goal.saved_cents >= goal.target_cents ? ' • Concluída!' : ''}
            </Text>
            {goal.target_date ? <>
              <Text style={{ color: colors.muted }}>Prazo: {displayDate(goal.target_date)}</Text>
              <Text style={{ color: colors.muted }}>
                {monthlyTarget(goal.target_cents,goal.saved_cents,goal.target_date) === null ? 'Prazo encerrado.' :
                  `Para chegar à meta no prazo: ${monthlyTarget(goal.target_cents,goal.saved_cents,goal.target_date)} por mês (estimativa).`}
              </Text>
            </> : null}
            <Pressable onPress={() => startEditing(goal)} accessibilityRole="button" style={styles.link}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Editar objetivo</Text>
            </Pressable>
            <Pressable onPress={() => openGoal(goal.id)} accessibilityRole="button" style={styles.link}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>
                {selectedGoalId === goal.id ? 'Ocultar aportes' : 'Adicionar / conferir aportes'}
              </Text>
            </Pressable>
            {selectedGoalId === goal.id ? <View style={{ gap: 12 }}>
              <Field label="Novo aporte (R$)" value={deposit} onChangeText={setDeposit} placeholder="Ex.: 100,00" numeric />
              <Field label="Data (DD/MM/AAAA)" value={depositDate} onChangeText={setDepositDate} placeholder="DD/MM/AAAA" date />
              <ActionButton title={busy ? 'Salvando…' : 'Registrar aporte'} disabled={busy} onPress={() => run(async () => {
                await service.contribute(goal.id, parseMoney(deposit), depositDate);
                setDeposit('');
              }, 'Aporte registrado.')} />
              <Text style={{ color: colors.muted, fontSize: 12 }}>Aportes são registros de progresso: não debitam nenhuma conta nem criam despesas.</Text>
              <Text style={{ fontWeight: '700', color: colors.text }}>Histórico de aportes</Text>
              {contributions.length === 0 ? <Text style={{ color: colors.muted }}>Nenhum aporte.</Text> : contributions.map(item => (
                <View key={item.id} style={[styles.contribution, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '600' }}>{formatMoney(item.amount_cents)}</Text>
                    <Text style={{ color: colors.muted }}>{displayDate(item.date)}</Text></View>
                  <Pressable accessibilityRole="button" onPress={() => Alert.alert('Excluir aporte?',
                    'O valor será retirado do progresso da meta. Nenhuma movimentação financeira será alterada.', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Excluir', style: 'destructive', onPress: () => void run(
                        () => service.goals.deleteContribution(item.id, goal.id), 'Aporte excluído.') },
                    ])}><Text style={{ color: colors.expense, fontWeight: '600' }}>Excluir</Text></Pressable>
                </View>
              ))}
            </View> : null}
            <Pressable accessibilityRole="button" onPress={() => Alert.alert('Arquivar objetivo?',
              'A meta sairá da lista de objetivos ativos. Os aportes continuarão armazenados.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Arquivar', onPress: () => void run(async () => {
                  await service.archive(goal.id);
                  setSelectedGoalId(null);
                  setContributions([]);
                }, 'Objetivo arquivado.') },
              ])} style={styles.link}>
              <Text style={{ color: colors.muted }}>Arquivar objetivo</Text>
            </Pressable>
          </View>
        ))}
    </View>
  );
}

export function Field({ label, value, onChangeText, placeholder, numeric = false, date = false }: {
  label: string; value: string; onChangeText: (text: string) => void; placeholder: string; numeric?: boolean; date?: boolean;
}) {
  const { colors } = useAppTheme();
  return <View style={{ gap: 6 }}>
    <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
    {date ? <FinanceDateField value={value} onChange={onChangeText} style={[styles.input, { backgroundColor:colors.background, borderColor:colors.border }]}/> : <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={colors.muted} keyboardType={numeric ? 'decimal-pad' : 'default'}
      style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 17, padding: 17, gap: 12 },
  cardTitle: { fontWeight: '800', fontSize: 17 },
  input: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 16 },
  link: { paddingVertical: 6, alignSelf: 'flex-start' },
  contribution: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 8 },
});
