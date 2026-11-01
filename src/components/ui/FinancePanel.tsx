import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FinanceIcon, type IconName } from '@/components/ui/FinanceIcon';

export function FinancePanel({ children, style, elevated = false }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; elevated?: boolean;
}) {
  const { colors, scheme } = useAppTheme();
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border },
    elevated && scheme === 'light' ? styles.shadow : null, style]}>{children}</View>;
}

export function SectionHeader({ title, caption, actionLabel, onAction }: {
  title: string; caption?: string; actionLabel?: string; onAction?: () => void;
}) {
  const { colors } = useAppTheme();
  return <View style={styles.heading}>
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {caption ? <Text style={{ color: colors.muted, fontSize: 12 }}>{caption}</Text> : null}
    </View>
    {actionLabel && onAction ? <Pressable accessibilityRole="button" hitSlop={9} onPress={onAction}>
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>{actionLabel} ›</Text>
    </Pressable> : null}
  </View>;
}

export function Shortcut({ title, subtitle, icon, onPress, style }: {
  title: string; subtitle?: string; icon: IconName; onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [styles.shortcut, { backgroundColor: colors.surface, borderColor: colors.border,
      opacity: pressed ? .75 : 1 }, style]}>
    <FinanceIcon name={icon} size={19} contained />
    <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 10 }}>{title}</Text>
    {subtitle ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{subtitle}</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: 22, borderWidth: 1, padding: 18, overflow: 'hidden' },
  shadow: { elevation: 2, shadowColor: '#183D2A', shadowOpacity: .05, shadowRadius: 14, shadowOffset: { height: 3, width: 0 } },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  title: { fontWeight: '800', fontSize: 18, letterSpacing: -.2 },
  shortcut: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 20, padding: 13, minHeight: 120 },
});
