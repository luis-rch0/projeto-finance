'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(
  path.join(__dirname, '../src/database/database.ts'),
  'utf8',
);

function createSubject(version, accountCount = 1) {
  const executed = [];
  const exports = {};
  const modules = {
    'expo-crypto': { randomUUID: () => 'generated-id' },
  };

  for (let index = 1; index <= 11; index += 1) {
    const name = `migration${String(index).padStart(3, '0')}`;
    modules[`./migrations/${name}`] = {
      [name]: async () => executed.push(`migration:${index}`),
    };
  }

  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  vm.runInNewContext(transpiled, {
    exports,
    require: (moduleName) => {
      assert.ok(modules[moduleName], `Import inesperado: ${moduleName}`);
      return modules[moduleName];
    },
  });

  const database = {
    execAsync: async (sql) => executed.push(sql),
    withExclusiveTransactionAsync: async (callback) => {
      executed.push('transaction:start');
      return callback(database);
    },
    getFirstAsync: async (sql) => {
      if (sql === 'PRAGMA user_version') return { user_version: version };
      if (sql.includes('COUNT(*)') && sql.includes('accounts')) return { total: accountCount };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    runAsync: async (sql, params) => executed.push({ sql, params }),
  };

  return { initializeDatabase: exports.initializeDatabase, database, executed };
}

test('banco na versão 11 não reaplica migrações nem recria categorias', async () => {
  const subject = createSubject(11);
  await subject.initializeDatabase(subject.database);
  assert.equal(subject.executed.some((entry) => String(entry).startsWith('migration:')), false);
  assert.equal(subject.executed.filter((entry) => typeof entry === 'object').length, 0);
  assert.equal(subject.executed[0], 'PRAGMA foreign_keys = ON');
});

test('banco na versão 10 aplica somente a migração 11', async () => {
  const subject = createSubject(10);
  await subject.initializeDatabase(subject.database);
  assert.ok(subject.executed.includes('migration:11'));
  assert.ok(subject.executed.includes('PRAGMA user_version = 11'));
  assert.equal(subject.executed.filter((entry) => String(entry).startsWith('migration:')).length, 1);
});

test('instalação inicial gera categorias e conta padrão uma única vez', async () => {
  const subject = createSubject(0, 0);
  await subject.initializeDatabase(subject.database);
  assert.equal(subject.executed.filter((entry) => String(entry).startsWith('migration:')).length, 11);
  const inserts = subject.executed.filter((entry) => typeof entry === 'object');
  assert.equal(inserts.filter((entry) => entry.sql.includes('INTO categories')).length, 12);
  assert.equal(inserts.filter((entry) => entry.sql.includes('INTO accounts')).length, 1);
});

test('banco futuro é rejeitado antes de receber alterações', async () => {
  const subject = createSubject(12);
  await assert.rejects(
    subject.initializeDatabase(subject.database),
    /versão mais nova do Finance/,
  );
  assert.equal(subject.executed.some((entry) => String(entry).startsWith('migration:')), false);
});
