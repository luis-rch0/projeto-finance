export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppearancePreferences {
  theme: ThemePreference;
  highContrast: boolean;
}

export const defaultAppearancePreferences: AppearancePreferences = {
  theme: 'system',
  highContrast: false,
};

export function isAppearancePreferences(value: unknown): value is AppearancePreferences {
  if (!value || typeof value !== 'object') return false;
  const x = value as Partial<AppearancePreferences>;
  return (x.theme === 'system' || x.theme === 'light' || x.theme === 'dark') &&
    typeof x.highContrast === 'boolean';
}
