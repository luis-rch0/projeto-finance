import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useFinance } from '@/hooks/useFinance';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ActionButton } from '@/components/ui/ActionButton';
import { FinanceDateField } from '@/components/ui/FinanceDateField';
import type { Account, Category, MovementType, TransactionDetail } from '@/types/finance';
import { formatMoney, parseMoney } from '@/utils/currency';
import { todayISO } from '@/utils/date';
import { categorySymbol } from '@/features/categories/categoryStats';
import { PaymentService, type PaymentCard, type PaymentOption } from '@/services/paymentService';
import { firstInvoiceMonth, shiftInvoiceMonth, splitCardInstallments } from '@/utils/creditCards';

export function TransactionForm({ id, initialType = 'EXPENSE' }: { id?: string; initialType?: MovementType }) {
  const finance = useFinance();
  const db=useSQLiteContext();
  const payments=useMemo(()=>new PaymentService(db),[db]);
  const { colors } = useAppTheme();
  const [original,setOriginal] = useState<TransactionDetail | null>(null);
  const [type,setType] = useState<MovementType>(initialType);
  const [money,setMoney] = useState('');
  const [description,setDescription] = useState('');
  const [date,setDate] = useState(todayISO());
  const [accounts,setAccounts] = useState<Account[]>([]);
  const [categories,setCategories] = useState<Category[]>([]);
  const [accountId,setAccountId] = useState('');
  const [categoryId,setCategoryId] = useState('');
  const [paymentCards,setPaymentCards]=useState<PaymentCard[]>([]);
  const [paymentSource,setPaymentSource]=useState<'ACCOUNT'|'CARD'>('ACCOUNT');
  const [selectedCard,setSelectedCard]=useState('');
  const [cardMode,setCardMode]=useState<'DEBIT'|'CREDIT'>('CREDIT');
  const [accountMethod,setAccountMethod]=useState<'CASH'|'PIX'|'TRANSFER'|'OTHER'>('PIX');
  const [installmentsText,setInstallmentsText]=useState('1');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const dateFocused = useRef(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardHeight(Platform.OS === 'android' ? event.endCoordinates.height : 0);
      if (dateFocused.current) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 70);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([finance.accounts.findAll(),finance.categories.findAll(true),id?finance.transactions.findById(id):Promise.resolve(null),payments.listCards()])
      .then(([a,c,t,cards]) => {
        if (!active) return;
        setAccounts(a);setCategories(c);setAccountId(a[0]?.id??'');
        setPaymentCards(cards.filter(card=>!card.archived_at));
        setSelectedCard(cards.find(card=>!card.archived_at)?.id??'');
        if (id && !t) throw new Error('Movimentação não encontrada.');
        if (t) {
          setOriginal(t);setType(t.type);setMoney((t.amount_cents/100).toFixed(2).replace('.',','));
          setDescription(t.description);setDate(t.date);setAccountId(t.account_id);setCategoryId(t.category_id);
        }
      })
      .catch(e => { if(active) setError(e instanceof Error?e.message:String(e)); })
      .finally(() => { if(active) setLoading(false); });
    return () => { active=false; };
  },[finance,id,payments]);
  const filtered = categories.filter(c=>c.type===type && (!c.archived_at || c.id===original?.category_id));
  const activeCard=paymentCards.find(card=>card.id===selectedCard);
  const count=Number(installmentsText);
  let preview: {month:string;amount:number}[]=[];
  if(!original && type==='EXPENSE' && paymentSource==='CARD' && cardMode==='CREDIT' &&
    activeCard?.allows_credit && activeCard.closing_day && activeCard.due_day && /^\d+$/.test(installmentsText)){
    try {
      const total=parseMoney(money);
      const amounts=splitCardInstallments(total,count);
      const first=firstInvoiceMonth(date,activeCard.closing_day,activeCard.due_day);
      preview=amounts.map((amount,index)=>({month:shiftInvoiceMonth(first,index),amount}));
    } catch { /* Só exibe previsão com campos válidos. */ }
  }
  async function save() {
    if (busy) return;
    setBusy(true);setError('');
    try {
      const input = {type, amount_cents:parseMoney(money),description,date,account_id:accountId,category_id:categoryId};
      if (original) await finance.updateTransaction({...original,...input});
      else if(type==='EXPENSE') {
        let payment: PaymentOption;
        if(paymentSource==='ACCOUNT') payment={method:'ACCOUNT',accountId,kind:accountMethod};
        else if(cardMode==='DEBIT') payment={method:'DEBIT',cardId:selectedCard};
        else {
          if(!/^\d+$/.test(installmentsText))throw new Error('Digite a quantidade de parcelas usando números inteiros.');
          payment={method:'CREDIT',cardId:selectedCard,installmentsCount:Number(installmentsText)};
        }
        await payments.registerExpense({amount_cents:input.amount_cents,description,date,category_id:categoryId},payment);
      } else await finance.createTransaction(input);
      if (!original && type==='EXPENSE' && paymentSource==='CARD' && cardMode==='CREDIT' &&
          activeCard?.closing_day && activeCard.due_day) {
        const invoiceMonth=firstInvoiceMonth(date,activeCard.closing_day,activeCard.due_day);
        Alert.alert('Compra registrada', 'A compra foi adicionada às faturas. Não será contada novamente como despesa até o pagamento.',[
          {text:'Voltar',onPress:()=>router.back()},
          {text:'Ver fatura',onPress:()=>router.replace({pathname:'/cards',params:{cardId:selectedCard,invoiceMonth}})},
        ]);
      } else {
        Alert.alert('Salvo', original?'Movimentação atualizada.':'Movimentação registrada.',[
          {text:'OK',onPress:()=>router.back()},
        ]);
      }
    } catch(e) {setError(e instanceof Error?e.message:String(e));}
    finally {setBusy(false);}
  }
  function remove() {
    if(!original || busy)return;
    Alert.alert('Excluir movimentação?', 'A exclusão altera os totais e os limites mensais. Não pode ser desfeita.',[
      {text:'Cancelar',style:'cancel'},
      {text:'Excluir',style:'destructive',onPress:async()=>{
        setBusy(true);setError('');
        try {await finance.deleteTransaction(original.id);router.back();}
        catch(e) {setError(e instanceof Error?e.message:String(e));}
        finally {setBusy(false);}
      }},
    ]);
  }
  if (loading) return <ActivityIndicator color={colors.primary} style={{flex:1,backgroundColor:colors.background}} />;
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:colors.background}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView ref={scrollRef} contentContainerStyle={[styles.page,{paddingBottom:Math.max(45, keyboardHeight + 40)}]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={[styles.label,{color:colors.text}]}>Tipo</Text>
      <View style={styles.options}>{(['EXPENSE','INCOME'] as MovementType[]).map(t=><Pressable key={t} onPress={()=>{if(original?.payment_kind==='DEBIT') return;setType(t);setCategoryId(t===original?.type?original.category_id:'');}}
        style={[styles.pill,{backgroundColor:type===t?colors.primary:colors.surface,borderColor:colors.border}]}>
        <Text style={{color:type===t?colors.onPrimary:colors.text,fontWeight:'700'}}>{t==='EXPENSE'?'Despesa':'Receita'}</Text>
      </Pressable>)}</View>
      <Text style={[styles.label,{color:colors.text}]}>Valor (R$)</Text>
      <TextInput value={money} onChangeText={setMoney} placeholder="Ex.: 125,90" placeholderTextColor={colors.muted} keyboardType="decimal-pad"
        style={[styles.input,{color:colors.text,backgroundColor:colors.surface,borderColor:colors.border}]}/>
      <Text style={[styles.label,{color:colors.text}]}>Descrição</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder="Ex.: Almoço" placeholderTextColor={colors.muted}
        style={[styles.input,{color:colors.text,backgroundColor:colors.surface,borderColor:colors.border}]}/>
      <Text style={[styles.label,{color:colors.text}]}>Categoria</Text>
      <View style={styles.options}>{filtered.map(c=><Pressable key={c.id} onPress={()=>setCategoryId(c.id)}
        style={[styles.pill,{backgroundColor:categoryId===c.id?colors.primary:colors.surface,borderColor:colors.border}]}>
        <Text style={{color:categoryId===c.id?colors.onPrimary:colors.text}}>{categorySymbol(c)} {c.name}{c.archived_at?' (arquivada)':''}</Text>
      </Pressable>)}</View>
      {!original && type==='EXPENSE' && <>
        <Text style={[styles.label,{color:colors.text}]}>Pagar com</Text>
        <View style={styles.options}>
          {[{id:'ACCOUNT',label:'Conta / Pix / Dinheiro'},{id:'CARD',label:'Cartão'}].map(option=><Pressable key={option.id}
            onPress={()=>setPaymentSource(option.id as 'ACCOUNT'|'CARD')}
            style={[styles.pill,{backgroundColor:paymentSource===option.id?colors.primary:colors.surface,borderColor:colors.border}]}>
            <Text style={{color:paymentSource===option.id?colors.onPrimary:colors.text,fontWeight:'700'}}>{option.label}</Text>
          </Pressable>)}
        </View>
      </>}
      {(original || type==='INCOME' || paymentSource==='ACCOUNT') && <>
        <Text style={[styles.label,{color:colors.text}]}>Conta</Text>
        <View style={styles.options}>{accounts.map(a=><Pressable key={a.id} onPress={()=>{if (original?.payment_kind!=='DEBIT') setAccountId(a.id);}}
          style={[styles.pill,{backgroundColor:accountId===a.id?colors.primary:colors.surface,borderColor:colors.border}]}>
          <Text style={{color:accountId===a.id?colors.onPrimary:colors.text}}>{a.name}</Text>
        </Pressable>)}</View>
      </>}
      {!original && type==='EXPENSE' && paymentSource==='ACCOUNT' && <>
        <Text style={[styles.label,{color:colors.text}]}>Forma de pagamento</Text>
        <View style={styles.options}>{([
          {key:'PIX',name:'Pix'}, {key:'TRANSFER',name:'Transferência'},
          {key:'CASH',name:'Dinheiro'}, {key:'OTHER',name:'Outros'},
        ] as const).map(option=><Pressable key={option.key} onPress={()=>setAccountMethod(option.key)}
          style={[styles.pill,{backgroundColor:accountMethod===option.key?colors.primary:colors.surface,borderColor:colors.border}]}>
          <Text style={{color:accountMethod===option.key?colors.onPrimary:colors.text}}>{option.name}</Text>
        </Pressable>)}</View>
      </>}
      {!original && type==='EXPENSE' && paymentSource==='CARD' && <>
        <Text style={[styles.label,{color:colors.text}]}>Seu cartão</Text>
        <View style={styles.options}>{paymentCards.map(card=><Pressable key={card.id} onPress={()=>{
          setSelectedCard(card.id);setCardMode(card.allows_credit?'CREDIT':'DEBIT');}}
          style={[styles.pill,{backgroundColor:selectedCard===card.id?colors.primary:colors.surface,borderColor:colors.border}]}>
          <Text style={{color:selectedCard===card.id?colors.onPrimary:colors.text}}>{card.name}</Text>
        </Pressable>)}</View>
        {!paymentCards.length && <Text style={{color:colors.muted}}>Cadastre um cartão em Configurações → Contas e cartões.</Text>}
        <Text style={[styles.label,{color:colors.text}]}>Modalidade</Text>
        <View style={styles.options}>
          {([['DEBIT','Débito'],['CREDIT','Crédito']] as const).map(([mode,label])=><Pressable key={mode}
            disabled={mode==='DEBIT'?!activeCard?.allows_debit:!activeCard?.allows_credit} onPress={()=>setCardMode(mode)}
            style={[styles.pill,{backgroundColor:cardMode===mode?colors.primary:colors.surface,borderColor:colors.border,
              opacity:(mode==='DEBIT'?!activeCard?.allows_debit:!activeCard?.allows_credit)?.45:1}]}>
            <Text style={{color:cardMode===mode?colors.onPrimary:colors.text}}>{label}</Text>
          </Pressable>)}
        </View>
        {cardMode==='CREDIT' ? <>
          <Text style={[styles.label,{color:colors.text}]}>Quantidade de parcelas (digite)</Text>
          <TextInput accessibilityLabel="Quantidade de parcelas" keyboardType="number-pad" value={installmentsText}
            onChangeText={setInstallmentsText} maxLength={2} placeholder="Ex.: 1, 5, 18"
            placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surface,borderColor:colors.border}]}/>
          <Text style={{color:colors.muted,fontSize:12}}>Digite de 1 a 60. Use 1 para compra à vista na fatura.</Text>
          {!!preview.length && <View style={[styles.preview,{backgroundColor:colors.surfaceAlt}]}>
            <Text style={{color:colors.text,fontWeight:'800'}}>Prévia das faturas</Text>
            {preview.slice(0,5).map((part,i)=><Text key={part.month} style={{color:colors.text,fontSize:12}}>
              {part.month} · {i+1}/{preview.length} — {formatMoney(part.amount)}</Text>)}
            {preview.length>5 && <Text style={{color:colors.muted,fontSize:12}}>+ {preview.length-5} parcelas futuras</Text>}
            <Text style={{color:colors.muted,fontSize:12}}>Esta compra entra no consumo agora. Sai da conta apenas ao pagar a fatura.</Text>
          </View>}
        </> : <Text style={{color:colors.muted,fontSize:12,marginTop:8}}>O débito será registrado na conta vinculada ao cartão.</Text>}
      </>}
      {original?.payment_kind==='DEBIT' && <Text style={{color:colors.muted,fontSize:12,marginTop:12}}>Conta e tipo bloqueados neste débito para preservar o vínculo histórico com o cartão.</Text>}
      <Text style={[styles.label,{color:colors.text}]}>Data (DD/MM/AAAA)</Text>
      <FinanceDateField value={date} onChange={setDate} style={styles.input}
        onFocus={()=>{dateFocused.current=true;setTimeout(()=>scrollRef.current?.scrollToEnd({animated:true}),250);}}
        onBlur={()=>{dateFocused.current=false;}} />
      {!!error && <Text style={{color:colors.expense,marginTop:12}}>{error}</Text>}
      {original && <Text style={{color:colors.muted,marginTop:15,fontSize:12}}>Registro original: {formatMoney(original.amount_cents)}</Text>}
      <ActionButton title={busy?'Salvando...':original?'Salvar alterações':'Salvar movimentação'} onPress={save} disabled={busy} style={{marginTop:24}}/>
      {original && <Pressable onPress={remove} disabled={busy} style={{padding:16,alignItems:'center'}}>
        <Text style={{color:colors.expense,fontWeight:'700'}}>Excluir movimentação</Text>
      </Pressable>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({page:{padding:20,paddingBottom:45},label:{fontSize:15,fontWeight:'700',marginTop:16,marginBottom:9},input:{borderRadius:12,borderWidth:1,padding:14,fontSize:16},options:{flexDirection:'row',flexWrap:'wrap',gap:8},pill:{paddingHorizontal:15,paddingVertical:11,borderRadius:100,borderWidth:1},preview:{padding:13,borderRadius:14,marginTop:14,gap:7}});
