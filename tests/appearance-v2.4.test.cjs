const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('três modos de tema e persistência sem migração financeira', () => {
  const screen = read('app/appearance.tsx');
  const provider = read('src/providers/AppearanceProvider.tsx');
  for (const mode of ["key: 'system'", "key: 'light'", "key: 'dark'"]) assert.ok(screen.includes(mode));
  assert.match(provider, /Storage\.setItem\(STORAGE_KEY/);
  assert.match(provider, /Storage\.getItem\(STORAGE_KEY/);
  assert.match(provider, /useColorScheme/);
  assert.match(provider, /highContrast/);
  // A migração 008 pertence aos cartões da v2.6, não às preferências visuais.
  assert.match(read('src/database/database.ts'), /migration008/);
});

test('sem sobrescrever abas ou novos registros financeiros', () => {
  const rootLayout = read('app/_layout.tsx');
  assert.match(rootLayout, /AppearanceProvider/);
  assert.match(rootLayout, /databaseName="finance\.db"/);
  assert.match(rootLayout, /<ReminderCoordinator/);
  assert.match(rootLayout, /name="appearance"/);
  const settings = read('app/settings.tsx');
  assert.match(settings, /href: '\/appearance'/);
  assert.match(settings, /href: '\/backup'/);
  assert.match(settings, /href: '\/notifications'/);
});

test('avisos técnicos ocultos da interface de lembretes', () => {
  const screen = read('app/notifications/index.tsx');
  assert.doesNotMatch(screen, /expoGoConfig|ExpoTopicSubscriptionModule|executionEnvironment/);
  assert.doesNotMatch(screen, /Verificar suporte novamente|Notificações agendadas/);
  assert.match(screen, /await saveReminderPreferences\(next\)/);
  assert.match(screen, /onPress=\{\(\) => void test\(\)\}/);
});
