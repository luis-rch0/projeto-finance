const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
let sequence = 0;
const cache = new Map();
function load(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath);
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }, fileName: relativePath });
  const module = { exports: {} };
  const localRequire = name => {
    if (name === 'expo-crypto') return { randomUUID: () => `uuid-${++sequence}` };
    if (name === '@/utils/date') return load('src/utils/date.ts');
    if (name === '@/utils/creditCards') return load('src/utils/creditCards.ts');
    throw new Error(`Unexpected import ${name}`);
  };
  new Function('require', 'module', 'exports', compiled.outputText)(localRequire, module, module.exports);
  cache.set(relativePath, module.exports);
  return module.exports;
}
const { CreditCardService } = load('src/services/creditCardService.ts');

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (let n = 1; n <= 10; n++) {
    const filename = `src/database/migrations/migration${String(n).padStart(3, '0')}.ts`;
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    const block = source.match(/db\.execAsync\(`([\s\S]*?)`\)/);
    assert.ok(block, filename);
    sqlite.exec(block[1]);
  }
  const db = {
    getFirstAsync: async (sql, args = []) => sqlite.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, args = []) => sqlite.prepare(sql).all(...args),
    runAsync: async (sql, args = []) => sqlite.prepare(sql).run(...args),
    withExclusiveTransactionAsync: async (fn) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(db);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  sqlite.exec(`
    INSERT INTO accounts (id,name,type,initial_balance_cents,created_at)
      VALUES ('account','Banco','CHECKING',0,'now');
    INSERT INTO categories(id,name,type,color,icon)
      VALUES ('category','Compras','EXPENSE','#13845B','💳');
    INSERT INTO payment_cards (id,name,allows_debit,allows_credit,created_at)
      VALUES ('card','Principal',0,1,'now');
    INSERT INTO credit_cards (id,name,closing_day,due_day,created_at)
      VALUES ('card','Principal',10,17,'now');
    INSERT INTO credit_card_purchases
      (id,card_id,description,purchase_date,total_cents,installments_count,created_at,category_id)
      VALUES ('purchase','card','Mercado','2026-10-11',10001,3,'now','category');
    INSERT INTO credit_card_installments (id,purchase_id,sequence,invoice_month,amount_cents) VALUES
      ('one','purchase',1,'2026-11',3334),
      ('two','purchase',2,'2026-12',3334),
      ('three','purchase',3,'2027-01',3333);
  `);
  return { sqlite, service: new CreditCardService(db) };
}

test('edição mantém compra e categoria, redistribui valores exatos e atualiza o mês da fatura', async () => {
  const { sqlite, service } = createDatabase();
  try {
    const month = await service.editPurchase('purchase', {
      description: 'Mercado atualizado', purchase_date: '2026-10-09',
      total_cents: 12001, installments_count: 2,
    });
    assert.equal(month, '2026-10');
    const purchase = sqlite.prepare('SELECT * FROM credit_card_purchases WHERE id=?').get('purchase');
    assert.equal(purchase.description, 'Mercado atualizado');
    assert.equal(purchase.category_id, 'category');
    assert.equal(purchase.total_cents, 12001);
    const next = sqlite.prepare(`SELECT sequence,invoice_month,amount_cents FROM credit_card_installments
      WHERE purchase_id='purchase' ORDER BY sequence`).all();
    assert.deepEqual(next.map(x=>[x.sequence,x.invoice_month,x.amount_cents]), [
      [1,'2026-10',6001], [2,'2026-11',6000],
    ]);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, 0);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { sqlite.close(); }
});

test('fatura de parcela já paga protege todas as parcelas da mesma compra', async () => {
  const { sqlite, service } = createDatabase();
  try {
    await service.payInvoice({ card_id: 'card', invoice_month: '2026-11', account_id: 'account', paid_date: '2026-11-17' });
    await assert.rejects(() => service.editPurchase('purchase', {
      description: 'Mercado alterado', purchase_date: '2026-10-11',
      total_cents: 11000, installments_count: 2,
    }), /parcela em fatura paga/i);
    assert.equal(sqlite.prepare("SELECT total_cents FROM credit_card_purchases WHERE id='purchase'").get().total_cents, 10001);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM credit_card_installments WHERE purchase_id='purchase'").get().n, 3);
  } finally { sqlite.close(); }
});

test('não permite deslocar uma parcela para fatura já paga', async () => {
  const { sqlite, service } = createDatabase();
  try {
    sqlite.exec(`
      INSERT INTO credit_card_purchases (id,card_id,description,purchase_date,total_cents,installments_count,created_at)
        VALUES ('older','card','Anterior','2026-10-09',2000,1,'now');
      INSERT INTO credit_card_installments (id,purchase_id,sequence,invoice_month,amount_cents)
        VALUES ('oldline','older',1,'2026-10',2000);
    `);
    await service.payInvoice({ card_id: 'card', invoice_month: '2026-10', account_id: 'account', paid_date: '2026-10-17' });
    await assert.rejects(() => service.editPurchase('purchase', {
      description: 'Mercado', purchase_date: '2026-10-09', total_cents: 10001, installments_count: 3,
    }), /já foi paga/i);
    assert.equal(sqlite.prepare("SELECT purchase_date FROM credit_card_purchases WHERE id='purchase'").get().purchase_date, '2026-10-11');
  } finally { sqlite.close(); }
});

test('dados inválidos não mudam parcelas existentes', async () => {
  const { sqlite, service } = createDatabase();
  try {
    await assert.rejects(() => service.editPurchase('purchase', {
      description:'Mercado', purchase_date:'2026-02-30', total_cents:12000,installments_count:2,
    }), /data/i);
    await assert.rejects(() => service.editPurchase('purchase', {
      description:'Mercado', purchase_date:'2026-10-11',total_cents:12000,installments_count:61,
    }), /incompatíveis/i);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM credit_card_installments WHERE purchase_id='purchase'").get().n, 3);
  } finally { sqlite.close(); }
});
