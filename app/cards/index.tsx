import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { FinanceDateField } from '@/components/ui/FinanceDateField';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CreditCardService, type CardInvoice, type CreditCard } from '@/services/creditCardService';
import { AccountRepository } from '@/database/repositories/accountRepository';
import { CategoryRepository } from '@/database/repositories/categoryRepository';
import type { Account, Category } from '@/types/finance';
import { useAppTheme } from '@/hooks/useAppTheme';
import { formatMoney, parseMoney } from '@/utils/currency';
import { FinanceNotice } from '@/components/ui/FinanceNotice';
import { displayDate, formatMonth, todayISO } from '@/utils/date';
import { shiftInvoiceMonth } from '@/utils/creditCards';

const thisMonth = () => todayISO().slice(0, 7);
function readableError(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export default function CreditCardsScreen() {
  const { cardId,invoiceMonth } = useLocalSearchParams<{cardId?:string;invoiceMonth?:string}>();
  const db = useSQLiteContext();
  const service = useMemo(() => new CreditCardService(db), [db]);
  const { colors } = useAppTheme();
  const keyboardBottom = useKeyboardBottomSpacing(110);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [selectedId, setSelectedId] = useState(cardId ?? '');
  const [month, setMonth] = useState(invoiceMonth&&/^\d{4}-(0[1-9]|1[0-2])$/.test(invoiceMonth)?invoiceMonth:thisMonth());
  const [invoice, setInvoice] = useState<CardInvoice | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [classifying,setClassifying]=useState<string|null>(null);
  const [editingPurchase,setEditingPurchase] = useState<string|null>(null);
  const [editDescription,setEditDescription] = useState('');
  const [editDate,setEditDate] = useState('');
  const [editValue,setEditValue] = useState('');
  const [editCount,setEditCount] = useState('1');

  const [accountId, setAccountId] = useState('');

  const [paidDate, setPaidDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const refresh = useCallback(async (choice = selectedId, selectedMonth = month) => {
    const [nextCards, nextAccounts, nextCategories] = await Promise.all([
      service.listCards(), new AccountRepository(db).findAll(),
      new CategoryRepository(db).findByType('EXPENSE'),
    ]);
    setCards(nextCards);
    setAccounts(nextAccounts);
    setCategories(nextCategories);

    // Vencimentos pode abrir uma fatura antiga de cartão já removido.
    // Ela continua consultável/pagável, sem reaparecer no seletor geral.
    const removedLink = cardId && choice === cardId && !nextCards.some(c => c.id === choice)
      ? (await service.listCards(true)).find(c => c.id === choice)
      : undefined;
    const visibleCards = removedLink ? [...nextCards, removedLink] : nextCards;
    if (removedLink) setCards(visibleCards);
    const nextId = visibleCards.some(c => c.id === choice) ? choice : visibleCards.find(c => !c.archived_at)?.id ?? visibleCards[0]?.id ?? '';
    setSelectedId(nextId);
    setAccountId(old => nextAccounts.some(a => a.id === old) ? old : nextAccounts[0]?.id ?? '');

    setInvoice(nextId ? await service.getInvoice(nextId, selectedMonth) : null);
  }, [db, month, selectedId, service]);

  useFocusEffect(useCallback(() => { void refresh().catch(e => setError(readableError(e))); }, [refresh]));

  async function perform(action: () => Promise<string | void>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      const nextMonth = await action();
      if (typeof nextMonth === 'string') setMonth(nextMonth);
      await refresh(selectedId, typeof nextMonth === 'string' ? nextMonth : month);
      setFeedback(success);
    } catch (e) { setError(readableError(e)); }
    finally { setBusy(false); scrollRef.current?.scrollTo({ y: 0, animated: true }); }
  }

  async function openPurchaseEditor(purchaseId: string) {
    setError(''); setFeedback('');
    try {
      const purchase = await service.getPurchase(purchaseId);
      if (!purchase) throw new Error('Compra não encontrada.');
      setEditingPurchase(purchaseId);
      setEditDescription(purchase.description);
      setEditDate(purchase.purchase_date);
      setEditValue((purchase.total_cents / 100).toFixed(2).replace('.', ','));
      setEditCount(String(purchase.installments_count));
      setClassifying(null);
    } catch (e) { setError(readableError(e)); }
  }

  function savePurchase() {
    if (!editingPurchase || busy) return;
    const purchaseId = editingPurchase;
    void perform(async () => {
      const text = editCount.trim();
      if (!/^\d{1,2}$/.test(text) || Number(text) < 1 || Number(text) > 60) {
        throw new Error('Digite uma quantidade entre 1 e 60 parcelas.');
      }
      const nextMonth = await service.editPurchase(purchaseId, {
        description: editDescription,
        purchase_date: editDate.trim(),
        total_cents: parseMoney(editValue),
        installments_count: Number(text),
      });
      setEditingPurchase(null);
      return nextMonth;
    }, 'Compra atualizada. Confira a nova distribuição nas faturas.');
  }

  async function selectCard(id: string) {
    setSelectedId(id); setError(''); setEditingPurchase(null);
    try { setInvoice(await service.getInvoice(id, month)); }
    catch (e) { setError(readableError(e)); }
  }
  async function changeMonth(delta: number) {
    const next = shiftInvoiceMonth(month, delta);
    setMonth(next); setError(''); setEditingPurchase(null);
    if (selectedId) {
      try { setInvoice(await service.getInvoice(selectedId, next)); }
      catch (e) { setError(readableError(e)); }
    }
  }

  const fieldStyle = { color: colors.text, backgroundColor: colors.background, borderColor: colors.border };
  const activeCard = cards.find(c => c.id === selectedId);
  return <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }}
    contentContainerStyle={[styles.page,{paddingBottom:keyboardBottom}]}>
    <Text style={[styles.title, { color: colors.text }]}>Cartões e faturas</Text>
    <Text style={[styles.intro, { color: colors.muted }]}>
      Consulte parcelas e pague faturas. Para registrar uma compra, use Nova despesa.
    </Text>

    {!!error && <FinanceNotice kind="error" message={error} onDismiss={() => setError('')} />}
    {!!feedback && <FinanceNotice kind="success" message={feedback} onDismiss={() => setFeedback('')} />}

    <View style={[styles.panel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={[styles.heading,{color:colors.text}]}>Escolha o cartão</Text>
      <View style={styles.chips}>{cards.map(card=><Pressable key={card.id} onPress={()=>void selectCard(card.id)}
        style={[styles.chip,{backgroundColor:selectedId===card.id?colors.primary:colors.surfaceAlt,borderColor:colors.border}]}>
        <Text style={{color:selectedId===card.id?colors.onPrimary:colors.text,fontWeight:'800'}}>{card.name}</Text>
      </Pressable>)}</View>
      {!cards.length && <Text style={{color:colors.muted}}>Cadastre cartões em Configurações → Contas e cartões.</Text>}
      <Text style={{color:colors.muted,fontSize:12}}>Compras novas são registradas em Nova despesa.</Text>
    </View>

    {activeCard && <>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Fatura</Text>
        <View style={styles.monthRow}>
          <Pressable accessibilityLabel="Mês anterior" accessibilityRole="button" onPress={() => void changeMonth(-1)} style={styles.monthArrow}>
            <Text style={{ color: colors.primary, fontSize: 27 }}>‹</Text>
          </Pressable>
          <Text style={[styles.monthTitle, { color: colors.text }]}>{formatMonth(Number(month.slice(0, 4)), Number(month.slice(5)))}</Text>
          <Pressable accessibilityLabel="Próximo mês" accessibilityRole="button" onPress={() => void changeMonth(1)} style={styles.monthArrow}>
            <Text style={{ color: colors.primary, fontSize: 27 }}>›</Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.muted }}>Vencimento: {invoice ? displayDate(invoice.due_date) : '—'}</Text>
        <Text style={[styles.total, { color: colors.text }]}>{formatMoney(invoice?.total_cents ?? 0)}</Text>
        <Text style={{ color: invoice?.payment ? colors.income : colors.muted, fontWeight: '700' }}>
          {invoice?.payment ? `Paga em ${displayDate(invoice.payment.paid_date)}` : 'Ainda não paga'}
        </Text>
        {invoice?.items.length ? invoice.items.map(item => <View key={item.id}
          style={[styles.invoiceItemWrapper, { borderTopColor: colors.border }]}>
          <View style={styles.invoiceItem}>
          <View style={styles.grow}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{item.description}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {item.sequence}/{item.installments_count} · Compra {displayDate(item.purchase_date)}
            </Text>
            <Pressable onPress={()=>setClassifying(classifying===item.purchase_id?null:item.purchase_id)}>
              <Text style={{color:colors.primary,fontSize:12,fontWeight:'700'}}>
                {categories.find(c=>c.id===item.category_id)?.name??'Sem categoria'} · Classificar
              </Text>
            </Pressable>
            {classifying===item.purchase_id && <View style={styles.chips}>
              {categories.map(c=><Pressable key={c.id} disabled={busy} onPress={()=>void perform(async()=>{
                await service.setPurchaseCategory(item.purchase_id,c.id);setClassifying(null);
              },'Categoria atualizada.')} style={[styles.chip,
                {backgroundColor:item.category_id===c.id?colors.surfaceAlt:colors.background,borderColor:colors.border}]}>
                <Text style={{color:colors.text,fontSize:12}}>{c.name}</Text>
              </Pressable>)}
            </View>}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 5 }}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{formatMoney(item.amount_cents)}</Text>
            {!invoice.payment && <Pressable accessibilityRole="button" disabled={busy}
              onPress={() => editingPurchase === item.purchase_id
                ? setEditingPurchase(null)
                : void openPurchaseEditor(item.purchase_id)}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>
                {editingPurchase === item.purchase_id ? 'Cancelar' : 'Editar compra'}
              </Text>
            </Pressable>}
            {!invoice.payment && <Pressable accessibilityRole="button" disabled={busy}
              onPress={() => Alert.alert('Excluir compra?',
                'Todas as parcelas desta compra serão removidas das faturas ainda não pagas.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Excluir', style: 'destructive', onPress: () => void perform(
                    () => service.removePurchase(item.purchase_id), 'Compra removida.') },
                ])}><Text style={{ color: colors.expense, fontSize: 12 }}>Excluir</Text></Pressable>}
          </View>
          </View>
          {editingPurchase === item.purchase_id && (
            <View style={[styles.editBox, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.headingSmall, { color: colors.text }]}>Editar compra</Text>
              <Text style={[styles.label, { color: colors.text }]}>Descrição</Text>
              <TextInput value={editDescription} onChangeText={setEditDescription}
                style={[styles.input, fieldStyle]} placeholder="Ex.: Compra no mercado" placeholderTextColor={colors.muted}/>
              <Text style={[styles.label, { color: colors.text }]}>Data da compra (DD/MM/AAAA)</Text>
              <FinanceDateField value={editDate} onChange={setEditDate} style={[styles.input,fieldStyle]}/>
              <View style={styles.inlineFields}>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: colors.text }]}>Valor total (R$)</Text>
                  <TextInput keyboardType="decimal-pad" value={editValue} onChangeText={setEditValue}
                    style={[styles.input, fieldStyle]} placeholder="150,00" placeholderTextColor={colors.muted}/>
                </View>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: colors.text }]}>Nº de parcelas</Text>
                  <TextInput keyboardType="number-pad" maxLength={2} value={editCount} onChangeText={setEditCount}
                    style={[styles.input, fieldStyle]} placeholder="Ex.: 7" placeholderTextColor={colors.muted}/>
                </View>
              </View>
              <Text style={[styles.hint, { color: colors.muted }]}>
                A atualização redistribui as parcelas ainda não pagas. Compras com alguma fatura já paga não podem ser alteradas.
              </Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={savePurchase}
                style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
                <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>Salvar alterações</Text>
              </Pressable>
            </View>
          )}
        </View>) : <Text style={[styles.hint, { color: colors.muted }]}>Sem compras nesta fatura.</Text>}
        {invoice && invoice.total_cents > 0 && <>
          {!invoice.payment ? <>
            <Text style={[styles.label, { color: colors.text }]}>Data de pagamento (DD/MM/AAAA)</Text>
            <FinanceDateField value={paidDate} onChange={setPaidDate} style={[styles.input,fieldStyle]}/>
            <Text style={[styles.label, { color: colors.text }]}>Conta usada para pagar</Text>
            <View style={styles.chips}>{accounts.map(a => <Pressable key={a.id} accessibilityRole="button"
              onPress={() => setAccountId(a.id)} style={[styles.chip,
                { borderColor: colors.border, backgroundColor: a.id === accountId ? colors.surfaceAlt : colors.background }]}>
              <Text style={{ color: a.id === accountId ? colors.primary : colors.text }}>{a.name}</Text>
            </Pressable>)}</View>
            <Text style={[styles.hint, { color: colors.muted }]}>
              O Finance criará uma única despesa correspondente ao total da fatura.
            </Text>
            <Pressable disabled={busy} accessibilityRole="button" style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={() => Alert.alert('Confirmar pagamento?',
                `Registrar ${formatMoney(invoice.total_cents)} como despesa em ${displayDate(paidDate)}?`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Confirmar', onPress: () => void perform(() => service.payInvoice({
                    card_id: activeCard.id, invoice_month: month, account_id: accountId,
                    paid_date: paidDate,
                  }), 'Fatura paga e registrada no histórico.') },
                ])}>
              <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>Marcar fatura como paga</Text>
            </Pressable>
          </> : <Pressable accessibilityRole="button" disabled={busy} style={styles.textAction}
            onPress={() => Alert.alert('Estornar pagamento?',
              'A despesa vinculada será excluída do histórico, mas as compras e parcelas serão preservadas.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Estornar', style: 'destructive', onPress: () => void perform(
                  () => service.reversePayment(activeCard.id, month), 'Pagamento estornado.') },
              ])}>
            <Text style={{ color: colors.expense, fontWeight: '800' }}>Estornar pagamento desta fatura</Text>
          </Pressable>}
        </>}
      </View>

    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 110 },
  title: { fontSize: 27, fontWeight: '900', letterSpacing: -.5 },
  intro: { fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 18 },
  panel: { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 16, gap: 11 },
  heading: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 18 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  inlineFields: { flexDirection: 'row', gap: 12 },
  half: { flex: 1, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 99 },
  button: { borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  textAction: { alignItems: 'center', paddingVertical: 10 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthArrow: { paddingHorizontal: 14, paddingVertical: 2 },
  monthTitle: { fontWeight: '800', fontSize: 16, textTransform: 'capitalize', textAlign: 'center' },
  total: { fontSize: 28, fontWeight: '900' },
  invoiceItemWrapper: { paddingTop: 12, borderTopWidth: 1, gap: 10 },
  invoiceItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  editBox: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 9 },
  headingSmall: { fontWeight: '800', fontSize: 15 },
  grow: { flex: 1 },
});
