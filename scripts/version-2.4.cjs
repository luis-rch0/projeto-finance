/** Opcional: ajusta a versão exibida sem substituir outras opções de app.json. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const version = '2.4.0';
for (const file of ['package.json', 'app.json']) {
  const full = path.join(root, file);
  const json = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (file === 'package.json') json.version = version;
  else json.expo.version = version;
  fs.writeFileSync(full, JSON.stringify(json, null, 2) + '\n');
}
const lockPath = path.join(root,'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
console.log(`Finance atualizado para ${version}. Configurações existentes preservadas.`);
