const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(rel) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  const transpiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  const mockRequire = name => {
    if (name === '@/utils/date') return load('src/utils/date.ts');
    throw new Error('Dependência inesperada: ' + name);
  };
  new Function('require','module','exports',transpiled.outputText)(mockRequire,mod,mod.exports);
  return mod.exports;
}
const {
  firstInvoiceMonth, shiftInvoiceMonth, splitCardInstallments, invoiceDueDate,
} = load('src/utils/creditCards.ts');

test('compra até fechamento entra na fatura correspondente', () => {
  assert.equal(firstInvoiceMonth('2026-10-09', 10, 17), '2026-10');
  assert.equal(firstInvoiceMonth('2026-10-10', 10, 17), '2026-10');
  assert.equal(firstInvoiceMonth('2026-10-11', 10, 17), '2026-11');
});
test('vencimento anterior ao fechamento fica no mês seguinte', () => {
  assert.equal(firstInvoiceMonth('2026-10-19', 20, 10), '2026-11');
  assert.equal(firstInvoiceMonth('2026-10-21', 20, 10), '2026-12');
});
test('virada de ano e mês de fevereiro', () => {
  assert.equal(shiftInvoiceMonth('2026-12', 1), '2027-01');
  assert.equal(shiftInvoiceMonth('2027-01', -1), '2026-12');
  assert.equal(invoiceDueDate('2027-02', 28), '2027-02-28');
});
test('divisão em centavos mantém soma exata', () => {
  assert.deepEqual(splitCardInstallments(10001,3), [3334,3334,3333]);
  assert.equal(splitCardInstallments(20000,12).reduce((a,b) => a+b,0),20000);
  assert.throws(()=>splitCardInstallments(2,3), /incompatíveis/);
  assert.throws(()=>splitCardInstallments(2000,61), /incompatíveis/);
});
test('data de compra inválida é recusada', () => {
  assert.throws(()=>firstInvoiceMonth('2026-02-30',10,17), /inválidos/);
  assert.throws(()=>firstInvoiceMonth('2026-01-25',31,17), /inválidos/);
});
