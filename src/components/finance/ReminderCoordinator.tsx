import { useEffect } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { router, usePathname } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { syncReminderNotifications } from '@/services/reminderService';

/** Não bloqueia a navegação em caso de erro nativo.
 * appOwnership='expo' identifica Expo Go; expoGoConfig pode refletir um manifesto e não deve ser usado como bloqueio.
 */
export function ReminderCoordinator() {
  const db = useSQLiteContext();
  const pathname = usePathname();

  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    const sync = () => { void syncReminderNotifications(db).catch(error => {
      console.warn('Finance: falha ao atualizar lembretes', error);
    }); };
    sync();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') sync();
    });
    // O listener nativo só é carregado se o módulo existir neste APK/Expo Go.
    // Falhas não devem impedir o Finance de abrir ou carregar o SQLite.
    let disposed = false;
    let response: { remove(): void } | null = null;
    void import('expo-notifications')
      .then((Notifications) => {
        if (disposed) return;
        response = Notifications.addNotificationResponseReceivedListener((value) => {
          if (value.notification.request.content.data?.url === '/due') router.push('/due');
        });
      })
      .catch((error: unknown) => {
        console.warn('Finance: listener de notificações indisponível nesta instalação', error);
      });
    return () => {
      disposed = true;
      listener.remove();
      response?.remove();
    };
  }, [db]);

  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    // Confirmação, exclusão ou alteração de uma recorrência modifica os lembretes.
    if (pathname.includes('/due') || pathname.includes('/recurrences') ||
        pathname.includes('/installments') || pathname.includes('/notifications')) {
      void syncReminderNotifications(db).catch(error => {
        console.warn('Finance: falha ao atualizar lembretes', error);
      });
    }
  }, [db, pathname]);
  return null;
}
