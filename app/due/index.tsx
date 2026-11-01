import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { FinanceDateField } from '@/components/ui/FinanceDateField';
import { DueService } from '@/services/dueService';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { MonthSwitcher, type SelectedMonth } from '@/components/finance/MonthSwitcher';
import { FinanceNotice } from '@/components/ui/FinanceNotice';
import { useAppTheme } from '@/hooks/useAppTheme';
import { RecurrenceService } from '@/services/recurrenceService';
import { InstallmentService } from '@/services/installmentService';
import { syncReminderNotifications } from '@/services/reminderService';
import type { InstallmentDetail, OccurrenceDetail } from '@/types/finance';
import { formatMoney, parseMoney } from '@/utils/currency';
import { displayDate } from '@/utils/date';
import { monthBounds } from '@/utils/date';

type DueItem = {
  id: string; kind: 'INSTALLMENT' | 'RECURRENCE' | 'CARD_INVOICE'; date: string; title: string; amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'SKIPPED'; category: string; detail: string;
  type: 'INCOME' | 'EXPENSE';
};
const moneyInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
function installmentDue(i: InstallmentDetail): DueItem {
  return { id: i.id, kind: 'INSTALLMENT', date: i.due_date, title: i.description,
    amount: i.amount_cents, status: i.status, category: i.category_name,
    detail: `Parcela ${i.sequence}/${i.installments_count}`, type: 'EXPENSE' };
}
function recurrenceDue(o: OccurrenceDetail): DueItem {
  return { id: o.id, kind: 'RECURRENCE', date: o.occurrence_date, title: o.description,
    amount: o.amount_cents, status: o.status, category: o.category_name,
    detail: 'Recorrência', type: o.type };
}
const currentMonth = (): SelectedMonth => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

export default function DueScreen() {
  const db = useSQLiteContext();
  const recurrence = useMemo(() => new RecurrenceService(db), [db]);
  const installments = useMemo(() => new InstallmentService(db), [db]);
  const due = useMemo(() => new DueService(db), [db]);
  const { colors } = useAppTheme();
  const keyboardBottom = useKeyboardBottomSpacing(85);
  const [month, setMonth] = useState<SelectedMonth>(currentMonth);
  const [items, setItems] = useState<DueItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editMoney, setEditMoney] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [start,end]=monthBounds(month.year,month.month);
    const [rules, plans, invoices] = await Promise.all([
      recurrence.listMonth(month.year, month.month),
      installments.plans.findMonth(month.year, month.month),
      due.listPendingInvoices(month.year, month.month),
    ]);
    setItems([...rules.map(recurrenceDue), ...plans.map(installmentDue),
      ...invoices.map(i=>({id:i.id,kind:'CARD_INVOICE' as const,date:i.date,title:i.title,
        amount:i.amount,status:'PENDING' as const,category:'Cartão de crédito',detail:'Fatura mensal',type:'EXPENSE' as const}))]
      .sort((a, b) => a.date.localeCompare(b.date)));
  }, [recurrence, installments, due, month.year, month.month]);
  useFocusEffect(useCallback(() => {
    void refresh().catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [refresh]));

  async function updateReminders() {
    try { await syncReminderNotifications(db); }
    catch (reason) { console.warn('Lembretes não atualizados', reason); }
  }
  async function act(item: DueItem, action: 'confirm' | 'skip' | 'reopen') {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if(item.kind==='CARD_INVOICE')throw new Error('Abra a fatura para confirmar o pagamento.');
      const service = item.kind === 'INSTALLMENT' ? installments : recurrence;
      await service[action](item.id);
      await refresh();
      await updateReminders();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function confirm(item: DueItem) {
    Alert.alert('Confirmar lançamento?',
      `${item.title} · ${formatMoney(item.amount)} · ${displayDate(item.date)}. O valor será lançado no histórico.`,
      [{ text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => { void act(item, 'confirm'); } }]);
  }
  function beginEdit(item: DueItem) {
    setError('');
    setEditingId(`${item.kind}:${item.id}`);
    setEditDate(item.date);
    setEditMoney(moneyInput(item.amount));
    setEditDescription(item.title);
  }
  async function saveEdit(item: DueItem) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const amount_cents = parseMoney(editMoney);
      if (item.kind === 'CARD_INVOICE') throw new Error('Abra a fatura para editar.');
      if (item.kind === 'INSTALLMENT') {
        await installments.editItem(item.id, { due_date: editDate.trim(), amount_cents });
      } else {
        await recurrence.editOccurrence(item.id, {
          date: editDate.trim(), amount_cents, description: editDescription,
        });
      }
      setEditingId(null);
      await refresh();
      await updateReminders();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const pending = items.filter(item => item.status === 'PENDING');
  const expensePending = pending.filter(item => item.type === 'EXPENSE').reduce((sum, item) => sum + item.amount, 0);
  const incomePending = pending.filter(item => item.type === 'INCOME').reduce((sum, item) => sum + item.amount, 0);
  const statusLabel = { PENDING: 'Pendente', CONFIRMED: 'Confirmado', SKIPPED: 'Ignorado' } as const;
  const inputStyle = { color: colors.text, backgroundColor: colors.background, borderColor: colors.border };

  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.page,{paddingBottom:keyboardBottom}]} keyboardShouldPersistTaps="handled">
    <View style={styles.titleRow}>
      <Text style={[styles.title, { color: colors.text }]}>Vencimentos</Text>
      <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button">
        <Text style={{ color: colors.primary, fontWeight: '800' }}>Lembretes</Text>
      </Pressable>
    </View>
    <Text style={{ color: colors.muted, marginBottom: 15 }}>
      Edite pendências individualmente. Lançamentos confirmados continuam preservados no histórico.
    </Text>
    {!!error && <FinanceNotice kind="error" message={error} onDismiss={() => setError('')} />}
    <MonthSwitcher value={month} onChange={value => { setEditingId(null); setMonth(value); }} />
    <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>Pendências: {pending.length}</Text>
      <Text style={{ color: colors.expense }}>Despesas previstas: {formatMoney(expensePending)}</Text>
      <Text style={{ color: colors.income }}>Receitas previstas: {formatMoney(incomePending)}</Text>
    </View>
    <View style={styles.actions}>
      <Pressable onPress={() => router.push('/installments')}><Text style={{ color: colors.primary, fontWeight: '700' }}>+ Parcelamento</Text></Pressable>
      <Pressable onPress={() => router.push('/recurrences')}><Text style={{ color: colors.primary, fontWeight: '700' }}>+ Recorrência</Text></Pressable>
    </View>
    {!items.length && <Text style={{ color: colors.muted, marginTop: 20 }}>Sem vencimentos neste mês.</Text>}
    {items.map(item => {
      const editing = editingId === `${item.kind}:${item.id}`;
      return <View key={`${item.kind}:${item.id}`} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{item.title} · {formatMoney(item.amount)}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{displayDate(item.date)} · {item.category} · {item.detail}</Text>
            <Text style={{ color: item.status === 'PENDING' ? colors.warning : item.status === 'CONFIRMED' ? colors.income : colors.muted }}>
              {statusLabel[item.status]}
            </Text>
          </View>
          <View style={{ gap: 10, alignItems: 'flex-end' }}>
            {item.kind === 'CARD_INVOICE' ? <Pressable onPress={()=>router.push({pathname:'/cards',
              params:{cardId:item.id,invoiceMonth:`${month.year}-${String(month.month).padStart(2,'0')}`}})}>
              <Text style={{color:colors.primary,fontWeight:'800'}}>Abrir fatura</Text>
            </Pressable> : item.status === 'PENDING' && <>
              <Pressable disabled={busy} onPress={() => editing ? setEditingId(null) : beginEdit(item)}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{editing ? 'Cancelar' : 'Editar'}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => confirm(item)}><Text style={{ color: colors.primary }}>Confirmar</Text></Pressable>
              <Pressable disabled={busy} onPress={() => { void act(item, 'skip'); }}><Text style={{ color: colors.muted }}>Ignorar</Text></Pressable>
            </>}
            {item.kind!=='CARD_INVOICE' && item.status === 'SKIPPED' && <Pressable disabled={busy} onPress={() => { void act(item, 'reopen'); }}>
              <Text style={{ color: colors.primary }}>Reabrir</Text>
            </Pressable>}
          </View>
        </View>
        {editing && <View style={[styles.editor, { borderTopColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text }]}>Data do vencimento (DD/MM/AAAA)</Text>
          <FinanceDateField value={editDate} onChange={setEditDate} style={[styles.input,inputStyle]}/>
          <Text style={[styles.label, { color: colors.text }]}>Valor (R$)</Text>
          <TextInput value={editMoney} onChangeText={setEditMoney} style={[styles.input, inputStyle]} keyboardType="decimal-pad" placeholder="99,90" placeholderTextColor={colors.muted} />
          {item.kind === 'RECURRENCE' ? <>
            <Text style={[styles.label, { color: colors.text }]}>Descrição deste vencimento</Text>
            <TextInput value={editDescription} onChangeText={setEditDescription} style={[styles.input, inputStyle]} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>Os outros meses da recorrência não serão modificados.</Text>
          </> : <Text style={{ color: colors.muted, fontSize: 12 }}>Para alterar o nome da compra, edite o parcelamento.</Text>}
          <Pressable disabled={busy} onPress={() => { void saveEdit(item); }} style={[styles.save, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>{busy ? 'Salvando...' : 'Salvar vencimento'}</Text>
          </Pressable>
        </View>}
      </View>;
    })}
    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 16 }}>
      Itens confirmados podem ser corrigidos na tela Histórico; esta edição modifica somente pendências.
    </Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 85 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 8, marginBottom: 18 },
  actions: { flexDirection: 'row', gap: 22, marginBottom: 14, flexWrap: 'wrap' },
  card: { padding: 14, borderWidth: 1, borderRadius: 14, marginBottom: 10, gap: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editor: { borderTopWidth: 1, paddingTop: 12, gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  input: { padding: 12, borderWidth: 1, borderRadius: 11, fontSize: 15 },
  save: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 8 },
});
