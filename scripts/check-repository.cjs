'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const app = JSON.parse(read('app.json'));
const eas = JSON.parse(read('eas.json'));

assert.equal(pkg.version, app.expo.version, 'Versões do npm e Expo divergentes');
assert.equal(pkg.version, lock.version, 'Versão do package-lock divergente');
assert.equal(pkg.version, lock.packages[''].version, 'Versão raiz do lockfile divergente');
assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies, 'Dependências fora de sincronia');
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies, 'Dependências de desenvolvimento fora de sincronia');
assert.equal(eas.build.preview.android.buildType, 'apk', 'Perfil preview deve gerar APK');
assert.equal(eas.cli.appVersionSource, 'remote', 'Versionamento Android deve usar EAS remoto');

const migrationsDirectory = path.join(root, 'src/database/migrations');
const migrations = fs.readdirSync(migrationsDirectory)
  .filter((filename) => /^migration\d{3}\.ts$/.test(filename))
  .sort();

assert.ok(migrations.length > 0, 'Nenhuma migração encontrada');
for (const [index, migration] of migrations.entries()) {
  const expected = `migration${String(index + 1).padStart(3, '0')}.ts`;
  assert.equal(migration, expected, `Migração ausente ou fora de sequência: ${expected}`);
  assert.ok(read('src/database/database.ts').includes(`import { ${expected.slice(0, -3)} }`), `Migração não importada: ${migration}`);
}

const ignored = read('.gitignore');
for (const pattern of ['node_modules/', '.expo/', '.env', '*.sqlite', '*.db', '*.keystore']) {
  assert.ok(ignored.includes(pattern), `Proteção ausente no .gitignore: ${pattern}`);
}

console.log(`Finance v${pkg.version}: versão, lockfile, ${migrations.length} migrações, APK e .gitignore verificados.`);
