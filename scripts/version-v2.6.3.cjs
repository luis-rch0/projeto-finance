const fs = require('node:fs');
const path = require('node:path');
const filename = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(filename, 'utf8'));
pkg.version = '2.6.3';
fs.writeFileSync(filename, JSON.stringify(pkg, null, 2) + '\n');
console.log('Finance v2.6.3 configurado.');
