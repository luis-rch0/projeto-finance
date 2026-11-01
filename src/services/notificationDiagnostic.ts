import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Não importe expo-notifications no topo deste arquivo.
// Em alguns Expo Go do SDK 57, o import do pacote lança erro nativo.

type DiagnosticStage =
  | 'module'
  | 'channel'
  | 'permission'
  | 'schedule'
  | 'completed';

export interface NotificationDiagnostic {
  success: boolean;
  stage: DiagnosticStage;
  message: string;
}

const CHANNEL_ID = 'finance-vencimentos';

export async function testNativeNotification(): Promise<NotificationDiagnostic> {
  // appOwnership só indica 'expo' dentro do Expo Go.
  // executionEnvironment='storeClient' também pode significar Development Build.
  // expoGoConfig pode estar presente em um manifesto de build próprio.
  if (Constants.appOwnership === 'expo') {
    return {
      success: false,
      stage: 'module',
      message: 'Este teste está indisponível nesta instalação do Expo Go. ' +
        'Abra o APK próprio do Finance ou o development build.',
    };
  }

  let stage: DiagnosticStage = 'module';

  try {
    const Notifications = await import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    stage = 'channel';
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Vencimentos do Finance',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    stage = 'permission';
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        return {
          success: false,
          stage,
          message: 'Notificações estão bloqueadas no Android. ' +
            'Abra Configurações > Aplicativos > Finance > Notificações.',
        };
      }
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) {
      return {
        success: false,
        stage,
        message: 'O Android não concedeu a permissão de notificações.',
      };
    }

    stage = 'schedule';
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Finance',
        body: 'Teste realizado: notificações locais funcionando!',
        sound: 'default',
        data: { type: 'TEST' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!scheduled.some(item => item.identifier === identifier)) {
      return {
        success: false,
        stage,
        message: 'O sistema não confirmou o agendamento da notificação.',
      };
    }

    return {
      success: true,
      stage: 'completed',
      message: 'Notificação agendada. Aguarde cerca de 5 segundos.',
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      stage,
      message: `Falha na etapa ${stage}: ${detail} ` +
        `(executionEnvironment=${Constants.executionEnvironment}; ` +
        `appOwnership=${String(Constants.appOwnership)})`,
    };
  }
}
