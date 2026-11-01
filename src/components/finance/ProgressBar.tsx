import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
export function ProgressBar({ current, target, exceeded = false }: {
  current: number; target: number; exceeded?: boolean;
}) {
  const { colors } = useAppTheme();
  const percent = target > 0 ? Math.min(100, Math.max(0, current / target * 100)) : 0;
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
    style={[styles.track, { backgroundColor: colors.track }]}>
    <View style={[styles.fill, { width: `${percent}%`, backgroundColor: exceeded && current > target ? colors.expense : colors.primary }]} />
  </View>;
}
const styles = StyleSheet.create({ track: { width: '100%', height: 8, borderRadius: 20, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 20 } });
