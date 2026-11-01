import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/hooks/useAppTheme';
import { MonthSwitcher, type SelectedMonth } from '@/components/finance/MonthSwitcher';
import { ActionButton } from '@/components/ui/ActionButton';
import { exportTransactionsCsv, exportGoalsCsv, exportBudgetsCsv } from '@/services/csvExportService';
import { monthKey } from '@/utils/date';

export default function ExportScreen() {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const now = new Date();
  const [period,setPeriod] = useState<SelectedMonth>({year:now.getFullYear(),month:now.getMonth()+1});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const month = monthKey(period.year,period.month);
  const run = async (task:()=>Promise<number>)=>{
    if (busy) return;
    setBusy(true);setError('');
    try {
      const count = await task();
      Alert.alert('Arquivo preparado',`${count} registros incluídos na exportação. Escolha onde salvar o CSV.`);
    } catch (e) {setError(e instanceof Error?e.message:String(e));}
    finally {setBusy(false);}
  };
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={styles.page}>
    <Text style={[styles.title,{color:colors.text}]}>Exportar planilhas</Text>
    <Text style={{color:colors.muted}}>Arquivos CSV com separador ponto e vírgula, compatíveis com Excel e outras planilhas.</Text>
    <MonthSwitcher value={period} onChange={setPeriod}/>
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={[styles.heading,{color:colors.text}]}>Movimentações</Text>
      <ActionButton disabled={busy} title="Exportar mês selecionado" onPress={()=>run(()=>exportTransactionsCsv(db,month))}/>
      <ActionButton disabled={busy} title="Exportar todos os meses" onPress={()=>run(()=>exportTransactionsCsv(db,null))}/>
    </View>
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={[styles.heading,{color:colors.text}]}>Metas e orçamentos</Text>
      <ActionButton disabled={busy} title="Exportar objetivos" onPress={()=>run(()=>exportGoalsCsv(db))}/>
      <ActionButton disabled={busy} title="Exportar limites do mês" onPress={()=>run(()=>exportBudgetsCsv(db,month))}/>
    </View>
    {!!error && <Text style={{color:colors.expense}}>{error}</Text>}
    <Text style={{color:colors.muted,fontSize:12}}>CSV não é um backup restaurável. Evite compartilhar esses arquivos publicamente, pois contêm dados financeiros.</Text>
  </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:18,paddingBottom:50,gap:15},title:{fontSize:25,fontWeight:'800'},card:{padding:15,borderWidth:1,borderRadius:16,gap:12},heading:{fontSize:18,fontWeight:'700'}});
