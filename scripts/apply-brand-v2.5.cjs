/**
 * Atualiza SOMENTE campos de identidade visual do app.json.
 * Preserva expo-notifications, os demais plugins, android.package, eas.json e SQLite.
 * Rode na raiz do Finance: node scripts/apply-brand-v2.5.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const config = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
if (!config.expo || typeof config.expo !== 'object') {
  throw new Error('Arquivo app.json não contém o objeto "expo".');
}
const expo = config.expo;
expo.icon = './assets/icon.png';
expo.android = expo.android || {};
expo.android.adaptiveIcon = {
  ...(expo.android.adaptiveIcon || {}),
  foregroundImage: './assets/adaptive-icon.png',
  backgroundColor: '#00402F',
};

const plugins = Array.isArray(expo.plugins) ? [...expo.plugins] : [];
const index = plugins.findIndex((plugin) =>
  plugin === 'expo-splash-screen' ||
  (Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'),
);
const existing = index >= 0 && Array.isArray(plugins[index])
  ? plugins[index][1] || {}
  : {};
const splash = [
  'expo-splash-screen',
  {
    ...existing,
    backgroundColor: '#003E30',
    image: './assets/splash-icon.png',
    imageWidth: 200,
    dark: {
      ...(existing.dark || {}),
      backgroundColor: '#002B23',
      image: './assets/splash-icon.png',
    },
  },
];
if (index >= 0) plugins[index] = splash;
else plugins.push(splash);
expo.plugins = plugins;

// Atualize o nome da versão do app. A numeração versionCode permanece a cargo do EAS.
expo.version = '2.5.0';
fs.writeFileSync(appJsonPath, `${JSON.stringify(config, null, 2)}\n`);

const pkgPath = path.join(root, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = '2.5.0';
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = '2.5.0';
  if (lock.packages?.['']) lock.packages[''].version = '2.5.0';
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}
console.log('Finance v2.5: ícone e splash configurados. Plugins e android.package preservados.');
