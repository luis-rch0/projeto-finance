const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('saudação genérica sem login e resumo mensal real', () => {
  const home = read('app/(tabs)/index.tsx');
  assert.match(home, /Olá!/);
  assert.match(home, /panorama financeiro do mês/);
  assert.match(home, /new HomeService\(db\)/);
  assert.match(home, /snapshot\.history\.map/);
  assert.doesNotMatch(home, /Olá,\s*Luis|Olá,\s*Nadia/);
});
test('cinco abas mantidas e acessos secundários disponíveis', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  for (const route of ['index','expenses','income','goals','compare']) assert.match(layout, new RegExp(`name:\\s*[\"\']${route}[\"\']`));
  const movements = read('src/features/movements/MovementScreen.tsx');
  for (const route of ['/installments','/due','/recurrences','/movements/history','/movements/categories']) {
    assert.ok(movements.includes(route), `Rota não encontrada: ${route}`);
  }
});
test('temas claros e escuros preservados; banco sem alterações nesta atualização', () => {
  const colors = read('src/theme/colors.ts');
  assert.match(colors, /light:/); assert.match(colors, /dark:/);
  assert.match(read('src/providers/AppearanceProvider.tsx'), /useColorScheme/);
  assert.match(read('src/hooks/useAppTheme.ts'), /useAppearanceContext/);
  assert.match(read('app/_layout.tsx'), /databaseName="finance\.db"/);
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});
