const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const tsPath = path.join(__dirname, '..', 'src', 'utils', 'analytics.ts');
const source = fs.readFileSync(tsPath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.equal((transpiled.diagnostics ?? []).length, 0, 'O utilitário deve ter sintaxe TypeScript válida');
const mod = { exports: {} };
new Function('module', 'exports', transpiled.outputText)(mod, mod.exports);
const { percentChange, sharePercent, budgetLevel, signedPercent } = mod.exports;

test('variação: anterior zero não vira infinidade', () => {
  assert.equal(percentChange(100, 0), null);
  assert.equal(percentChange(0, 0), 0);
  assert.equal(signedPercent(null), 'Sem base anterior');
});
test('variação positiva e negativa', () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(80, 100), -20);
  assert.equal(signedPercent(-20), '-20,0%');
});
test('participação e período vazio', () => {
  assert.equal(sharePercent(50, 200), 25);
  assert.equal(sharePercent(0, 0), 0);
});
test('limites: 79%, 80%, 100% e ultrapassado', () => {
  assert.equal(budgetLevel(79, 100), 'NORMAL');
  assert.equal(budgetLevel(80, 100), 'NEAR');
  assert.equal(budgetLevel(100, 100), 'NEAR');
  assert.equal(budgetLevel(101, 100), 'EXCEEDED');
});
test('valores inválidos são recusados', () => {
  assert.throws(() => percentChange(1, -1));
  assert.throws(() => budgetLevel(10, 0));
  assert.throws(() => sharePercent(-2, 10));
});
