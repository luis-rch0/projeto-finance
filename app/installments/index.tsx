import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActionButton } from '@/components/ui/ActionButton';
import { FinanceDateField } from '@/components/ui/FinanceDateField';
import { useAppTheme } from '@/hooks/useAppTheme';
import { InstallmentService } from '@/services/installmentService';
import { syncReminderNotifications } from '@/services/reminderService';
import { AccountRepository } from '@/database/repositories/accountRepository';
import { CategoryRepository } from '@/database/repositories/categoryRepository';
import type { Account, Category, InstallmentPlan } from '@/types/finance';
import { formatMoney, parseMoney } from '@/utils/currency';
import { displayDate, todayISO } from '@/utils/date';

export default function InstallmentsScreen() {
  const db=useSQLiteContext();const service=useMemo(()=>new InstallmentService(db),[db]);
  const {colors}=useAppTheme();
  const keyboardBottom = useKeyboardBottomSpacing(60);
  const [plans,setPlans]=useState<InstallmentPlan[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);const [categories,setCategories]=useState<Category[]>([]);
  const [description,setDescription]=useState('');const [money,setMoney]=useState('');
  const [count,setCount]=useState('3');const [date,setDate]=useState(todayISO());
  const [accountId,setAccountId]=useState('');const [categoryId,setCategoryId]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [editingPlanId,setEditingPlanId]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    const [a,c,p]=await Promise.all([new AccountRepository(db).findAll(),new CategoryRepository(db).findByType('EXPENSE'),service.plans.findActive()]);
    setAccounts(a);setCategories(c);setPlans(p);setAccountId(old=>old||a[0]?.id||'');
  },[db,service]);
  useFocusEffect(useCallback(()=>{refresh().catch(e=>setError(String(e)));},[refresh]));
  function beginEdit(plan: InstallmentPlan) {
    setEditingPlanId(plan.id);
    setDescription(plan.description);
    setMoney((plan.total_cents / 100).toFixed(2).replace('.', ','));
    setCount(String(plan.installments_count));
    setDate(plan.first_due_date);
    setAccountId(plan.account_id);
    setCategoryId(plan.category_id);
    setError('');
  }
  function clearForm() {
    setEditingPlanId(null);
    setDescription(''); setMoney(''); setCount('3'); setDate(todayISO());
    setCategoryId('');
  }
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const input = { description, total_cents: parseMoney(money), installments_count: Number(count),
        first_due_date: date.trim(), account_id: accountId, category_id: categoryId };
      if (editingPlanId) {
        await service.updatePlan(editingPlanId, input);
      } else {
        await service.create(input);
      }
      const wasEditing = editingPlanId !== null;
      clearForm();
      await refresh();
      void syncReminderNotifications(db).catch(e => console.warn('Lembretes não atualizados', e));
      Alert.alert(wasEditing ? 'Parcelamento atualizado' : 'Parcelamento cadastrado',
        'Os vencimentos pendentes foram atualizados. Parcelas já confirmadas não são modificadas.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function archive(plan:InstallmentPlan) {
    Alert.alert('Arquivar parcelamento?', 'Isso oculta as parcelas futuras previstas; despesas já confirmadas continuam no histórico.', [
      {text:'Cancelar',style:'cancel'},
      {text:'Arquivar',style:'destructive',onPress:()=>{void (async()=>{try{await service.archive(plan.id);await refresh();
        void syncReminderNotifications(db).catch(e=>console.warn('Lembretes não atualizados',e));}catch(e){setError(String(e));}})();}},
    ]);
  }
  const inputStyle={color:colors.text,borderColor:colors.border,backgroundColor:colors.surface};
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={[styles.page,{paddingBottom:keyboardBottom}]} keyboardShouldPersistTaps="handled">
    <Text style={[styles.title,{color:colors.text}]}>Compras parceladas</Text>
    <Text style={{color:colors.muted,marginBottom:12}}>As parcelas só entram no total gasto depois da confirmação.</Text>
    <View style={[styles.card,{borderColor:colors.border,backgroundColor:colors.surface}]}>
      <Text style={[styles.heading,{color:colors.text}]}>{editingPlanId ? 'Editar parcelamento' : 'Novo parcelamento'}</Text>
      {editingPlanId && <Text style={{color:colors.muted,fontSize:12}}>
        Mudanças de valor total, quantidade e primeira data só são permitidas antes de confirmar qualquer parcela.
      </Text>}
      <TextInput placeholder="Descrição da compra" placeholderTextColor={colors.muted} value={description} onChangeText={setDescription} style={[styles.input,inputStyle]}/>
      <Text style={{color:colors.text,fontWeight:'700'}}>Valor total (R$)</Text>
      <TextInput keyboardType="decimal-pad" placeholder="Ex.: 899,90" placeholderTextColor={colors.muted} value={money} onChangeText={setMoney} style={[styles.input,inputStyle]}/>
      <Text style={{color:colors.text,fontWeight:'700'}}>Quantidade de parcelas (2 a 60)</Text>
      <TextInput keyboardType="number-pad" value={count} onChangeText={setCount} style={[styles.input,inputStyle]}/>
      <Text style={{color:colors.text,fontWeight:'700'}}>Primeiro vencimento (DD/MM/AAAA)</Text>
      <FinanceDateField value={date} onChange={setDate} style={[styles.input,inputStyle]}/>
      <Text style={{color:colors.text,fontWeight:'700'}}>Categoria</Text>
      <View style={styles.chips}>{categories.map(c=><Pressable key={c.id} onPress={()=>setCategoryId(c.id)} style={[styles.chip,{backgroundColor:categoryId===c.id?colors.primary:colors.background,borderColor:colors.border}]}>
        <Text style={{color:categoryId===c.id?colors.onPrimary:colors.text}}>{c.name}</Text></Pressable>)}</View>
      <Text style={{color:colors.text,fontWeight:'700'}}>Conta</Text>
      <View style={styles.chips}>{accounts.map(a=><Pressable key={a.id} onPress={()=>setAccountId(a.id)} style={[styles.chip,{backgroundColor:accountId===a.id?colors.primary:colors.background,borderColor:colors.border}]}>
        <Text style={{color:accountId===a.id?colors.onPrimary:colors.text}}>{a.name}</Text></Pressable>)}</View>
      {!!error && <Text style={{color:colors.expense}}>{error}</Text>}
      <ActionButton title={busy ? 'Salvando...' : editingPlanId ? 'Salvar alterações' : 'Criar parcelas'} onPress={save} disabled={busy}/>
      {editingPlanId && <Pressable onPress={clearForm} disabled={busy} style={{paddingVertical:9,alignItems:'center'}}>
        <Text style={{color:colors.muted,fontWeight:'700'}}>Cancelar edição</Text>
      </Pressable>}
    </View>
    <ActionButton title="Ver vencimentos do mês" onPress={()=>router.push('/due')} style={{marginBottom:18}}/>
    <Text style={[styles.heading,{color:colors.text}]}>Parcelamentos ativos</Text>
    {!plans.length && <Text style={{color:colors.muted}}>Nenhum parcelamento cadastrado.</Text>}
    {plans.map(p=><View key={p.id} style={[styles.item,{borderColor:colors.border,backgroundColor:colors.surface}]}>
      <View style={{flex:1,gap:4}}><Text style={{color:colors.text,fontWeight:'700'}}>{p.description}</Text>
        <Text style={{color:colors.muted,fontSize:12}}>{formatMoney(p.total_cents)} · {p.installments_count} parcelas · desde {displayDate(p.first_due_date)}</Text></View>
      <View style={{gap:12,alignItems:'flex-end'}}>
        <Pressable disabled={busy} onPress={()=>beginEdit(p)}><Text style={{color:colors.primary,fontWeight:'800'}}>Editar</Text></Pressable>
        <Pressable disabled={busy} onPress={()=>archive(p)}><Text style={{color:colors.expense,fontWeight:'700'}}>Arquivar</Text></Pressable>
      </View>
    </View>)}
  </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:18,paddingBottom:60},title:{fontSize:26,fontWeight:'800',marginBottom:8},heading:{fontSize:19,fontWeight:'800',marginBottom:12},card:{padding:15,borderWidth:1,borderRadius:16,marginBottom:14,gap:11},input:{padding:12,borderWidth:1,borderRadius:12,fontSize:15},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{borderWidth:1,borderRadius:99,paddingVertical:9,paddingHorizontal:12},item:{padding:14,borderWidth:1,borderRadius:14,flexDirection:'row',alignItems:'center',gap:12,marginBottom:8}});
