const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/utils/reminders.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(output.outputText, filename);
const { reminderFireDate, planReminders, defaultReminderPreferences, isReminderPreferences } = mod.exports;
const prefs = { ...defaultReminderPreferences, enabled: true, daysBefore: 1, hour: 9 };
const due = (id, date, kind = 'INSTALLMENT', type = 'EXPENSE') => ({id, date, title: `Conta ${id}`, kind, type});

test('configuração padrão começa desativada', () => {
  assert.equal(defaultReminderPreferences.enabled, false);
  assert.equal(isReminderPreferences(prefs), true);
  assert.equal(isReminderPreferences({ ...prefs, hour: 29 }), false);
});
test('agenda um dia antes às nove horas locais', () => {
  const d = reminderFireDate('2026-12-01', 1, 9);
  assert.equal(d?.getFullYear(), 2026);
  assert.equal(d?.getMonth(), 10);
  assert.equal(d?.getDate(), 30);
  assert.equal(d?.getHours(), 9);
});
test('valida datas inexistentes', () => {
  assert.equal(reminderFireDate('2026-02-31', 1, 9), null);
});
test('não cria notificações com os lembretes desativados', () => {
  assert.deepEqual(planReminders([due('a', '2026-12-01')], defaultReminderPreferences), []);
});
test('descarta notificações cujo disparo já passou', () => {
  assert.deepEqual(planReminders([due('a', '2026-10-15')], prefs, new Date(2026, 9, 15, 10)), []);
});
test('evita duplicação de chaves e exclui receitas por padrão', () => {
  const list = [due('a', '2026-12-01'), due('a', '2026-12-01'), due('b', '2026-12-01', 'RECURRENCE', 'INCOME')];
  const result = planReminders(list, prefs, new Date(2026, 10, 1));
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'INSTALLMENT:a:2026-12-01:Conta a:1:9');
  assert.equal(planReminders(list, {...prefs, includeIncome:true}, new Date(2026,10,1)).length, 2);
});
test('respeita a prioridade cronológica e o limite máximo', () => {
  const list = Array.from({length: 45}, (_, i) => due(String(i), `2026-12-${String(i % 25 + 1).padStart(2, '0')}`));
  const result = planReminders(list, prefs, new Date(2026, 10, 1));
  assert.equal(result.length, 40);
  for(let i = 1; i < result.length; i++) assert.ok(result[i-1].fireAt <= result[i].fireAt);
});

test('reagenda ao alterar a data ou descrição da pendência', () => {
  const initial = planReminders([due('a', '2026-12-01')], prefs, new Date(2026, 10, 1));
  const modified = planReminders([due('a', '2026-12-02')], prefs, new Date(2026, 10, 1));
  assert.notEqual(initial[0].key, modified[0].key);
});
