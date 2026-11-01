import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

type NoticeProps = {
  kind: 'error' | 'success';
  message: string;
  onDismiss?: () => void;
};

/** Mensagens curtas, legíveis e com ação de dispensar, para telas financeiras. */
export function FinanceNotice({ kind, message, onDismiss }: NoticeProps) {
  const { colors } = useAppTheme();
  const accent = kind === 'error' ? colors.expense : colors.income;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: accent }]}
    >
      <View style={[styles.symbol, { backgroundColor: colors.surfaceAlt }]}>
        <Text allowFontScaling={false} style={[styles.symbolText, { color: accent }]}>
          {kind === 'error' ? '!' : '✓'}
        </Text>
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          {kind === 'error' ? 'Não foi possível concluir' : 'Tudo certo!'}
        </Text>
        <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
      </View>
      {onDismiss && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar aviso"
          onPress={onDismiss}
          hitSlop={9}
          style={styles.close}
        >
          <Text style={[styles.closeText, { color: colors.muted }]}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 12,
    marginVertical: 5,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  symbol: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  symbolText: { fontSize: 17, fontWeight: '900' },
  content: { flex: 1, gap: 4, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '800' },
  message: { fontSize: 13, lineHeight: 19 },
  close: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 23, lineHeight: 26 },
});
