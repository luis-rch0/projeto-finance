
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';

export function ReminderShortcut() {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir lembretes de vencimentos"
      accessibilityHint="Abre a tela para configurar e testar as notificações"
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.primary,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.iconBox,
          { backgroundColor: colors.surfaceAlt },
        ]}
      >
        <Ionicons
          name="notifications-outline"
          size={23}
          color={colors.primary}
        />
      </View>

      <View style={styles.content}>
        <Text
          style={[styles.title, { color: colors.text }]}
        >
          Lembretes
        </Text>

        <Text
          numberOfLines={2}
          style={[
            styles.subtitle,
            { color: colors.muted },
          ]}
        >
          Configure avisos de vencimentos e parcelas
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color={colors.primary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 19,
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
    marginTop: 12,
    marginBottom: 18,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
});
