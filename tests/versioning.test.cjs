'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const sourceRoot = path.resolve(__dirname, '..');
const files = ['package.json', 'package-lock.json', 'app.json'];

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-version-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.join(sourceRoot, 'scripts/set-version.cjs'), path.join(root, 'scripts/set-version.cjs'));
  for (const name of files) fs.copyFileSync(path.join(sourceRoot, name), path.join(root, name));
  return root;
}

function runVersion(root, requestedVersion) {
  return spawnSync(process.execPath, ['scripts/set-version.cjs', requestedVersion], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('atualização sincroniza versão do npm, lockfile e Expo', (t) => {
  const root = createFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = runVersion(root, '2.8.2');
  assert.equal(result.status, 0, result.stderr);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(pkg.version, '2.8.2');
  assert.equal(lock.version, '2.8.2');
  assert.equal(lock.packages[''].version, '2.8.2');
  assert.equal(app.expo.version, '2.8.2');
});

test('versão inválida não modifica os arquivos do projeto', (t) => {
  const root = createFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = files.map((name) => fs.readFileSync(path.join(root, name), 'utf8'));
  assert.notEqual(runVersion(root, '../secrets').status, 0);
  assert.deepEqual(files.map((name) => fs.readFileSync(path.join(root, name), 'utf8')), before);
});

test('versões previamente divergentes impedem atualização', (t) => {
  const root = createFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appFile = path.join(root, 'app.json');
  const app = JSON.parse(fs.readFileSync(appFile, 'utf8'));
  app.expo.version = '2.7.9';
  fs.writeFileSync(appFile, JSON.stringify(app), 'utf8');
  const before = files.map((name) => fs.readFileSync(path.join(root, name), 'utf8'));
  assert.notEqual(runVersion(root, '2.8.2').status, 0);
  assert.deepEqual(files.map((name) => fs.readFileSync(path.join(root, name), 'utf8')), before);
});
