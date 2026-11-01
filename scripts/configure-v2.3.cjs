const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.json');
const packagePath = path.join(root, 'package.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (!app.expo || !app.expo.android?.package) {
  throw new Error('Configuração Android incompleta; não substitua o app.json por um template.');
}
const plugins = app.expo.plugins ?? [];
if (!plugins.some(p => p === 'expo-notifications' || Array.isArray(p) && p[0] === 'expo-notifications')) {
  plugins.push(['expo-notifications', { color: '#16845D' }]);
}
app.expo.plugins = plugins;
app.expo.version = '2.3.0';
pkg.version = '2.3.0';
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Finance 2.3.0 configurado. Identificador Android:', app.expo.android.package);
console.log('Dependência necessária: npx expo install expo-notifications');
