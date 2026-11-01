import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import { palette, type AppColors } from '@/theme/colors';
import {
  defaultAppearancePreferences,
  isAppearancePreferences,
  type AppearancePreferences,
  type ThemePreference,
} from '@/theme/appearance';

const STORAGE_KEY = 'finance.appearance.v1';
type Scheme = 'light' | 'dark';

interface AppearanceContextValue {
  scheme: Scheme;
  colors: AppColors;
  themePreference: ThemePreference;
  highContrast: boolean;
  ready: boolean;
  updateAppearance: (changes: Partial<AppearancePreferences>) => Promise<void>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function colorsFor(scheme: Scheme, highContrast: boolean): AppColors {
  const base: AppColors = { ...palette[scheme] };
  if (!highContrast) return base;
  return scheme === 'dark'
    ? { ...base, text: '#FFFFFF', muted: '#D4E3D9', border: '#647B6C', track: '#557160' }
    : { ...base, text: '#071A10', muted: '#344A3C', border: '#7E9C89', track: '#AFC9B9' };
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preferences, setPreferences] = useState<AppearancePreferences>(defaultAppearancePreferences);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const raw = await Storage.getItem(STORAGE_KEY);
        if (raw && active) {
          const parsed: unknown = JSON.parse(raw);
          if (isAppearancePreferences(parsed)) setPreferences(parsed);
        }
      } catch (error) {
        console.warn('Finance: não foi possível restaurar a aparência.', error);
      } finally {
        if (active) setReady(true);
      }
    }
    void restore();
    return () => { active = false; };
  }, []);

  const scheme = preferences.theme === 'system' ? systemScheme : preferences.theme;

  async function updateAppearance(changes: Partial<AppearancePreferences>) {
    const next = { ...preferences, ...changes };
    if (!isAppearancePreferences(next)) throw new Error('Opção de aparência inválida.');
    // Gravar antes de aplicar para não indicar sucesso sem persistência.
    await Storage.setItem(STORAGE_KEY, JSON.stringify(next));
    setPreferences(next);
  }

  const value = useMemo<AppearanceContextValue>(() => ({
    scheme,
    colors: colorsFor(scheme, preferences.highContrast),
    themePreference: preferences.theme,
    highContrast: preferences.highContrast,
    ready,
    updateAppearance,
  }), [scheme, preferences, ready]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearanceContext(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('AppearanceProvider não encontrado.');
  return value;
}
