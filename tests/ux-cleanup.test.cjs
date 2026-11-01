/** Testes direcionados da divisão entre visão mensal, histórico e categorias. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('rotas de histórico e categorias existem e não substituem as abas', () => {
  for (const file of ['app/movements/history.tsx', 'app/movements/categories.tsx']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} não encontrado`);
  }
  const layout = read('app/(tabs)/_layout.tsx');
  assert.match(layout, /["']expenses["']/);
  assert.match(layout, /["']income["']/ );
  assert.doesNotMatch(layout, /\['history'/);
});

test('abas usam resumo com limite de registros; filtros ficam apenas no histórico', () => {
  const overview = read('src/features/movements/MovementScreen.tsx');
  assert.match(overview, /getMovementOverview/);
  assert.match(overview, /\/movements\/history/);
  assert.match(overview, /\/movements\/categories/);
  assert.doesNotMatch(overview, /<TextInput/);
  assert.doesNotMatch(overview, /calculateCategoryStats/);
  const repo = read('src/database/repositories/transactionRepository.ts');
  assert.match(repo, /getMonthlyTypeOverview/);
  assert.match(repo, /findRecentByMonthAndType/);
  assert.match(repo, /ORDER BY t\.date DESC,t\.created_at DESC LIMIT \?/);
  const history = read('src/features/movements/MovementHistoryScreen.tsx');
  assert.match(history, /searchMovements/);
  assert.match(history, /Mais filtros/);
});

test('datas e tipos de URL inválidos recebem valores padrão seguros', () => {
  const source = read('src/features/movements/routeParams.ts');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', js)(exports);
  const parsed = exports.parseMovementRouteParams({ type: 'INCOME', year: '2026', month: '10' });
  assert.equal(parsed.type, 'INCOME');
  assert.deepEqual(parsed.period, { year: 2026, month: 10 });
  const invalid = exports.parseMovementRouteParams({ type: 'INVALID', year: 'oops', month: '13' });
  assert.equal(invalid.type, 'EXPENSE');
  assert.ok(invalid.period.month >= 1 && invalid.period.month <= 12);
  assert.ok(invalid.period.year >= 1900);
});
