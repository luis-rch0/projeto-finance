'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = process.argv[2];
const isValidVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

if (!version || !isValidVersion.test(version)) {
  console.error('Uso: npm run version:set -- 2.8.2');
  process.exitCode = 1;
} else {
  const files = ['package.json', 'package-lock.json', 'app.json'];
  const documents = files.map((file) => {
    const filename = path.join(root, file);
    return { file, filename, data: JSON.parse(fs.readFileSync(filename, 'utf8')) };
  });

  const [pkg, lock, app] = documents.map(({ data }) => data);
  if (pkg.name !== 'finance' || lock.name !== pkg.name || !lock.packages?.[''] || !app.expo) {
    throw new Error('Estrutura inesperada dos arquivos de versão. Nenhum arquivo foi alterado.');
  }
  if (pkg.version !== lock.version || pkg.version !== lock.packages[''].version || pkg.version !== app.expo.version) {
    throw new Error('Versões atuais divergentes. Execute npm run quality antes de atualizar.');
  }

  pkg.version = version;
  lock.version = version;
  lock.packages[''].version = version;
  app.expo.version = version;

  for (const { filename, data } of documents) {
    fs.writeFileSync(filename, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }
  console.log(`Versão local atualizada para ${version}. Confira o diff e execute os testes antes da tag.`);
  console.log('O Android versionCode continua gerenciado separadamente pelo EAS remoto.');
}
