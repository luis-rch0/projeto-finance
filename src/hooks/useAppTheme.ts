import { useAppearanceContext } from '@/providers/AppearanceProvider';

/** Única origem das cores e preferências de aparência do Finance. */
export function useAppTheme() {
  return useAppearanceContext();
}
