/** Regras puras de lembrete: sem dependência de Expo ou do SQLite. */
export type ReminderKind = 'INSTALLMENT' | 'RECURRENCE';
export type ReminderType = 'EXPENSE' | 'INCOME';
export interface ReminderDue {
  id: string;
  kind: ReminderKind;
  date: string; // AAAA-MM-DD, data local de vencimento
  title: string;
  type: ReminderType;
}
export type AdvanceDays = 0 | 1 | 3 | 7;
export interface ReminderPreferences {
  enabled: boolean;
  daysBefore: AdvanceDays;
  hour: number; // horário local, de 7 a 21
  includeIncome: boolean;
}
export const defaultReminderPreferences: ReminderPreferences = {
  enabled: false,
  daysBefore: 1,
  hour: 9,
  includeIncome: false,
};
export function isReminderPreferences(value: unknown): value is ReminderPreferences {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ReminderPreferences>;
  return typeof v.enabled === 'boolean' && [0, 1, 3, 7].includes(v.daysBefore as number) &&
    typeof v.hour === 'number' && Number.isInteger(v.hour) && v.hour >= 7 && v.hour <= 21 &&
    typeof v.includeIncome === 'boolean';
}
export function reminderFireDate(date: string, daysBefore: AdvanceDays, hour: number): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const localDate = new Date(year, month - 1, day, hour, 0, 0, 0);
  if (localDate.getFullYear() !== year || localDate.getMonth() !== month - 1 || localDate.getDate() !== day) return null;
  // setDate respeita a hora local mesmo em mudanças de horário de verão.
  localDate.setDate(localDate.getDate() - daysBefore);
  return localDate;
}
export interface PlannedReminder { key: string; fireAt: Date; due: ReminderDue }
export function planReminders(
  dueItems: ReminderDue[], settings: ReminderPreferences, now = new Date(), maxCount = 40,
): PlannedReminder[] {
  if (!settings.enabled) return [];
  const seen = new Set<string>();
  const planned: PlannedReminder[] = [];
  for (const item of dueItems) {
    if (item.type === 'INCOME' && !settings.includeIncome) continue;
    const fireAt = reminderFireDate(item.date, settings.daysBefore, settings.hour);
    if (!fireAt || fireAt.getTime() <= now.getTime()) continue;
    const key = `${item.kind}:${item.id}:${item.date}:${item.title}:${settings.daysBefore}:${settings.hour}`;
    if (seen.has(key)) continue;
    seen.add(key);
    planned.push({ key, fireAt, due: item });
  }
  return planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, maxCount);
}
