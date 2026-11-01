const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'app/notifications/index.tsx'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/services/reminderService.ts'), 'utf8');

test('preferencias nao sao bloqueadas apenas por estar no Expo Go', () => {
  assert.doesNotMatch(screen, /disabled=\{[^}]*isExpoGo/);
  assert.match(screen, /await saveReminderPreferences\(next\)/);
});
test('botao de teste nao depende da chave de ativacao', () => {
  assert.match(screen, /onPress=\{\(\) => void test\(\)\}/);
  assert.doesNotMatch(screen, /disabled=\{[^}]*!settings\.enabled/);
  assert.match(service, /await prepareReminderPermissions\(\)/);
});
test('diagnostico nativo nao interrompe a importacao de rotas', () => {
  assert.match(service, /export async function checkNotificationCapability/);
  assert.match(service, /notificationModule = import\('expo-notifications'\)/);
  assert.doesNotMatch(screen, /import \* as Notifications from 'expo-notifications'/);
});
