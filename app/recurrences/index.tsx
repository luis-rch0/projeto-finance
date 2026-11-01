import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActionButton } from '@/components/ui/ActionButton';
import { FinanceDateField } from '@/components/ui/FinanceDateField';
import { MonthSwitcher, type SelectedMonth } from '@/components/finance/MonthSwitcher';
import { useAppTheme } from '@/hooks/useAppTheme';
import { RecurrenceService } from '@/services/recurrenceService';
import { syncReminderNotifications } from '@/services/reminderService';
import { CategoryRepository } from '@/database/repositories/categoryRepository';
import { AccountRepository } from '@/database/repositories/accountRepository';
import type { Account, Category, MovementType, OccurrenceDetail, RecurrenceFrequency, RecurrenceRule } from '@/types/finance';
import { parseMoney, formatMoney } from '@/utils/currency';
import { todayISO, displayDate } from '@/utils/date';

const firstMonth=():SelectedMonth=>{const d=new Date();return{year:d.getFullYear(),month:d.getMonth()+1};};
export default function RecurrencesScreen(){
  const params=useLocalSearchParams<{type?:string}>();
  const initialType:MovementType=params.type==='INCOME'?'INCOME':'EXPENSE';
  const db=useSQLiteContext();const service=useMemo(()=>new RecurrenceService(db),[db]);
  const {colors}=useAppTheme();
  const keyboardBottom = useKeyboardBottomSpacing(55);
  const [period,setPeriod]=useState<SelectedMonth>(firstMonth);
  const [rules,setRules]=useState<RecurrenceRule[]>([]);const [occurrences,setOccurrences]=useState<OccurrenceDetail[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);const [categories,setCategories]=useState<Category[]>([]);
  const [type,setType]=useState<MovementType>(initialType);const [frequency,setFrequency]=useState<RecurrenceFrequency>('MONTHLY');
  const [accountId,setAccountId]=useState('');const [categoryId,setCategoryId]=useState('');
  const [money,setMoney]=useState('');const [description,setDescription]=useState('');
  const [startDate,setStartDate]=useState(todayISO());const [endDate,setEndDate]=useState('');
  const [formOpen,setFormOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    const [a,c,r,o]=await Promise.all([new AccountRepository(db).findAll(),new CategoryRepository(db).findAll(),
      service.rules.findActive(),service.listMonth(period.year,period.month)]);
    setAccounts(a);setCategories(c);setRules(r);setOccurrences(o);
    setAccountId(previous=>previous||a[0]?.id||'');
  },[db,service,period.year,period.month]);
  useFocusEffect(useCallback(()=>{refresh().catch(e=>setError(e instanceof Error?e.message:String(e)));},[refresh]));
  const visibleCategories=categories.filter(c=>c.type===type);
  const visibleOccurrences=occurrences.filter(o=>o.type===type);
  const visibleRules=rules.filter(r=>r.type===type);
  const pending=visibleOccurrences.filter(o=>o.status==='PENDING').length;
  async function create(){if(busy)return;setBusy(true);setError('');try{
    await service.create({type,frequency,account_id:accountId,category_id:categoryId,
      amount_cents:parseMoney(money),description,start_date:startDate,end_date:endDate.trim()||null});
    setMoney('');setDescription('');setCategoryId('');setEndDate('');setFormOpen(false);
    await refresh();
    void syncReminderNotifications(db).catch(e=>console.warn('Lembretes não atualizados',e));
    Alert.alert('Recorrência criada','As ocorrências serão exibidas no mês correspondente, sem alterar o histórico até sua confirmação.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  function askConfirm(o:OccurrenceDetail){Alert.alert('Confirmar movimentação?',
    `Registrar ${o.type==='EXPENSE'?'despesa':'receita'} de ${formatMoney(o.amount_cents)} em ${displayDate(o.occurrence_date)}?`,[
      {text:'Cancelar',style:'cancel'},
      {text:'Confirmar',onPress:()=>{void doAction(()=>service.confirm(o.id));}},
    ]);}
  async function doAction(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await action();await refresh();
      void syncReminderNotifications(db).catch(e=>console.warn('Lembretes não atualizados',e));}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  function archive(r:RecurrenceRule){Alert.alert('Arquivar recorrência?',
    'Ela deixará de criar novas ocorrências. Movimentações confirmadas continuarão no histórico.',[
      {text:'Cancelar',style:'cancel'},
      {text:'Arquivar',style:'destructive',onPress:()=>{void doAction(()=>service.archive(r.id));}},
    ]);}
  function chip<T extends string>(label:string,value:T,current:T,setter:(v:T)=>void){return <Pressable key={value} onPress={()=>setter(value)}
    style={[styles.pill,{backgroundColor:current===value?colors.primary:colors.surface,borderColor:colors.border}]}>
    <Text style={{color:current===value?colors.onPrimary:colors.text}}>{label}</Text></Pressable>;}
  const inputStyle={color:colors.text,borderColor:colors.border,backgroundColor:colors.surface};
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={[styles.page,{paddingBottom:keyboardBottom}]} keyboardShouldPersistTaps="handled">
    <Text style={[styles.title,{color:colors.text}]}>Recorrências</Text>
    <Text style={{color:colors.muted,marginBottom:16}}>Previstos não entram nos totais até a confirmação.</Text>
    <MonthSwitcher value={period} onChange={setPeriod}/>
    <View style={[styles.options,{marginBottom:16}]}>{chip('Despesas','EXPENSE',type,t=>{setType(t);setCategoryId('');})}{chip('Receitas','INCOME',type,t=>{setType(t);setCategoryId('');})}</View>
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={{color:colors.text,fontWeight:'700',fontSize:17}}>Vencimentos do mês</Text>
      <Text style={{color:colors.muted}}>{pending} pendente(s) · {visibleOccurrences.length} ocorrência(s)</Text>
      {!visibleOccurrences.length && <Text style={{color:colors.muted}}>Nenhuma recorrência prevista para o mês.</Text>}
      {visibleOccurrences.map(o=><View key={o.id} style={[styles.item,{borderTopColor:colors.border}]}>
        <View style={{flex:1,gap:3}}>
          <Text style={{color:colors.text,fontWeight:'700'}}>{o.description} · {formatMoney(o.amount_cents)}</Text>
          <Text style={{color:colors.muted}}>{displayDate(o.occurrence_date)} · {o.category_name}</Text>
          <Text style={{color:o.status==='CONFIRMED'?colors.income:o.status==='SKIPPED'?colors.muted:colors.warning}}>
            {o.status==='CONFIRMED'?'Confirmada':o.status==='SKIPPED'?'Ignorada':'Pendente'}</Text>
        </View>
        {o.status==='PENDING'?<View style={{gap:8}}>
          <Pressable disabled={busy} onPress={()=>askConfirm(o)}><Text style={{color:colors.primary,fontWeight:'700'}}>Confirmar</Text></Pressable>
          <Pressable disabled={busy} onPress={()=>{void doAction(()=>service.skip(o.id));}}><Text style={{color:colors.muted}}>Ignorar</Text></Pressable>
        </View>:o.status==='SKIPPED'?<Pressable disabled={busy} onPress={()=>{void doAction(()=>service.reopen(o.id));}}>
          <Text style={{color:colors.primary}}>Reabrir</Text></Pressable>:null}
      </View>)}
    </View>
    <ActionButton title={formOpen?'Fechar cadastro':'+ Criar recorrência'} onPress={()=>setFormOpen(v=>!v)} style={{marginBottom:15}}/>
    {formOpen && <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={{color:colors.text,fontWeight:'800',fontSize:18}}>Nova recorrência</Text>
      <Text style={[styles.label,{color:colors.text}]}>Frequência</Text>
      <View style={styles.options}>{chip('Semanal','WEEKLY',frequency,setFrequency)}{chip('Mensal','MONTHLY',frequency,setFrequency)}{chip('Anual','YEARLY',frequency,setFrequency)}</View>
      <Text style={[styles.label,{color:colors.text}]}>Descrição</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder="Ex.: Internet" placeholderTextColor={colors.muted} style={[styles.input,inputStyle]}/>
      <Text style={[styles.label,{color:colors.text}]}>Valor (R$)</Text>
      <TextInput value={money} onChangeText={setMoney} keyboardType="decimal-pad" placeholder="110,00" placeholderTextColor={colors.muted} style={[styles.input,inputStyle]}/>
      <Text style={[styles.label,{color:colors.text}]}>Categoria</Text>
      <View style={styles.options}>{visibleCategories.map(c=>chip(c.name,c.id,categoryId,setCategoryId))}</View>
      <Text style={[styles.label,{color:colors.text}]}>Conta</Text>
      <View style={styles.options}>{accounts.map(a=>chip(a.name,a.id,accountId,setAccountId))}</View>
      <Text style={[styles.label,{color:colors.text}]}>Data inicial (DD/MM/AAAA)</Text>
      <FinanceDateField value={startDate} onChange={setStartDate} style={[styles.input,inputStyle]}/>
      <Text style={[styles.label,{color:colors.text}]}>Data final (opcional)</Text>
      <FinanceDateField value={endDate} onChange={setEndDate} style={[styles.input,inputStyle]}/>
      <Text style={{color:colors.muted,fontSize:12}}>Dia 31 será ajustado ao último dia de meses menores.</Text>
      <ActionButton title={busy?'Salvando...':'Salvar recorrência'} onPress={create} disabled={busy}/>
    </View>}
    <Text style={[styles.heading,{color:colors.text}]}>Regras ativas</Text>
    {visibleRules.map(r=><View key={r.id} style={[styles.rule,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={{flex:1,gap:4}}>
        <Text style={{color:colors.text,fontWeight:'700'}}>{r.description}</Text>
        <Text style={{color:colors.muted,fontSize:12}}>{formatMoney(r.amount_cents)} · {r.frequency==='MONTHLY'?'Mensal':r.frequency==='WEEKLY'?'Semanal':'Anual'} · início {displayDate(r.start_date)}</Text>
      </View>
      <Pressable onPress={()=>archive(r)} disabled={busy} style={{padding:6}}><Text style={{color:colors.expense}}>Arquivar</Text></Pressable>
    </View>)}
    {!visibleRules.length && <Text style={{color:colors.muted}}>Nenhuma regra cadastrada.</Text>}
    {!!error && <Text style={{color:colors.expense,marginTop:12}}>{error}</Text>}
  </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:18,paddingBottom:55},title:{fontSize:26,fontWeight:'800',marginBottom:8},heading:{fontSize:20,fontWeight:'800',marginBottom:12,marginTop:12},card:{padding:14,borderWidth:1,borderRadius:16,marginBottom:16,gap:10},label:{fontWeight:'700',marginTop:8},input:{padding:12,borderWidth:1,borderRadius:12,fontSize:15},pill:{borderRadius:99,borderWidth:1,paddingHorizontal:12,paddingVertical:10},options:{flexDirection:'row',gap:8,flexWrap:'wrap'},item:{flexDirection:'row',gap:12,borderTopWidth:1,paddingTop:12,paddingBottom:4},rule:{flexDirection:'row',alignItems:'center',borderRadius:14,borderWidth:1,padding:14,marginBottom:8}});
