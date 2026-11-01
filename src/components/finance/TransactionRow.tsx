import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TransactionDetail } from '@/types/finance';
import { useAppTheme } from '@/hooks/useAppTheme';
import { formatMoney } from '@/utils/currency';
import { displayDate } from '@/utils/date';
import { FinanceIcon } from '@/components/ui/FinanceIcon';

export function TransactionRow({ item, onPress }: { item: TransactionDetail; onPress?: () => void }) {
  const { colors } = useAppTheme();
  const incoming = item.type === 'INCOME';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${item.description}`} onPress={onPress}
    disabled={!onPress} style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? .7 : 1 }]}>
    <View style={[styles.leading, { backgroundColor: incoming ? colors.surfaceAlt : colors.background }]}>
      <FinanceIcon name={incoming ? 'income' : 'expenses'} size={20} color={incoming ? colors.income : colors.expense} />
    </View>
    <View style={styles.label}>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.description}</Text>
      <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{item.category_name} · {displayDate(item.date)}</Text>
    </View>
    <Text style={[styles.amount, { color: incoming ? colors.income : colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
      {incoming ? '+' : '−'} {formatMoney(item.amount_cents)}
    </Text>
    {onPress ? <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text> : null}
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { paddingVertical: 14, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  leading: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, gap: 5 }, name: { fontSize: 14, fontWeight: '700' }, amount: { fontSize: 12, fontWeight: '800', maxWidth: 115 },
});
