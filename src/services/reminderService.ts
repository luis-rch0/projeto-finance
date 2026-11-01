import type { NotificationRequest } from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ReminderRepository } from '@/database/repositories/reminderRepository';
import { RecurrenceService } from '@/services/recurrenceService';
import { stepMonth, todayISO } from '@/utils/date';
import {
  defaultReminderPreferences, isReminderPreferences, planReminders,
  type ReminderPreferences,
} from '@/utils/reminders';

const KEY = 'finance.reminders.preferences.v1';
const CHANNEL = 'finance-vencimentos';
const MARKER = 'finance-reminder-v1';
const HORIZON_DAYS = 60;
let queued: Promise<void> = Promise.resolve();

// Não carregar o módulo nativo durante a importação das rotas.
// Isso permite que o Finance abra mesmo em um Expo Go/APK sem o módulo instalado.
type NotificationsModule = typeof import('expo-notifications');
let notificationModule: Promise<NotificationsModule> | null = null;

async function getNotifications(): Promise<NotificationsModule> {
  // Nesta instalação, o Expo Go não inclui ExpoTopicSubscriptionModule.
  // Evita carregar o pacote nativo, cuja importação falharia antes do agendamento.
  if (Constants.appOwnership === 'expo') {
    throw new Error('Lembretes indisponíveis no Expo Go deste dispositivo. Teste no APK do Finance compilado com expo-notifications.');
  }
  if (!notificationModule) {
    notificationModule = import('expo-notifications')
      .then((module) => {
        module.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        return module;
      })
      .catch((cause: unknown) => {
        notificationModule = null;
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          `Notificações nativas indisponíveis nesta instalação. ` +
          `Gere um novo APK com expo-notifications e instale por cima do Finance atual. Detalhes: ${detail}`
        );
      });
  }
  return notificationModule;
}

export interface NotificationCapability {
  available: boolean;
  message: string;
}

/** Diagnóstico do ambiente; não altera permissões nem dados financeiros. */
export async function checkNotificationCapability(): Promise<NotificationCapability> {
  if (Constants.appOwnership === 'expo') {
    return {
      available: false,
      message: 'Expo Go: esta instalação não oferece o módulo exigido pela versão das notificações. '
        + 'As preferências podem ser editadas aqui; teste a entrega no APK recompilado.',
    };
  }
  try {
    const notifications = await getNotifications();
    if (typeof notifications.getPermissionsAsync !== 'function' ||
        typeof notifications.scheduleNotificationAsync !== 'function') {
      return { available: false, message: 'O aplicativo não possui todas as funções nativas de notificações.' };
    }
    return { available: true, message: 'Módulo de notificações disponível. Você pode enviar um teste ao Android.' };
  } catch (error) {
    return { available: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function getReminderPreferences(): Promise<ReminderPreferences> {
  const stored = await Storage.getItem(KEY);
  if (!stored) return { ...defaultReminderPreferences };
  try {
    const parsed: unknown = JSON.parse(stored);
    return isReminderPreferences(parsed) ? parsed : { ...defaultReminderPreferences };
  } catch {
    return { ...defaultReminderPreferences };
  }
}
export async function saveReminderPreferences(settings: ReminderPreferences): Promise<void> {
  if (!isReminderPreferences(settings)) throw new Error('Preferências de lembrete inválidas.');
  await Storage.setItem(KEY, JSON.stringify(settings));
}
export async function prepareReminderPermissions(): Promise<boolean> {
  const Notifications = await getNotifications();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Vencimentos do Finance',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}
export async function hasReminderPermission(): Promise<boolean> {
  const Notifications = await getNotifications();
  return (await Notifications.getPermissionsAsync()).granted;
}
function keyOf(request: NotificationRequest): string | null {
  const data = request.content.data;
  return data?.financeMarker === MARKER && typeof data.financeKey === 'string'
    ? data.financeKey : null;
}
async function reconcile(db: SQLiteDatabase): Promise<number> {
  const Notifications = await getNotifications();
  const settings = await getReminderPreferences();
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  const own = requests.filter(request => keyOf(request) !== null);

  if (!settings.enabled || !(await hasReminderPermission())) {
    for (const old of own) await Notifications.cancelScheduledNotificationAsync(old.identifier);
    return 0;
  }
  const now = new Date();
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + HORIZON_DAYS);
  const end = [horizon.getFullYear(), String(horizon.getMonth() + 1).padStart(2, '0'),
    String(horizon.getDate()).padStart(2, '0')].join('-');

  // Recorrências são materializadas por mês no Finance; preparar o horizonte de lembretes.
  const recurring = new RecurrenceService(db);
  const today = { year: now.getFullYear(), month: now.getMonth() + 1 };
  for (let offset = 0; offset <= 2; offset++) {
    const month = stepMonth(today.year, today.month, offset);
    await recurring.listMonth(month.year, month.month);
  }

  const due = await new ReminderRepository(db).findPendingBetween(todayISO(), end);
  const expected = planReminders(due, settings, now);
  const desired = new Map(expected.map(item => [item.key, item]));
  const existing = new Set<string>();
  for (const old of own) {
    const key = keyOf(old);
    if (!key) continue;
    // Cada chave identifica uma única notificação gerenciada pelo Finance.
    if (!desired.has(key) || existing.has(key)) {
      await Notifications.cancelScheduledNotificationAsync(old.identifier);
    } else {
      existing.add(key);
    }
  }
  for (const item of expected) {
    if (existing.has(item.key)) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: item.due.kind === 'INSTALLMENT' ? 'Parcela próxima do vencimento' :
          item.due.type === 'INCOME' ? 'Recebimento previsto' : 'Despesa recorrente próxima',
        body: `${item.due.title} • Vence em ${item.due.date.slice(8, 10)}/${item.due.date.slice(5, 7)}`,
        data: { financeMarker: MARKER, financeKey: item.key, url: '/due' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.fireAt,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
      },
    });
  }
  return expected.length;
}
/** Serialização impede duas telas de reagendarem as mesmas ocorrências ao mesmo tempo. */
export function syncReminderNotifications(db: SQLiteDatabase): Promise<number> {
  // Bloqueia apenas o Expo Go real, não o APK preview nem o dev client.
  if (Constants.appOwnership === 'expo') return Promise.resolve(0);
  const work = queued.then(() => reconcile(db));
  queued = work.then(() => undefined, () => undefined);
  return work;
}
/** Teste manual da permissão e do canal; não depende do SQLite. */
export async function sendReminderTest(): Promise<void> {
  const Notifications = await getNotifications();
  if (!(await prepareReminderPermissions())) throw new Error('Permissão de notificações não concedida no Android.');
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Finance', body: 'Se você recebeu este aviso, os lembretes estão habilitados.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5, ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) },
  });
}
