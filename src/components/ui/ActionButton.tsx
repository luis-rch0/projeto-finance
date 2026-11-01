import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  secondary?: boolean;
}
export function ActionButton({ title, onPress, disabled = false, style, secondary = false }: ActionButtonProps) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, {
      backgroundColor: secondary ? colors.surfaceAlt : colors.primary,
      opacity: disabled ? .45 : pressed ? .8 : 1,
    }, style]}>
    <Text style={[styles.text, { color: secondary ? colors.text : colors.onPrimary }]}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { paddingHorizontal: 20, paddingVertical: 16, minHeight: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, fontWeight: '800', letterSpacing: .15 },
});
