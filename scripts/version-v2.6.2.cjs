const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'package.json');
const info = JSON.parse(fs.readFileSync(file, 'utf8'));
info.version = '2.6.2';
fs.writeFileSync(file, JSON.stringify(info, null, 2) + '\n');
console.log('Finance v2.6.2: versão atualizada.');
