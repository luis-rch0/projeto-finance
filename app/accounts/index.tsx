import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { TransferService } from '@/services/transferService';
import { PaymentService, type PaymentCard } from '@/services/paymentService';
import type { AccountType, AccountWithBalance } from '@/types/finance';
import { formatMoney } from '@/utils/currency';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FinancePanel, SectionHeader } from '@/components/ui/FinancePanel';
import { FinanceIcon } from '@/components/ui/FinanceIcon';
import { FinanceNotice } from '@/components/ui/FinanceNotice';

const types: { key: AccountType; label: string }[] = [
  {key:'CHECKING',label:'Banco'},{key:'CASH',label:'Dinheiro'},
  {key:'SAVINGS',label:'Poupança'},{key:'OTHER',label:'Outra'},
];
const errText = (e: unknown) => e instanceof Error ? e.message : String(e);

export default function AccountsAndCards() {
  const db = useSQLiteContext();
  const service = useMemo(() => new PaymentService(db),[db]);
  const transferService = useMemo(() => new TransferService(db),[db]);
  const {colors} = useAppTheme();
  const keyboardBottom = useKeyboardBottomSpacing(85);
  const [accounts,setAccounts]=useState<AccountWithBalance[]>([]);
  const [cards,setCards]=useState<PaymentCard[]>([]);
  const [removedCards,setRemovedCards]=useState<PaymentCard[]>([]);
  const [showRemoved,setShowRemoved]=useState(false);
  const [selectedAccount,setSelectedAccount]=useState<string|null>(null);
  const [accountName,setAccountName]=useState('');
  const [accountType,setAccountType]=useState<AccountType>('CHECKING');
  const [editingCard,setEditingCard]=useState<string|null>(null);
  const [cardName,setCardName]=useState('');
  const [debit,setDebit]=useState(true);
  const [credit,setCredit]=useState(true);
  const [linkedAccount,setLinkedAccount]=useState('');
  const [closing,setClosing]=useState('10');
  const [due,setDue]=useState('17');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [showAccount,setShowAccount]=useState(false);
  const [showCard,setShowCard]=useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const refresh=useCallback(async()=>{
    const [a,c] = await Promise.all([transferService.listAccountsWithBalance(),service.listCards(true)]);
    setAccounts(a);
    setCards(c.filter(card => !card.deleted_at));
    setRemovedCards(c.filter(card => !!card.deleted_at));
    setLinkedAccount(old=>a.some(x=>x.id===old)?old:(a[0]?.id??''));
  },[service,transferService]);
  useFocusEffect(useCallback(()=>{void refresh().catch(e=>setError(errText(e)));},[refresh]));
  async function run(action:()=>Promise<void>,message:string) {
    if(busy)return;
    setBusy(true);setError('');setFeedback('');
    try {await action();await refresh();setFeedback(message);}catch(e){setError(errText(e));}
    finally{setBusy(false);scrollRef.current?.scrollTo({y:0,animated:true});}
  }
  function editAccount(a:AccountWithBalance) {
    setSelectedAccount(a.id);setAccountName(a.name);setAccountType(a.type);setShowAccount(true);
  }
  function editCard(c:PaymentCard) {
    setEditingCard(c.id);setCardName(c.name);setDebit(!!c.allows_debit);setCredit(!!c.allows_credit);
    setLinkedAccount(c.linked_account_id??accounts[0]?.id??'');
    setClosing(String(c.closing_day??10));setDue(String(c.due_day??17));setShowCard(true);
  }
  const inputStyle={backgroundColor:colors.surfaceAlt,borderColor:colors.border,color:colors.text};
  return <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" style={{backgroundColor:colors.background}} contentContainerStyle={[styles.page,{paddingBottom:keyboardBottom}]}>
    <Text style={[styles.title,{color:colors.text}]}>Contas e cartões</Text>
    <Text style={[styles.subtitle,{color:colors.muted}]}>Gerencie onde seu dinheiro fica e como você paga suas compras.</Text>
    {!!error && <FinanceNotice kind="error" message={error} onDismiss={() => setError('')} />}
    {!!feedback && <FinanceNotice kind="success" message={feedback} onDismiss={() => setFeedback('')} />}
    <View style={styles.accountsSection}>
      <SectionHeader title="Suas contas" caption="Saldo calculado pelos registros, sem sincronização bancária" />
    <FinancePanel>
      {accounts.map(a=><Pressable key={a.id} onPress={()=>editAccount(a)} style={[styles.entry,{borderBottomColor:colors.border}]}>
        <FinanceIcon name="card" size={20}/>
        <View style={{flex:1}}><Text style={[styles.name,{color:colors.text}]}>{a.name}</Text>
          <Text style={{color:colors.muted,fontSize:12}}>{types.find(t=>t.key===a.type)?.label??'Conta'} · Saldo registrado: {formatMoney(a.balance_cents)}</Text></View>
        <Text style={{color:colors.primary,fontWeight:'700'}}>Editar</Text>
      </Pressable>)}
      <Pressable style={styles.link} onPress={()=>{setSelectedAccount(null);setAccountName('');setAccountType('CHECKING');setShowAccount(!showAccount);}}>
        <FinanceIcon name="plus" color={colors.primary}/><Text style={{color:colors.primary,fontWeight:'800'}}>Adicionar conta</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => router.push('/transfers')} accessibilityRole="button">
        <FinanceIcon name="repeat" color={colors.primary}/>
        <Text style={{color:colors.primary,fontWeight:'800'}}>Transferir entre contas</Text>
      </Pressable>
      {showAccount && <View style={styles.form}>
        <Text style={[styles.label,{color:colors.text}]}>Nome da conta</Text>
        <TextInput value={accountName} onChangeText={setAccountName} placeholder="Ex.: Banco principal" placeholderTextColor={colors.muted} style={[styles.input,inputStyle]}/>
        <Text style={[styles.label,{color:colors.text}]}>Tipo</Text>
        <View style={styles.chips}>{types.map(t=><Pressable key={t.key} onPress={()=>setAccountType(t.key)}
          style={[styles.chip,{backgroundColor:t.key===accountType?colors.primary:colors.surfaceAlt}]}>
          <Text style={{color:t.key===accountType?colors.onPrimary:colors.text}}>{t.label}</Text></Pressable>)}</View>
        <Pressable disabled={busy} style={[styles.action,{backgroundColor:colors.primary}]}
          onPress={()=>void run(async()=>{await service.saveAccount({id:selectedAccount??undefined,name:accountName,type:accountType});setShowAccount(false);},'Conta salva.')}>
          <Text style={{color:colors.onPrimary,fontWeight:'800'}}>Salvar conta</Text>
        </Pressable>
      </View>}
    </FinancePanel>
    </View>
    <View style={styles.cardsSection}>
      <SectionHeader title="Seus cartões" caption="Débito, crédito e faturas vinculadas às contas" />
    <FinancePanel>
      {cards.map(c=><View key={c.id} style={[styles.entry,{borderBottomColor:colors.border}]}>
        <FinanceIcon name="card" size={21}/>
        <View style={{flex:1,gap:3}}><Text style={[styles.name,{color:colors.text}]}>{c.name}{c.archived_at?' · Arquivado':''}</Text>
          <Text style={{color:colors.muted,fontSize:12}}>{[c.allows_debit?'Débito':null,c.allows_credit?'Crédito':null].filter(Boolean).join(' e ')}
            {c.allows_credit?` · Fecha ${c.closing_day}, vence ${c.due_day}`:''}</Text></View>
        <Pressable onPress={()=>editCard(c)} style={styles.smallAction}><Text style={{color:colors.primary,fontWeight:'800'}}>Editar</Text></Pressable>
        {!!c.allows_credit && <Pressable onPress={()=>router.push({pathname:'/cards',params:{cardId:c.id}})} style={styles.smallAction}>
          <Text style={{color:colors.primary,fontWeight:'800'}}>Faturas</Text></Pressable>}
      </View>)}
      {!cards.length && <Text style={{color:colors.muted}}>Nenhum cartão cadastrado.</Text>}
      <Pressable style={styles.link} onPress={()=>{setEditingCard(null);setCardName('');setDebit(true);setCredit(true);setClosing('10');setDue('17');setShowCard(!showCard);}}>
        <FinanceIcon name="plus" color={colors.primary}/><Text style={{color:colors.primary,fontWeight:'800'}}>Adicionar cartão</Text>
      </Pressable>
      {showCard && <View style={styles.form}>
        <Text style={[styles.label,{color:colors.text}]}>Nome do cartão</Text>
        <TextInput value={cardName} onChangeText={setCardName} placeholder="Ex.: Cartão principal" placeholderTextColor={colors.muted} style={[styles.input,inputStyle]}/>
        <Text style={[styles.label,{color:colors.text}]}>Modalidades habilitadas</Text>
        <View style={styles.chips}>
          {[{v:debit,set:setDebit,name:'Débito'},{v:credit,set:setCredit,name:'Crédito'}].map(t=><Pressable key={t.name} onPress={()=>t.set(!t.v)}
            style={[styles.chip,{backgroundColor:t.v?colors.primary:colors.surfaceAlt}]}>
            <Text style={{color:t.v?colors.onPrimary:colors.text}}>{t.v?'✓ ':''}{t.name}</Text></Pressable>)}
        </View>
        {debit && <><Text style={[styles.label,{color:colors.text}]}>Conta vinculada ao débito</Text>
          <View style={styles.chips}>{accounts.map(a=><Pressable key={a.id} onPress={()=>setLinkedAccount(a.id)}
            style={[styles.chip,{backgroundColor:linkedAccount===a.id?colors.primary:colors.surfaceAlt}]}>
            <Text style={{color:linkedAccount===a.id?colors.onPrimary:colors.text}}>{a.name}</Text></Pressable>)}</View></>}
        {credit && <View style={styles.inline}>
          <View style={{flex:1}}><Text style={[styles.label,{color:colors.text}]}>Fechamento</Text>
            <TextInput keyboardType="number-pad" value={closing} onChangeText={setClosing} style={[styles.input,inputStyle]}/></View>
          <View style={{flex:1}}><Text style={[styles.label,{color:colors.text}]}>Vencimento</Text>
            <TextInput keyboardType="number-pad" value={due} onChangeText={setDue} style={[styles.input,inputStyle]}/></View>
        </View>}
        <Pressable disabled={busy} style={[styles.action,{backgroundColor:colors.primary}]}
          onPress={()=>void run(async()=>{await service.saveCard({name:cardName,debit,credit,linkedAccountId:linkedAccount||null,
            closingDay:Number(closing),dueDay:Number(due)},editingCard??undefined);setShowCard(false);},'Cartão salvo.')}>
          <Text style={{color:colors.onPrimary,fontWeight:'800'}}>Salvar cartão</Text>
        </Pressable>
        {!!editingCard && <Pressable disabled={busy} style={styles.link} onPress={()=>{
          const old=cards.find(c=>c.id===editingCard);
          if (!old)return;
          Alert.alert(old.archived_at?'Reativar cartão?':'Arquivar cartão?',
            'As compras, movimentações e faturas existentes serão preservadas.',[
              {text:'Cancelar',style:'cancel'},
              {text:'Confirmar',onPress:()=>void run(async()=>{await service.setArchived(old.id,!old.archived_at);setShowCard(false);},'Cartão atualizado.')},
            ]);
        }}><Text style={{color:colors.muted,fontWeight:'700'}}>{cards.find(c=>c.id===editingCard)?.archived_at?'Reativar':'Arquivar'} cartão</Text></Pressable>}
        {!!editingCard && <Pressable
          accessibilityRole="button"
          accessibilityLabel="Excluir cartão"
          disabled={busy}
          style={styles.link}
          onPress={() => {
            const old = cards.find(c => c.id === editingCard);
            if (!old) return;
            Alert.alert(
              'Excluir cartão da lista?',
              'O cartão deixará de aparecer nas opções de pagamento. Compras, faturas pendentes e pagamentos anteriores serão preservados. Você poderá restaurá-lo depois.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Excluir cartão', style: 'destructive', onPress: () => void run(
                  async () => { await service.setRemoved(old.id, true); setEditingCard(null); setShowCard(false); },
                  'Cartão removido da lista. O histórico foi preservado.'
                ) },
              ]
            );
          }}
        >
          <FinanceIcon name="expenses" color={colors.expense} size={18}/>
          <Text style={{color:colors.expense,fontWeight:'800'}}>Excluir cartão</Text>
        </Pressable>}
      </View>}
      {!!removedCards.length && <>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowRemoved(value => !value)}
          style={styles.link}
        >
          <Text style={{color:colors.muted,fontWeight:'700'}}>
            {showRemoved ? 'Ocultar cartões removidos' : `Ver cartões removidos (${removedCards.length})`}
          </Text>
        </Pressable>
        {showRemoved && removedCards.map(card => <View key={card.id} style={[styles.entry,{borderBottomColor:colors.border}]}>
          <FinanceIcon name="card" color={colors.muted} size={20}/>
          <View style={{flex:1}}>
            <Text style={[styles.name,{color:colors.text}]}>{card.name}</Text>
            <Text style={{color:colors.muted,fontSize:12}}>Removido · histórico preservado</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => Alert.alert('Restaurar cartão?',
              'O cartão voltará para a lista e poderá ser usado novamente se não estiver arquivado.', [
                {text:'Cancelar',style:'cancel'},
                {text:'Restaurar',onPress:()=>void run(()=>service.setRemoved(card.id,false),'Cartão restaurado.')},
              ])}
            style={styles.smallAction}
          ><Text style={{color:colors.primary,fontWeight:'800'}}>Restaurar</Text></Pressable>
          {!!card.allows_credit && <Pressable
            accessibilityRole="button"
            onPress={() => router.push({pathname:'/cards',params:{cardId:card.id}})}
            style={styles.smallAction}
          ><Text style={{color:colors.primary,fontWeight:'800'}}>Faturas</Text></Pressable>}
        </View>)}
      </>}
    </FinancePanel>
    </View>
  </ScrollView>;
}
const styles=StyleSheet.create({
  page:{paddingHorizontal:18,paddingTop:16,paddingBottom:85},title:{fontSize:28,fontWeight:'900'},
  subtitle:{fontSize:13,lineHeight:20,marginTop:7,marginBottom:24},
  entry:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:15,borderBottomWidth:.5},
  name:{fontSize:14,fontWeight:'800'},smallAction:{padding:6},
  link:{flexDirection:'row',gap:7,alignItems:'center',paddingVertical:15,justifyContent:'center'},
  form:{gap:10,paddingTop:12},label:{fontSize:13,fontWeight:'700',marginTop:4},
  input:{borderWidth:1,borderRadius:12,paddingHorizontal:13,minHeight:46,fontSize:15},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingVertical:10,paddingHorizontal:14,borderRadius:50},
  accountsSection:{marginBottom:30},
  cardsSection:{marginTop:4},
  inline:{flexDirection:'row',gap:10},action:{minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:14,marginTop:8},
});
