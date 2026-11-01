const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const file = name => fs.readFileSync(path.join(root, name), 'utf8');

test('arquivos modificados são TSX/TS válidos', () => {
  for (const name of [
    'app/accounts/index.tsx',
    'app/cards/index.tsx',
    'app/due/index.tsx',
    'src/components/ui/FinanceNotice.tsx',
    'src/services/creditCardService.ts',
  ]) {
    const ast = ts.createSourceFile(name,file(name),ts.ScriptTarget.Latest,true,
      name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    assert.equal(ast.parseDiagnostics.length,0,name);
  }
});

test('contas e cartões possuem seções com espaço entre elas e avisos junto ao título', () => {
  const src = file('app/accounts/index.tsx');
  assert.match(src,/accountsSection:\{marginBottom:30\}/);
  assert.match(src,/cardsSection:\{marginTop:4\}/);
  assert.match(src,/FinanceNotice kind="error"/);
  assert.match(src,/scrollRef\.current\?\.scrollTo/);
});

test('campo de parcelas permanece numérico e digitável ao editar uma compra', () => {
  const src = file('app/cards/index.tsx');
  assert.match(src,/keyboardType="number-pad" maxLength=\{2\} value=\{editCount\}/);
  assert.match(src,/service\.editPurchase\(/);
  assert.match(src,/FinanceNotice kind="success"/);
});
