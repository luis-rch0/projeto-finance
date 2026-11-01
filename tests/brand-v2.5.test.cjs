const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');

test('arquivos PNG válidos e dimensões esperadas', () => {
  for (const [name, width, height] of [
    ['icon.png', 1024, 1024],
    ['adaptive-icon.png', 1024, 1024],
    ['splash-icon.png', 1024, 1024],
    ['loading-waves.png', 1200, 600],
  ]) {
    const data = fs.readFileSync(path.join(root, 'assets', name));
    assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(data.readUInt32BE(16), width);
    assert.equal(data.readUInt32BE(20), height);
  }
});

test('script preserva identidade Android, plugins e configurações existentes', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-brand-'));
  try {
    fs.mkdirSync(path.join(temp, 'scripts'));
    fs.copyFileSync(path.join(root, 'scripts/apply-brand-v2.5.cjs'),
      path.join(temp, 'scripts/apply-brand-v2.5.cjs'));
    fs.writeFileSync(path.join(temp, 'app.json'), JSON.stringify({
      expo: {
        name: 'Finance',
        android: { package: 'com.finance.local', permissions: ['android.permission.POST_NOTIFICATIONS'] },
        plugins: ['expo-sqlite', ['expo-notifications', { color: '#16845D' }],
          ['expo-splash-screen', { dark: { resizeMode: 'contain' } }]],
      },
    }));
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ version: '2.4.1' }));
    execFileSync(process.execPath, [path.join(temp, 'scripts/apply-brand-v2.5.cjs')]);
    const result = JSON.parse(fs.readFileSync(path.join(temp, 'app.json'), 'utf8')).expo;
    assert.equal(result.android.package, 'com.finance.local');
    assert.deepEqual(result.android.permissions, ['android.permission.POST_NOTIFICATIONS']);
    assert.ok(result.plugins.some((p) => Array.isArray(p) && p[0] === 'expo-notifications'));
    assert.equal(result.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1].dark.resizeMode, 'contain');
    assert.equal(result.version, '2.5.0');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('tela interna não simula progresso ou impõe duração artificial', () => {
  const loading = fs.readFileSync(path.join(root, 'src/components/ui/FinanceLoadingScreen.tsx'), 'utf8');
  assert.match(loading, /loading-waves\.png/);
  assert.match(loading, /splash-icon\.png/);
  assert.match(loading, /Carregando seus dados/);
  assert.doesNotMatch(loading, /setTimeout\(/);
});
