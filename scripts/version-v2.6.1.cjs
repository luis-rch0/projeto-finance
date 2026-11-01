/** Ajusta apenas as versões; preserva app.json, plugins, package, EAS e assinatura. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['app.json', 'package.json']) {
  const file = path.join(root, name);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (name === 'app.json') data.expo.version = '2.6.1';
  else data.version = '2.6.1';
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`${name}: versão 2.6.1`);
}
