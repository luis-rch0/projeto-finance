/** Atualiza somente o número de versão, sem recriar configurações do EAS. */
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();

function updateJson(filename, update) {
  const location = path.join(root, filename);
  const json = JSON.parse(fs.readFileSync(location, 'utf8'));
  update(json);
  fs.writeFileSync(location, JSON.stringify(json, null, 2) + '\n');
}

updateJson('package.json', pkg => { pkg.version = '2.2.0'; });
updateJson('app.json', app => {
  if (!app.expo || !app.expo.android?.package) {
    throw new Error('app.json sem expo.android.package. Não alterei o identificador Android.');
  }
  app.expo.version = '2.2.0';
});
console.log('Finance 2.2.0. Identificador Android e vínculo EAS preservados.');
