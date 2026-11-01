/** Testes isolados do serviço de backup. npm install, depois: node --test tests/backup-safety.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const files = new Map();
let corruptRead = false;
let deleted = [];
let events = [];
let pickResult = { canceled: true };
let pickedOptions = null;
let failCopy = false;
let failPicker = false;
const fsMock = {
  documentDirectory: 'file:///finance/', cacheDirectory: 'file:///finance/cache/',
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: async () => ({ granted: true, directoryUri: 'content://folder' }),
    createFileAsync: async () => 'content://folder/backup.json',
  },
  writeAsStringAsync: async (uri, contents) => { events.push(`write:${uri}`); files.set(uri, contents); },
  readAsStringAsync: async uri => {
    events.push(`read:${uri}`);
    const value = files.get(uri);
    if (value === undefined) throw new Error('Arquivo não encontrado');
    return corruptRead ? value + 'corrupt' : value;
  },
  copyAsync: async ({from, to}) => {
    events.push(`copy:${from}`);
    if (failCopy) throw new Error('java.io.IOException: cannot access content URI');
    if (!files.has(from)) throw new Error('source missing');
    files.set(to, files.get(from));
  },
  deleteAsync: async uri => { deleted.push(uri); files.delete(uri); },
  getInfoAsync: async uri => ({ exists: files.has(uri), isDirectory:false, size:files.get(uri)?.length ?? 0 }),
};
const docPickerMock = { getDocumentAsync: async options => {
  pickedOptions = options;
  if (failPicker) throw new Error('java.io.IOException: picker rejected');
  return pickResult;
} };
const sharingMock = { isAvailableAsync: async () => true, shareAsync: async () => {} };
const tsCache = new Map();
function readTS(rel) {
  const file = path.join(root, rel);
  if (tsCache.has(file)) return tsCache.get(file).exports;
  const mod = { exports: {} };
  tsCache.set(file, mod);
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true });
  assert.equal((output.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  function localRequire(name) {
    if (name === 'expo-file-system/legacy') return fsMock;
    if (name === 'expo-document-picker') return docPickerMock;
    if (name === 'expo-sharing') return sharingMock;
    if (name === '@/utils/date') return readTS('src/utils/date.ts');
    if (name === '@/utils/creditCards') return readTS('src/utils/creditCards.ts');
    throw new Error(`Mock ausente: ${name}`);
  }
  new Function('require', 'module', 'exports', output.outputText)(localRequire, mod, mod.exports);
  return mod.exports;
}
const service = readTS('src/services/backupService.ts');
const timestamp = '2026-10-13T12:00:00.000Z';
const fixture = () => ({
  format: service.BACKUP_FORMAT, version: 1, schema_version: 4, exported_at: timestamp,
  tables: {
    accounts: [{ id:'acct', name:'Carteira', type:'CASH', initial_balance_cents:0, created_at:timestamp }],
    categories: [{ id:'cat', name:'Alimentação', type:'EXPENSE', color:'#D94B56', icon:'1', archived_at:null }],
    savings_goals: [],
    transactions: [{ id:'tx', account_id:'acct', category_id:'cat', type:'EXPENSE', amount_cents:2450,
      description:'Almoço', date:'2026-10-13', created_at:timestamp, updated_at:timestamp }],
    goal_contributions: [], monthly_budgets: [], recurrence_rules: [], recurrence_occurrences: [],
  },
});
const reset = () => { files.clear(); corruptRead = false; deleted = []; events = []; pickResult = {canceled:true}; pickedOptions = null; failCopy = false; failPicker = false; };
function dbMock(data = fixture()) {
  let started = 0;
  let saved = 0;
  const columns = {
    ...data.tables,
    payment_cards: (data.tables.credit_cards ?? []).map(c => ({
      id:c.id,name:c.name,linked_account_id:null,allows_debit:0,allows_credit:1,
      created_at:c.created_at,archived_at:c.archived_at,
    })),
    transactions: (data.tables.transactions ?? []).map(t => ({
      payment_kind:null,payment_card_id:null,...t,
    })),
    credit_card_purchases: (data.tables.credit_card_purchases ?? []).map(c => ({
      category_id:null,...c,
    })),
  };
  const db = {
    get stats() { return { started, saved }; },
    withExclusiveTransactionAsync: async fn => {
      ++started;
      return fn({
        getAllAsync: async sql => {
          if (sql.startsWith('PRAGMA foreign_key_check')) return [];
          const table = sql.match(/^SELECT \* FROM (\w+)$/)?.[1];
          if (table) return columns[table] ?? [];
          throw new Error(`SQL GET ALL inesperado: ${sql}`);
        },
        getFirstAsync: async sql => {
          const table = sql.match(/^SELECT COUNT\(\*\) AS total FROM (\w+)$/)?.[1];
          if (table) return { total: (columns[table] ?? []).length };
          if (sql === 'PRAGMA quick_check') return { quick_check: 'ok' };
          throw new Error(`SQL GET FIRST inesperado: ${sql}`);
        },
        execAsync: async sql => { events.push(sql); },
        runAsync: async () => { ++saved; return { changes: 1 }; },
      });
    },
  };
  return db;
}

test('prévia apresenta quantidades reais do backup', () => {
  const overview = service.describeBackup(JSON.stringify(fixture()));
  assert.equal(overview.accounts, 1);
  assert.equal(overview.expenses, 1);
  assert.equal(overview.incomes, 0);
});

test('salvar em pasta relê o arquivo e confirma conteúdo exato', async () => {
  reset();
  const name = await service.saveBackupToFolder(dbMock());
  assert.match(name, /^finance-backup-.*\.json$/);
  assert.ok(files.has('content://folder/backup.json'));
  assert.ok(events.includes('read:content://folder/backup.json'));
});

test('arquivo incompleto não é apresentado como backup salvo', async () => {
  reset(); corruptRead = true;
  await assert.rejects(service.saveBackupToFolder(dbMock()), /Falha ao conferir/);
  assert.deepEqual(deleted, ['content://folder/backup.json']);
});

test('backup inválido é recusado antes de acessar o banco', async () => {
  reset(); const db = dbMock();
  await assert.rejects(service.restoreBackup(db, '{'), /JSON válido/);
  assert.equal(db.stats.started, 0);
});

test('antes de restaurar, salva e verifica uma cópia de recuperação', async () => {
  reset(); const db = dbMock();
  await service.restoreBackup(db, JSON.stringify(fixture()));
  assert.ok(files.has('file:///finance/finance-recuperacao-anterior.json'));
  const writeIndex = events.indexOf('write:file:///finance/finance-recuperacao-anterior.json');
  const readIndex = events.indexOf('read:file:///finance/finance-recuperacao-anterior.json');
  const deleteIndex = events.findIndex(value => value.startsWith('DELETE FROM'));
  assert.ok(writeIndex >= 0 && readIndex > writeIndex && deleteIndex > readIndex);
  assert.equal(db.stats.saved, 3); // conta, categoria e despesa
});

test('falha na verificação da cópia interna cancela a restauração', async () => {
  reset(); corruptRead = true; const db = dbMock();
  await assert.rejects(service.restoreBackup(db, JSON.stringify(fixture())), /Falha ao conferir/);
  assert.equal(db.stats.saved, 0);
  assert.equal(events.some(value => value.startsWith('DELETE FROM')), false);
});

test('backup com categoria inexistente é rejeitado sem alterar o banco', async () => {
  reset(); const invalid = fixture(); invalid.tables.transactions[0].category_id = 'not-exists';
  const db = dbMock();
  await assert.rejects(service.restoreBackup(db, JSON.stringify(invalid)), /categoria incompatível/);
  assert.equal(db.stats.started, 0);
});


test('restauração copia content:// para cache antes de ler (sem SQL)', async () => {
  reset();
  const original = 'content://com.android.providers.downloads.documents/document/backup';
  const json = JSON.stringify(fixture());
  files.set(original, json);
  pickResult = { canceled: false, assets: [{uri:original, size:json.length, name:'finance-backup.json'}] };
  const actual = await service.selectBackupFile();
  assert.equal(actual, json);
  assert.equal(pickedOptions.copyToCacheDirectory, false);
  assert.ok(events.includes(`copy:${original}`));
  assert.equal(events.includes(`read:${original}`), false);
  assert.ok(deleted.some(value=>value.includes('finance-importacao-')));
});

test('falha IOException ao copiar informa operação e não modifica SQLite', async () => {
  reset(); failCopy = true;
  pickResult = { canceled: false, assets: [{uri:'content://provider/document/file', name:'finance.json'}] };
  await assert.rejects(service.selectBackupFile(), /Não foi possível copiar.*Downloads.*java.io.IOException/);
  assert.ok(deleted.some(value=>value.includes('finance-importacao-')));
});

test('falha IOException na seleção informa operação e orienta cópia local', async () => {
  reset(); failPicker = true;
  await assert.rejects(service.selectBackupFile(), /Falha ao selecionar.*Downloads.*java.io.IOException/);
});

test('JSON inválido escolhido pelo Android é recusado antes da restauração', async () => {
  reset();
  const original = 'content://provider/document/file';
  files.set(original, '{inválido');
  pickResult = { canceled: false, assets: [{uri:original, name:'backup.json'}] };
  await assert.rejects(service.selectBackupFile(), /JSON válido/);
  assert.ok(deleted.some(value=>value.includes('finance-importacao-')));
});

test('backup v1.2 continua compatível; exportação v1.3 inclui parcelas', async () => {
  reset();
  const legacy = service.parseAndValidateBackup(JSON.stringify(fixture()));
  assert.equal(legacy.tables.installment_items.length, 0);
  const current = JSON.parse(await service.serializeBackup(dbMock()));
  assert.equal(current.version, 8);
  assert.equal(current.schema_version, 11);
  assert.deepEqual(current.tables.installment_plans, []);
  assert.deepEqual(current.tables.installment_items, []);
  assert.deepEqual(current.tables.budget_recurrence_rules, []);
  assert.deepEqual(current.tables.credit_cards, []);
  assert.deepEqual(current.tables.credit_card_purchases, []);
  assert.deepEqual(current.tables.credit_card_installments, []);
  assert.deepEqual(current.tables.credit_card_invoice_payments, []);
});

test('restauração de backup v3 preserva regras de orçamento e preenche overrides ausentes', () => {
  const old = fixture();
  old.version = 3;
  old.schema_version = 6;
  old.tables.installment_plans = [];
  old.tables.installment_items = [];
  old.tables.budget_recurrence_rules = [{ id:'rule-budget', category_id:'cat', start_month:'2026-10', limit_cents:20000, enabled:1, created_at:timestamp }];
  old.tables.recurrence_rules = [{ id:'rule', type:'EXPENSE', account_id:'acct', category_id:'cat',
    amount_cents:5000, description:'Aluguel', frequency:'MONTHLY', start_date:'2026-10-01', end_date:null,
    created_at:timestamp, updated_at:timestamp, archived_at:null }];
  old.tables.recurrence_occurrences = [{id:'occ', rule_id:'rule', occurrence_date:'2026-10-01', status:'PENDING', transaction_id:null}];
  const result = service.parseAndValidateBackup(JSON.stringify(old));
  assert.equal(result.tables.budget_recurrence_rules.length, 1);
  assert.equal(result.tables.recurrence_occurrences[0].override_date, null);
  assert.equal(result.tables.recurrence_occurrences[0].override_cents, null);
});

test('backup v4 mantém edição pontual do vencimento', () => {
  const current = fixture();
  current.version = 4; current.schema_version = 7;
  current.tables.installment_plans = []; current.tables.installment_items = [];
  current.tables.budget_recurrence_rules = [];
  current.tables.recurrence_rules = [{ id:'rule', type:'EXPENSE', account_id:'acct', category_id:'cat',
    amount_cents:5000, description:'Internet', frequency:'MONTHLY', start_date:'2026-10-01', end_date:null,
    created_at:timestamp, updated_at:timestamp, archived_at:null }];
  current.tables.recurrence_occurrences = [{ id:'occ', rule_id:'rule', occurrence_date:'2026-10-01',
    status:'PENDING', transaction_id:null, override_date:'2026-10-03',
    override_cents:4900, override_description:'Internet corrigida' }];
  const restored = service.parseAndValidateBackup(JSON.stringify(current));
  assert.equal(restored.tables.recurrence_occurrences[0].override_cents,4900);
  assert.equal(restored.tables.recurrence_occurrences[0].override_date,'2026-10-03');
});

test('backup v5 inclui cartões, compras, parcelas e pagamento sem duplicar receita/despesa', () => {
  const current = fixture();
  current.version = 5; current.schema_version = 8;
  current.tables.installment_plans = [];
  current.tables.installment_items = [];
  current.tables.budget_recurrence_rules = [];
  current.tables.credit_cards = [{id:'card',name:'Cartão',closing_day:10,due_day:17,created_at:timestamp,archived_at:null}];
  current.tables.credit_card_purchases = [{id:'purchase',card_id:'card',description:'Livro',purchase_date:'2026-10-11',total_cents:3334,installments_count:1,created_at:timestamp}];
  current.tables.credit_card_installments = [{id:'inst',purchase_id:'purchase',sequence:1,invoice_month:'2026-11',amount_cents:3334}];
  current.tables.transactions.push({id:'invoice-tx',account_id:'acct',category_id:'cat',type:'EXPENSE',
    amount_cents:3334,description:'Fatura Cartão',date:'2026-11-17',created_at:timestamp,updated_at:timestamp});
  current.tables.credit_card_invoice_payments = [{id:'payment',card_id:'card',invoice_month:'2026-11',
    account_id:'acct',category_id:'cat',amount_cents:3334,paid_date:'2026-11-17',transaction_id:'invoice-tx',created_at:timestamp}];
  const valid = service.parseAndValidateBackup(JSON.stringify(current));
  assert.equal(valid.tables.credit_cards.length,1);
  assert.equal(valid.tables.credit_card_invoice_payments.length,1);
  const overview = service.describeBackup(JSON.stringify(current));
  assert.equal(overview.creditCards,1);
  assert.equal(overview.cardPurchases,1);
  assert.equal(overview.invoicePayments,1);
  current.tables.credit_card_invoice_payments[0].amount_cents += 1;
  assert.throws(()=>service.parseAndValidateBackup(JSON.stringify(current)),/Pagamento divergente/);
});

test('backup v6 preserva cartão só débito e meio de pagamento da transação', () => {
  const old = service.parseAndValidateBackup(JSON.stringify(fixture()));
  old.tables.payment_cards.push({id:'debit-card', name:'Débito Banco', linked_account_id:'acct',
    allows_debit:1,allows_credit:0,created_at:timestamp,archived_at:null,deleted_at:null});
  old.tables.transactions[0].payment_kind='DEBIT';
  old.tables.transactions[0].payment_card_id='debit-card';
  const restored=service.parseAndValidateBackup(JSON.stringify(old));
  assert.equal(restored.tables.payment_cards.length,1);
  assert.equal(restored.tables.transactions[0].payment_kind,'DEBIT');
  assert.equal(restored.tables.transactions[0].payment_card_id,'debit-card');
});

test('backup mantém histórico após trocar a conta vinculada ao cartão de débito', () => {
  const current = service.parseAndValidateBackup(JSON.stringify(fixture()));
  current.tables.accounts.push({id:'new-account',name:'Banco novo',type:'CHECKING',initial_balance_cents:0,created_at:timestamp});
  current.tables.payment_cards.push({id:'debit-card',name:'Débito Banco',linked_account_id:'new-account',
    allows_debit:1,allows_credit:0,created_at:timestamp,archived_at:null,deleted_at:null});
  current.tables.transactions[0].payment_kind='DEBIT';
  current.tables.transactions[0].payment_card_id='debit-card';
  const restored=service.parseAndValidateBackup(JSON.stringify(current));
  assert.equal(restored.tables.transactions[0].account_id,'acct');
  assert.equal(restored.tables.payment_cards[0].linked_account_id,'new-account');
});

test('backup rejeita cartão de pagamento associado a movimentação que não seja débito', () => {
  const current = service.parseAndValidateBackup(JSON.stringify(fixture()));
  current.tables.payment_cards.push({id:'debit-card',name:'Débito',linked_account_id:'acct',
    allows_debit:1,allows_credit:0,created_at:timestamp,archived_at:null,deleted_at:null});
  current.tables.transactions[0].payment_kind='PIX';
  current.tables.transactions[0].payment_card_id='debit-card';
  assert.throws(()=>service.parseAndValidateBackup(JSON.stringify(current)),/Movimentação com conta/);
});

test('backup v6 rejeita cartão de débito sem conta',()=>{
  const old=service.parseAndValidateBackup(JSON.stringify(fixture()));
  old.tables.payment_cards.push({id:'debit-card',name:'Inválido',linked_account_id:null,
    allows_debit:1,allows_credit:0,created_at:timestamp,archived_at:null,deleted_at:null});
  assert.throws(()=>service.parseAndValidateBackup(JSON.stringify(old)),/Cartão de pagamento inválido/);
});


test('backup v6 é aceito e recebe deleted_at nulo sem perder cartões', () => {
  const v6 = service.parseAndValidateBackup(JSON.stringify(fixture()));
  v6.version = 6; v6.schema_version = 9;
  v6.tables.payment_cards.push({ id:'card-v6', name:'Débito', linked_account_id:'acct',
    allows_debit:1, allows_credit:0, created_at:timestamp, archived_at:null });
  const restored = service.parseAndValidateBackup(JSON.stringify(v6));
  assert.equal(restored.version, 8);
  assert.equal(restored.schema_version, 11);
  assert.equal(restored.tables.payment_cards[0].deleted_at, null);
});

test('backup v7 preserva exclusão lógica e permite restauração posterior', () => {
  const current = service.parseAndValidateBackup(JSON.stringify(fixture()));
  current.tables.payment_cards.push({ id:'card-removed', name:'Cartão fora de uso', linked_account_id:null,
    allows_debit:0, allows_credit:1, created_at:timestamp, archived_at:null, deleted_at:timestamp });
  current.tables.credit_cards.push({ id:'card-removed', name:'Cartão fora de uso', closing_day:10,
    due_day:17, created_at:timestamp, archived_at:null });
  const restored = service.parseAndValidateBackup(JSON.stringify(current));
  assert.equal(restored.tables.payment_cards[0].deleted_at, timestamp);
  assert.equal(restored.tables.credit_cards[0].id, 'card-removed');
});


test('backup v7 permanece compatível e importa transferências vazias', () => {
  const old = service.parseAndValidateBackup(JSON.stringify(fixture()));
  old.version = 7;
  old.schema_version = 10;
  delete old.tables.account_transfers;
  const restored = service.parseAndValidateBackup(JSON.stringify(old));
  assert.equal(restored.version, 8);
  assert.deepEqual(restored.tables.account_transfers, []);
});

test('backup v8 preserva origem, destino e valor das transferências', () => {
  const current = service.parseAndValidateBackup(JSON.stringify(fixture()));
  current.tables.accounts.push({
    id: 'bank', name: 'Banco', type: 'CHECKING', initial_balance_cents: 0, created_at: timestamp,
  });
  current.tables.account_transfers.push({
    id: 'move', from_account_id: 'acct', to_account_id: 'bank', amount_cents: 15000,
    date: '2026-10-13', description: 'Reserva', created_at: timestamp,
  });
  const restored = service.parseAndValidateBackup(JSON.stringify(current));
  assert.equal(restored.tables.account_transfers[0].amount_cents, 15000);
  assert.equal(service.describeBackup(JSON.stringify(current)).transfers, 1);
});

test('backup rejeita transferências inválidas antes da restauração', async () => {
  const current = service.parseAndValidateBackup(JSON.stringify(fixture()));
  const transfer = {
    id: 'move', from_account_id: 'acct', to_account_id: 'inexistente', amount_cents: 15000,
    date: '2026-10-13', description: '', created_at: timestamp,
  };
  current.tables.account_transfers = [transfer];
  const db = dbMock();
  await assert.rejects(service.restoreBackup(db, JSON.stringify(current)), /Transferência vinculada/);
  assert.equal(db.stats.started, 0);
  transfer.to_account_id = 'acct';
  assert.throws(() => service.parseAndValidateBackup(JSON.stringify(current)), /Transferência inválida/);
  transfer.to_account_id = 'inexistente';
  transfer.amount_cents = -15;
  assert.throws(() => service.parseAndValidateBackup(JSON.stringify(current)), /Transferência inválida/);
});
