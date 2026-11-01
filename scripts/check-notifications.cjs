const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
const plugins = app.expo?.plugins ?? [];
const plugin = plugins.some(item => item === 'expo-notifications' ||
  (Array.isArray(item) && item[0] === 'expo-notifications'));
const dependency = dependencies['expo-notifications'];
console.log('Finance - verificacao de notificacoes');
console.log('Identificador:', app.expo?.android?.package ?? '(ausente)');
console.log('Expo:', dependencies.expo ?? '(ausente)');
console.log('expo-notifications:', dependency ?? '(nao declarado)');
console.log('Plugin nativo:', plugin ? 'configurado' : 'AUSENTE');
if (!dependency || !plugin) {
  console.error('\nPara corrigir:');
  if (!dependency) console.error('npx expo install expo-notifications');
  if (!plugin) console.error('node scripts/configure-v2.3.cjs (se existir) ou adicione expo-notifications em app.json -> expo.plugins');
  process.exitCode = 1;
} else {
  console.log('\nDependencia e plugin declarados. Ainda e necessario compilar um APK novo para instalar o modulo nativo.');
}
