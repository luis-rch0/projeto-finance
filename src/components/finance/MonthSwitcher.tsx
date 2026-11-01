import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { formatMonth, stepMonth } from '@/utils/date';

export interface SelectedMonth { year: number; month: number }
export function MonthSwitcher({ value, onChange }: {
  value: SelectedMonth; onChange: (month: SelectedMonth) => void;
}) {
  const { colors } = useAppTheme();
  return <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={8}
      onPress={() => onChange(stepMonth(value.year, value.month, -1))}
      style={[styles.arrowBox, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={[styles.arrow, { color: colors.text }]}>‹</Text>
    </Pressable>
    <View style={styles.caption}>
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>PERÍODO</Text>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{formatMonth(value.year, value.month)}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" hitSlop={8}
      onPress={() => onChange(stepMonth(value.year, value.month, 1))}
      style={[styles.arrowBox, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={[styles.arrow, { color: colors.text }]}>›</Text>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1,
    borderRadius: 20, padding: 7, marginBottom: 18 },
  caption: { flex: 1, alignItems: 'center', gap: 2 },
  title: { textTransform: 'capitalize', fontSize: 14, fontWeight: '800' },
  arrowBox: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  arrow: { fontSize: 29, fontWeight: '400', includeFontPadding: false },
});
