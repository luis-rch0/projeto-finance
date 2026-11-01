import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FinancePanel, SectionHeader } from '@/components/ui/FinancePanel';
import {
  checkNotificationCapability,
  getReminderPreferences,
  prepareReminderPermissions,
  saveReminderPreferences,
  sendReminderTest,
  syncReminderNotifications,
  type NotificationCapability,
} from '@/services/reminderService';
import {
  defaultReminderPreferences,
  type ReminderPreferences,
  type AdvanceDays,
} from '@/utils/reminders';

const days: AdvanceDays[] = [0, 1, 3, 7];
const hours = [8, 9, 12, 18];

export default function NotificationsSettings() {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const [settings, setSettings] = useState<ReminderPreferences>(defaultReminderPreferences);
  const [capability, setCapability] = useState<NotificationCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [saved, native] = await Promise.all([
          getReminderPreferences(), checkNotificationCapability(),
        ]);
        if (!active) return;
        setSettings(saved);
        setCapability(native);
        if (saved.enabled && native.available) {
          try { await syncReminderNotifications(db); }
          catch (error) { console.warn('Finance: lembretes não sincronizados.', error); }
        }
      } catch (error) {
        console.warn('Finance: falha ao carregar preferências de lembrete.', error);
        if (active) setFeedback('Não foi possível carregar suas preferências.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [db]));

  async function update(next: ReminderPreferences) {
    if (loading || working) return;
    setWorking(true);
    setFeedback('');
    try {
      if (next.enabled && !settings.enabled && capability?.available) {
        if (!(await prepareReminderPermissions())) {
          Alert.alert('Permissão necessária',
            'Para receber avisos, permita notificações nas configurações do seu celular.');
          return;
        }
      }
      await saveReminderPreferences(next);
      setSettings(next);
      if (capability?.available) {
        try { await syncReminderNotifications(db); }
        catch (error) {
          console.warn('Finance: não foi possível programar os avisos.', error);
          setFeedback('Preferências salvas. Os avisos não puderam ser programados agora.');
          return;
        }
      }
      setFeedback('Preferências salvas.');
    } catch (error) {
      console.warn('Finance: não foi possível salvar os lembretes.', error);
      setFeedback('Não foi possível salvar. Tente novamente.');
    } finally {
      setWorking(false);
    }
  }

  async function test() {
    if (working || loading) return;
    if (capability && !capability.available) {
      Alert.alert('Avisos indisponíveis',
        'Esta instalação ainda não permite enviar notificações. Suas preferências continuam salvas.');
      return;
    }
    setWorking(true);
    try {
      await sendReminderTest();
      Alert.alert('Tudo certo!', 'Um aviso de teste deverá aparecer em alguns segundos.');
    } catch (error) {
      console.warn('Finance: não foi possível testar o lembrete.', error);
      Alert.alert('Não foi possível enviar o aviso',
        'Confira a permissão de notificações nas configurações do celular e tente novamente.');
    } finally {
      setWorking(false);
    }
  }

  return <ScrollView style={{ backgroundColor: colors.background }}
    contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={[styles.title, { color: colors.text }]}>Lembretes</Text>
    <Text style={[styles.subtitle, { color: colors.muted }]}>
      Receba avisos sobre contas e parcelas, sem depender de internet.
    </Text>

    <FinancePanel style={styles.block}>
      <View style={styles.switchRow}>
        <View style={styles.grow}>
          <Text style={[styles.label, { color: colors.text }]}>Ativar lembretes</Text>
          <Text style={[styles.detail, { color: colors.muted }]}>
            Avisos para seus próximos vencimentos.
          </Text>
        </View>
        <Switch accessibilityLabel="Ativar lembretes" disabled={loading || working}
          value={settings.enabled} onValueChange={enabled => void update({ ...settings, enabled })}
          trackColor={{ false: colors.track, true: colors.primary }} thumbColor={colors.surface} />
      </View>
    </FinancePanel>

    <SectionHeader title="Quando avisar?" caption="Escolha quantos dias antes" />
    <View style={styles.row}>
      {days.map(day => <Pressable key={day} accessibilityRole="button"
        accessibilityState={{ selected: settings.daysBefore === day }}
        disabled={loading || working} onPress={() => void update({ ...settings, daysBefore: day })}
        style={({ pressed }) => [styles.pill, {
          opacity: pressed ? .65 : 1,
          borderColor: settings.daysBefore === day ? colors.primary : colors.border,
          backgroundColor: settings.daysBefore === day ? colors.surfaceAlt : colors.surface,
        }]}>
        <Text style={{ color: settings.daysBefore === day ? colors.primary : colors.text,
          fontWeight: '800', fontSize: 12 }}>
          {day === 0 ? 'No dia' : `${day} ${day === 1 ? 'dia' : 'dias'}`}
        </Text>
      </Pressable>)}
    </View>

    <SectionHeader title="Horário dos avisos" />
    <View style={styles.row}>
      {hours.map(hour => <Pressable key={hour} accessibilityRole="button"
        accessibilityState={{ selected: settings.hour === hour }}
        disabled={loading || working} onPress={() => void update({ ...settings, hour })}
        style={({ pressed }) => [styles.pill, {
          opacity: pressed ? .65 : 1,
          borderColor: settings.hour === hour ? colors.primary : colors.border,
          backgroundColor: settings.hour === hour ? colors.surfaceAlt : colors.surface,
        }]}>
        <Text style={{ color: settings.hour === hour ? colors.primary : colors.text,
          fontWeight: '800', fontSize: 12 }}>{hour}:00</Text>
      </Pressable>)}
    </View>

    <FinancePanel style={styles.block}>
      <View style={styles.switchRow}>
        <View style={styles.grow}>
          <Text style={[styles.label, { color: colors.text }]}>Receitas recorrentes</Text>
          <Text style={[styles.detail, { color: colors.muted }]}>
            Avisar também sobre recebimentos previstos.
          </Text>
        </View>
        <Switch accessibilityLabel="Incluir receitas recorrentes" disabled={loading || working}
          value={settings.includeIncome} onValueChange={includeIncome => void update({ ...settings, includeIncome })}
          trackColor={{ false: colors.track, true: colors.primary }} thumbColor={colors.surface} />
      </View>
    </FinancePanel>

    {capability && !capability.available && <View style={[styles.notice, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={[styles.detail, { color: colors.muted }]}>
        Os avisos ainda não estão disponíveis nesta instalação. Você pode ajustar suas preferências normalmente.
      </Text>
    </View>}

    {!!feedback && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.primary }]}>{feedback}</Text>}

    <Pressable accessibilityRole="button" disabled={working || loading} onPress={() => void test()}
      style={({ pressed }) => [styles.testButton, { borderColor: colors.border,
        backgroundColor: colors.surface, opacity: pressed || working ? .7 : 1 }]}>
      <Text style={{ color: colors.text, fontWeight: '800' }}>Enviar aviso de teste</Text>
    </Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 72 },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 25 },
  block: { marginBottom: 27 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 15, minHeight: 45 },
  grow: { flex: 1, gap: 5 },
  label: { fontSize: 15, fontWeight: '800' },
  detail: { fontSize: 12, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 26 },
  pill: { minWidth: 65, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderRadius: 14, alignItems: 'center' },
  notice: { padding: 14, borderRadius: 14, marginBottom: 18 },
  feedback: { fontSize: 13, marginBottom: 17, lineHeight: 19 },
  testButton: { minHeight: 52, padding: 14, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center' },
});
