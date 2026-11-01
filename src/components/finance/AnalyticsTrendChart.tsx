import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { AnalyticsMonth } from '@/database/repositories/analyticsRepository';

export function AnalyticsTrendChart({ rows }: { rows: AnalyticsMonth[] }) {
  const { colors } = useAppTheme();
  const max = Math.max(1, ...rows.flatMap(row => [row.incomeCents, row.expenseCents]));

  return (
    <View>
      <View style={styles.legend}>
        <View style={styles.legendPart}>
          <View style={[styles.dot, { backgroundColor: colors.income }]} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Receitas</Text>
        </View>
        <View style={styles.legendPart}>
          <View style={[styles.dot, { backgroundColor: colors.expense }]} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Despesas</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Evolução mensal de receitas e despesas">
        <View style={[styles.chart, { minWidth: Math.max(280, rows.length * 40) }]}>
          {rows.map(row => {
            const [year, month] = row.month.split('-').map(Number);
            const label = new Date(year, month - 1, 1)
              .toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
            return (
              <View key={row.month} style={styles.column} accessibilityLabel={
                `${label} ${year}: ${row.incomeCents / 100} reais de receitas, ${row.expenseCents / 100} reais de despesas`
              }>
                <View style={styles.barGroup}>
                  <View style={[styles.bar, {
                    height: `${(row.incomeCents / max) * 100}%`, backgroundColor: colors.income,
                  }]} />
                  <View style={[styles.bar, {
                    height: `${(row.expenseCents / max) * 100}%`, backgroundColor: colors.expense,
                  }]} />
                </View>
                <Text style={[styles.caption, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, marginBottom: 18 },
  legendPart: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chart: { height: 178, flexDirection: 'row', paddingHorizontal: 2, gap: 5 },
  column: { flex: 1, minWidth: 30, gap: 10, alignItems: 'center' },
  barGroup: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  bar: { width: 10, maxWidth: '38%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  caption: { fontSize: 10, textTransform: 'capitalize' },
});
