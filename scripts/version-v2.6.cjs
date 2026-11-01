/** Atualiza somente os números de versão, preservando todas as demais configurações. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const file of ['package.json', 'app.json']) {
  const absolute = path.join(root, file);
  const config = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (file === 'package.json') config.version = '2.6.0';
  if (file === 'app.json') {
    if (!config.expo) throw new Error('app.json sem propriedade expo.');
    config.expo.version = '2.6.0';
  }
  fs.writeFileSync(absolute, JSON.stringify(config, null, 2) + '\n');
}
console.log('Finance v2.6.0: versão atualizada sem alterar os plugins ou a identidade Android.');
