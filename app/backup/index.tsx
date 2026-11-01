import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { ActionButton } from '@/components/ui/ActionButton';
import { useAppTheme } from '@/hooks/useAppTheme';
import { describeBackup, hasRecoveryBackup, restoreBackup, restoreRecoveryBackup, saveBackupToFolder, selectBackupFile, shareBackup } from '@/services/backupService';

export default function BackupScreen(){
  const db=useSQLiteContext();const {colors}=useAppTheme();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [recovery,setRecovery]=useState(false);
  const refresh=useCallback(()=>hasRecoveryBackup().then(setRecovery).catch(()=>setRecovery(false)),[]);
  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
  async function backup(){if(busy)return;setBusy(true);setError('');try{
    const name=await shareBackup(db);
    Alert.alert('Backup gerado',`Arquivo ${name} preparado. Verifique se foi salvo fora do aplicativo. Backup não é criptografado.`);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function saveFolder(){if(busy)return;setBusy(true);setError('');try{
    const name=await saveBackupToFolder(db);
    if(name)Alert.alert('Backup salvo',`Arquivo ${name} salvo na pasta escolhida. Guarde-o com privacidade.`);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function importFile() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const raw = await selectBackupFile();
      if (raw === null) { setBusy(false); return; }
      const summary = describeBackup(raw); // valida o arquivo inteiro e todos os vínculos
      const stamp = new Date(summary.date).toLocaleString('pt-BR');
      const content = [
        `Data do backup: ${stamp}`,
        `Contas: ${summary.accounts} • Transferências: ${summary.transfers}`,
        `Categorias: ${summary.categories}`,
        `Despesas: ${summary.expenses} • Receitas: ${summary.incomes}`,
        `Metas: ${summary.savingsGoals} • Aportes: ${summary.contributions}`,
        `Limites: ${summary.monthlyBudgets} • Recorrências: ${summary.recurrences}`,
        `Compras parceladas: ${summary.installmentPlans} • Parcelas: ${summary.installments}`,
        '',
        'ATENÇÃO: a restauração SUBSTITUI todos os registros atuais.',
        'Uma cópia de recuperação será salva dentro do aplicativo antes da substituição.',
      ].join('\n');
      Alert.alert('Conferir backup antes de restaurar', content, [
        { text: 'Cancelar', style: 'cancel', onPress: () => setBusy(false) },
        {
          text: 'Substituir registros',
          style: 'destructive',
          onPress: () => {
            void restoreBackup(db, raw)
              .then(async () => {
                await refresh();
                Alert.alert('Backup restaurado', 'Confira as movimentações, metas e limites. Os totais serão atualizados ao navegar.');
              })
              .catch(e => setError(e instanceof Error ? e.message : String(e)))
              .finally(() => setBusy(false));
          },
        },
      ], { cancelable: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  function recover(){Alert.alert('Restaurar cópia interna?',
    'Substitui os registros atuais pelos dados anteriores à última restauração. Esta ação não pode ser desfeita.',[
      {text:'Cancelar',style:'cancel'},
      {text:'Recuperar',style:'destructive',onPress:()=>{setBusy(true);restoreRecoveryBackup(db)
        .then(()=>Alert.alert('Recuperado','O banco anterior foi restaurado.'))
        .catch(e=>setError(String(e))).finally(()=>setBusy(false));}},
    ]);}
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={styles.page}>
    <Text style={[styles.title,{color:colors.text}]}>Backup e restauração</Text>
    <Text style={{color:colors.muted,marginBottom:18}}>Todos os dados são locais. Gere um arquivo antes de atualizar ou trocar de telefone.</Text>
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={[styles.subtitle,{color:colors.text}]}>Exportar dados</Text>
      <Text style={{color:colors.muted}}>Cria um arquivo JSON com contas, transferências, categorias, registros, metas e recorrências. Salve-o fora do Finance.</Text>
      <ActionButton title={busy?'Aguarde...':'Salvar backup em uma pasta'} onPress={saveFolder} disabled={busy}/>
      <ActionButton title={busy?'Aguarde...':'Compartilhar backup'} onPress={backup} disabled={busy}/>
    </View>
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={[styles.subtitle,{color:colors.text}]}>Restaurar um arquivo</Text>
      <Text style={{color:colors.muted}}>A restauração substitui todos os dados. Antes, validamos o arquivo e criamos uma cópia interna do banco atual.</Text>
      <ActionButton title={busy?'Aguarde...':'Selecionar arquivo para restaurar'} onPress={importFile} disabled={busy}/>
      {recovery && <ActionButton title="Recuperar dados anteriores à última restauração" onPress={recover} disabled={busy}/>}
    </View>
    {!!error && <Text style={{color:colors.expense,marginVertical:15}}>{error}</Text>}
    <Text style={{color:colors.muted,fontSize:12,marginTop:12}}>Atenção: arquivos JSON não são criptografados. Guarde-os em um local privado. A cópia interna também será apagada se o app for desinstalado ou seus dados forem limpos.</Text>
  </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:18,paddingBottom:55},title:{fontSize:26,fontWeight:'800',marginBottom:8},subtitle:{fontSize:18,fontWeight:'700'},card:{padding:16,borderRadius:16,borderWidth:1,gap:14,marginBottom:14}});
