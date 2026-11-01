import { StyleSheet, Text, View } from 'react-native';
import type { CategoryStat } from '@/features/categories/categoryStats';
import { categorySymbol } from '@/features/categories/categoryStats';
import { formatMoney } from '@/utils/currency';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { MovementType } from '@/types/finance';
export function CategorySummary({ items, type }: { items: CategoryStat[]; type: MovementType }) {
  const { colors } = useAppTheme();
  if (!items.length) return null;
  return <View style={{marginTop:18,gap:10}}>
    <Text style={[styles.title,{color:colors.text}]}>Por categoria</Text>
    <Text style={{color:colors.muted,fontSize:12}}>Totais do mês selecionado</Text>
    {items.map(c=><View key={c.id} style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.row}>
        <Text style={styles.icon}>{categorySymbol({name:c.name,type,icon:c.icon})}</Text>
        <View style={{flex:1}}>
          <Text style={{color:colors.text,fontWeight:'700'}}>{c.name}</Text>
          <Text style={{color:colors.muted,fontSize:12}}>{c.count} {c.count===1?'lançamento':'lançamentos'} · {c.percent.toFixed(1).replace('.',',')}%</Text>
        </View>
        <Text style={{color:colors.text,fontWeight:'700'}}>{formatMoney(c.cents)}</Text>
      </View>
      <View style={[styles.track,{backgroundColor:colors.border}]}><View style={{height:6,width:`${Math.min(100,Math.max(0,c.percent))}%`,borderRadius:99,backgroundColor:c.color}}/></View>
    </View>)}
  </View>;
}
const styles=StyleSheet.create({title:{fontSize:19,fontWeight:'800'},card:{borderWidth:1,borderRadius:13,padding:13,gap:12},row:{flexDirection:'row',alignItems:'center',gap:12},icon:{fontSize:21},track:{height:6,borderRadius:99,overflow:'hidden'}});
