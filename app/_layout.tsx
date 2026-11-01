import { Suspense, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { initializeDatabase } from '@/database/database';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppearanceProvider } from '@/providers/AppearanceProvider';
import { FinanceLoadingScreen } from '@/components/ui/FinanceLoadingScreen';
import { ReminderCoordinator } from '@/components/finance/ReminderCoordinator';

export default function RootLayout() {
  return <AppearanceProvider><FinanceNavigation /></AppearanceProvider>;
}

function FinanceNavigation() {
  const { scheme, colors, ready } = useAppTheme();
  const [databaseError, setDatabaseError] = useState(false);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: colors.background,
    card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary } };

  if (!ready) return <FinanceLoadingScreen />;

  if (databaseError) return <View style={{ flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center', padding: 25 }}>
    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
      Não foi possível abrir suas informações.
    </Text>
    <Text style={{ color: colors.muted, marginTop: 12, textAlign: 'center', lineHeight: 22 }}>
      Reinicie o aplicativo. Se continuar, preserve seus dados e procure suporte antes de reinstalar.
    </Text>
  </View>;

  return <ThemeProvider value={theme}>
    <Suspense fallback={<FinanceLoadingScreen />}>
      <SQLiteProvider databaseName="finance.db" useSuspense onInit={async (db: SQLiteDatabase) => {
        try { await initializeDatabase(db); }
        catch (error) {
          console.error('Finance: não foi possível inicializar o banco de dados.', error);
          setDatabaseError(true);
          throw error;
        }
      }}>
        <ReminderCoordinator />
        <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text, headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="transaction/new" options={{ title: 'Nova movimentação', presentation: 'modal' }} />
          <Stack.Screen name="transaction/[id]" options={{ title: 'Editar movimentação' }} />
          <Stack.Screen name="backup/index" options={{ title: 'Backup e restauração' }} />
          <Stack.Screen name="categories/index" options={{ title: 'Categorias' }} />
          <Stack.Screen name="movements/history" options={{ title: 'Histórico' }} />
          <Stack.Screen name="movements/categories" options={{ title: 'Categorias do mês' }} />
          <Stack.Screen name="recurrences/index" options={{ title: 'Recorrências' }} />
          <Stack.Screen name="cards/index" options={{ title: 'Faturas' }} />
          <Stack.Screen name="transfers/index" options={{ title: 'Transferências' }} />
          <Stack.Screen name="accounts/index" options={{ title: 'Contas e cartões' }} />
          <Stack.Screen name="installments/index" options={{ title: 'Parcelamentos' }} />
          <Stack.Screen name="due/index" options={{ title: 'Vencimentos' }} />
          <Stack.Screen name="export/index" options={{ title: 'Exportar CSV' }} />
          <Stack.Screen name="settings" options={{ title: 'Configurações' }} />
          <Stack.Screen name="notifications/index" options={{ title: 'Lembretes' }} />
          <Stack.Screen name="appearance" options={{ title: 'Aparência' }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
  </ThemeProvider>;
}
