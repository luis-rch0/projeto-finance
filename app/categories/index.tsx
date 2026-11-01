import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { CategoryService } from '@/services/categoryService';
import { ActionButton } from '@/components/ui/ActionButton';
import type { Category, MovementType } from '@/types/finance';
import { categorySymbol } from '@/features/categories/categoryStats';

export default function CategoriesScreen(){
  const db=useSQLiteContext();const service=new CategoryService(db);const {colors}=useAppTheme();
  const keyboardBottom = useKeyboardBottomSpacing(50);
  const [items,setItems]=useState<Category[]>([]);const [type,setType]=useState<MovementType>('EXPENSE');
  const [editing,setEditing]=useState<Category|null>(null);const [name,setName]=useState('');
  const [color,setColor]=useState('#16845D');const [icon,setIcon]=useState('●');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const refresh=useCallback(async()=>{setItems(await service.categories.findAll(true));},[db]);
  useFocusEffect(useCallback(()=>{refresh().catch(e=>setError(String(e)));},[refresh]));
  function startNew(){setEditing(null);setName('');setColor(type==='EXPENSE'?'#D94B56':'#16845D');setIcon('●');setError('');}
  function edit(c:Category){setType(c.type);setEditing(c);setName(c.name);setColor(c.color);setIcon(categorySymbol(c));setError('');}
  async function save(){setBusy(true);setError('');try{if(editing)await service.edit(editing.id,name,color,icon);
    else await service.create(type,name,color,icon);await refresh();startNew();}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  function archive(c:Category){Alert.alert('Arquivar categoria?',
    `A categoria ${c.name} deixará de aparecer em novos registros, mas o histórico e os limites serão preservados.`,[
    {text:'Cancelar',style:'cancel'},
    {text:'Arquivar',style:'destructive',onPress:async()=>{try{await service.archive(c.id);await refresh();if(editing?.id===c.id)startNew();}catch(e){setError(String(e));}}},
  ]);}
  const active=items.filter(c=>c.type===type && !c.archived_at);
  const archived=items.filter(c=>c.type===type && !!c.archived_at);
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={[styles.page,{paddingBottom:keyboardBottom}]} keyboardShouldPersistTaps="handled">
    <Text style={[styles.heading,{color:colors.text}]}>Categorias</Text>
    <Text style={{color:colors.muted,marginBottom:16}}>Personalize os nomes e os símbolos das categorias. Não usamos números como ícones.</Text>
    <View style={styles.options}>{(['EXPENSE','INCOME'] as MovementType[]).map(t=><Pressable key={t} onPress={()=>{setType(t);setEditing(null);setName('');}}
      style={[styles.pill,{backgroundColor:type===t?colors.primary:colors.surface,borderColor:colors.border}]}>
      <Text style={{color:type===t?colors.onPrimary:colors.text}}>{t==='EXPENSE'?'Despesas':'Receitas'}</Text>
    </Pressable>)}</View>
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={[styles.subheading,{color:colors.text}]}>{editing?'Editar categoria':'Nova categoria'}</Text>
      {editing && <Text style={{color:colors.muted}}>O tipo da categoria não pode ser alterado.</Text>}
      <TextInput placeholder="Nome da categoria" value={name} onChangeText={setName} placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border}]}/>
      <View style={styles.options}>
        <TextInput placeholder="Cor #16845D" value={color} onChangeText={setColor} autoCapitalize="none" placeholderTextColor={colors.muted} style={[styles.input,{flex:2,color:colors.text,borderColor:colors.border}]}/>
        <TextInput placeholder="Ícone (ex.: 🏷️)" value={icon} onChangeText={setIcon} placeholderTextColor={colors.muted} style={[styles.input,{flex:1,color:colors.text,borderColor:colors.border}]}/>
      </View>
      {!!error && <Text style={{color:colors.expense}}>{error}</Text>}
      <ActionButton title={busy?'Salvando...':editing?'Salvar categoria':'Adicionar categoria'} onPress={save} disabled={busy}/>
      {editing && <Pressable onPress={startNew} style={{padding:8,alignItems:'center'}}><Text style={{color:colors.primary}}>Cancelar edição</Text></Pressable>}
    </View>
    <Text style={[styles.subheading,{color:colors.text}]}>Ativas ({active.length})</Text>
    {active.map(c=><View key={c.id} style={[styles.item,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={{color:c.color,fontSize:20}}>{categorySymbol(c)}</Text><Text style={{color:colors.text,flex:1}}>{c.name}</Text>
      <Pressable onPress={()=>edit(c)} style={styles.smallButton}><Text style={{color:colors.primary}}>Editar</Text></Pressable>
      <Pressable onPress={()=>archive(c)} style={styles.smallButton}><Text style={{color:colors.expense}}>Arquivar</Text></Pressable>
    </View>)}
    {!!archived.length && <><Text style={[styles.subheading,{color:colors.muted,marginTop:18}]}>Arquivadas ({archived.length})</Text>
    {archived.map(c=><Text key={c.id} style={{color:colors.muted,paddingVertical:5}}>{categorySymbol(c)} {c.name}</Text>)}</>}
  </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:18,paddingBottom:50},heading:{fontSize:26,fontWeight:'800',marginBottom:8},subheading:{fontSize:18,fontWeight:'700',marginBottom:12},card:{borderWidth:1,borderRadius:16,padding:14,marginVertical:20,gap:12},input:{borderWidth:1,borderRadius:12,padding:12,fontSize:15,minWidth:0},options:{flexDirection:'row',gap:8,flexWrap:'wrap'},pill:{borderWidth:1,borderRadius:99,paddingHorizontal:14,paddingVertical:11},item:{flexDirection:'row',alignItems:'center',borderWidth:1,borderRadius:12,padding:12,marginBottom:8,gap:12},smallButton:{paddingVertical:7,paddingHorizontal:4}});
