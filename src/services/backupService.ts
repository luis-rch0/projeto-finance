import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { validDate } from '@/utils/date';
import { firstInvoiceMonth, shiftInvoiceMonth, validInvoiceMonth, validCardDay } from '@/utils/creditCards';

/** Formato legível e versionado. Atenção: não é criptografado. */
export const BACKUP_FORMAT = 'finance.offline.backup';
export const BACKUP_VERSION = 8;
const MAX_BYTES = 20_000_000;
const MAX_ROWS = 100_000;
const RECOVERY_FILENAME = 'finance-recuperacao-anterior.json';
const columnMap = {
  accounts: ['id','name','type','initial_balance_cents','created_at'],
  payment_cards: ['id','name','linked_account_id','allows_debit','allows_credit','created_at','archived_at','deleted_at'],
  categories: ['id','name','type','color','icon','archived_at'],
  savings_goals: ['id','title','target_cents','target_date','created_at','updated_at','archived_at'],
  transactions: ['id','account_id','category_id','type','amount_cents','description','date','created_at','updated_at','payment_kind','payment_card_id'],
  account_transfers: ['id','from_account_id','to_account_id','amount_cents','date','description','created_at'],
  goal_contributions: ['id','goal_id','amount_cents','date','created_at'],
  monthly_budgets: ['id','category_id','month','limit_cents','created_at','updated_at'],
  recurrence_rules: ['id','type','account_id','category_id','amount_cents','description','frequency','start_date','end_date','created_at','updated_at','archived_at'],
  recurrence_occurrences: ['id','rule_id','occurrence_date','status','transaction_id','override_date','override_cents','override_description'],
  installment_plans: ['id','description','account_id','category_id','total_cents','installments_count','first_due_date','created_at','archived_at'],
  installment_items: ['id','plan_id','sequence','amount_cents','due_date','status','transaction_id'],
  budget_recurrence_rules: ['id','category_id','start_month','limit_cents','enabled','created_at'],
  credit_cards: ['id','name','closing_day','due_day','created_at','archived_at'],
  credit_card_purchases: ['id','card_id','description','purchase_date','total_cents','installments_count','created_at','category_id'],
  credit_card_installments: ['id','purchase_id','sequence','invoice_month','amount_cents'],
  credit_card_invoice_payments: ['id','card_id','invoice_month','account_id','category_id','amount_cents','paid_date','transaction_id','created_at'],
} as const;
export type BackupTable = keyof typeof columnMap;

/** Contagens calculadas do backup validado, para revisão antes da restauração. */
export interface BackupOverview {
  date: string;
  accounts: number;
  transfers: number;
  categories: number;
  expenses: number;
  incomes: number;
  savingsGoals: number;
  contributions: number;
  monthlyBudgets: number;
  recurrences: number;
  occurrences: number;
  installmentPlans: number;
  installments: number;
  creditCards: number;
  cardPurchases: number;
  invoicePayments: number;
}

const tables = Object.keys(columnMap) as BackupTable[];
type BackupRow = Record<string, unknown>;
type BackupTables = Record<BackupTable, BackupRow[]>;
interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  schema_version: number;
  exported_at: string;
  tables: BackupTables;
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const stringField = (row: BackupRow, field: string): boolean => typeof row[field] === 'string' && (row[field] as string).length > 0;
const safeInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const optionalString = (v: unknown) => v === null || typeof v === 'string';
const oneOf = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v);
const timestamp = (v: unknown): boolean => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function assertRow(table: BackupTable, row: BackupRow): void {
  for (const key of columnMap[table]) {
    if (!Object.prototype.hasOwnProperty.call(row,key)) throw new Error(`Campo ausente em ${table}: ${key}`);
  }
  if (!stringField(row,'id')) throw new Error(`ID inválido em ${table}.`);
  switch (table) {
    case 'accounts':
      if (!stringField(row,'name') || !oneOf(row.type,['CASH','CHECKING','SAVINGS','OTHER']) || !safeInt(row.initial_balance_cents) || !timestamp(row.created_at)) throw new Error('Conta inválida.');
      break;
    case 'payment_cards':
      if (!stringField(row,'name') || (row.name as string).trim().length>80 ||
        !optionalString(row.linked_account_id) || ![0,1].includes(row.allows_debit as number) ||
        ![0,1].includes(row.allows_credit as number) ||
        (!row.allows_debit && !row.allows_credit) ||
        (row.allows_debit===1 && !row.linked_account_id) ||
        !timestamp(row.created_at) || !optionalString(row.archived_at) ||
        !(row.deleted_at === null || timestamp(row.deleted_at))) {
        throw new Error('Cartão de pagamento inválido.');
      }
      break;
    case 'categories':
      if (!stringField(row,'name') || !oneOf(row.type,['EXPENSE','INCOME']) || !stringField(row,'color') || !stringField(row,'icon') || !optionalString(row.archived_at)) throw new Error('Categoria inválida.');
      break;
    case 'savings_goals':
      if (!stringField(row,'title') || !safeInt(row.target_cents) || row.target_cents <= 0 ||
        !(row.target_date === null || (typeof row.target_date === 'string' && validDate(row.target_date))) ||
        !timestamp(row.created_at) || !timestamp(row.updated_at) || !optionalString(row.archived_at)) throw new Error('Objetivo de economia inválido.');
      break;
    case 'transactions':
      if (!stringField(row,'account_id') || !stringField(row,'category_id') || !oneOf(row.type,['EXPENSE','INCOME']) ||
        !safeInt(row.amount_cents) || row.amount_cents <= 0 || !stringField(row,'description') ||
        typeof row.date !== 'string' || !validDate(row.date) || !timestamp(row.created_at) || !timestamp(row.updated_at) ||
        !(row.payment_kind === null || oneOf(row.payment_kind,['CASH','PIX','TRANSFER','DEBIT','OTHER'])) ||
        !optionalString(row.payment_card_id)) throw new Error('Movimentação inválida.');
      break;
    case 'account_transfers':
      if (!stringField(row, 'from_account_id') || !stringField(row, 'to_account_id') ||
        row.from_account_id === row.to_account_id || !safeInt(row.amount_cents) ||
        (row.amount_cents as number) <= 0 || !validDate(row.date as string) ||
        typeof row.description !== 'string' || row.description.length > 160 ||
        !timestamp(row.created_at)) {
        throw new Error('Transferência inválida no backup.');
      }
      break;
    case 'goal_contributions':
      if (!stringField(row,'goal_id') || !safeInt(row.amount_cents) || row.amount_cents <= 0 ||
        typeof row.date !== 'string' || !validDate(row.date) || !timestamp(row.created_at)) throw new Error('Aporte inválido.');
      break;
    case 'budget_recurrence_rules':
      if (!stringField(row,'category_id') || typeof row.start_month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.start_month) ||
        !safeInt(row.limit_cents) || (row.enabled !== 0 && row.enabled !== 1) || !timestamp(row.created_at) ||
        !((row.enabled === 1 && row.limit_cents > 0) || (row.enabled === 0 && row.limit_cents === 0))) {
        throw new Error('Regra de limite automático inválida.');
      }
      break;
    case 'monthly_budgets':
      if (!stringField(row,'category_id') || typeof row.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) ||
        !safeInt(row.limit_cents) || row.limit_cents <= 0 || !timestamp(row.created_at) || !timestamp(row.updated_at)) throw new Error('Limite mensal inválido.');
      break;
    case 'recurrence_rules':
      if (!oneOf(row.type,['EXPENSE','INCOME']) || !stringField(row,'account_id') || !stringField(row,'category_id') ||
        !safeInt(row.amount_cents) || row.amount_cents <= 0 || !stringField(row,'description') ||
        !oneOf(row.frequency,['WEEKLY','MONTHLY','YEARLY']) || typeof row.start_date !== 'string' || !validDate(row.start_date) ||
        !(row.end_date === null || (typeof row.end_date === 'string' && validDate(row.end_date) && row.end_date >= row.start_date)) ||
        !timestamp(row.created_at) || !timestamp(row.updated_at) || !optionalString(row.archived_at)) throw new Error('Recorrência inválida.');
      break;
    case 'installment_plans':
      if (!stringField(row,'description') || !stringField(row,'account_id') || !stringField(row,'category_id') ||
        !safeInt(row.total_cents) || !safeInt(row.installments_count) || row.installments_count < 2 || row.installments_count > 60 ||
        row.total_cents < row.installments_count || typeof row.first_due_date !== 'string' || !validDate(row.first_due_date) ||
        !timestamp(row.created_at) || !optionalString(row.archived_at)) throw new Error('Parcelamento inválido.');
      break;
    case 'installment_items':
      if (!stringField(row,'plan_id') || !safeInt(row.sequence) || row.sequence < 1 ||
        !safeInt(row.amount_cents) || row.amount_cents <= 0 || typeof row.due_date !== 'string' || !validDate(row.due_date) ||
        !oneOf(row.status,['PENDING','CONFIRMED','SKIPPED']) || !optionalString(row.transaction_id) ||
        ((row.status === 'CONFIRMED') !== (typeof row.transaction_id === 'string'))) throw new Error('Parcela inválida.');
      break;
    case 'credit_cards':
      if (!stringField(row,'name') || (row.name as string).trim().length > 80 ||
        !validCardDay(row.closing_day as number) || !validCardDay(row.due_day as number) ||
        !timestamp(row.created_at) || !optionalString(row.archived_at)) {
        throw new Error('Cartão inválido no backup.');
      }
      break;
    case 'credit_card_purchases':
      if (!stringField(row,'card_id') || !stringField(row,'description') ||
        (row.description as string).trim().length > 150 || !validDate(String(row.purchase_date)) ||
        !safeInt(row.total_cents) || !safeInt(row.installments_count) ||
        row.installments_count < 1 || row.installments_count > 60 || row.total_cents < row.installments_count ||
        !timestamp(row.created_at) || !optionalString(row.category_id)) throw new Error('Compra de cartão inválida no backup.');
      break;
    case 'credit_card_installments':
      if (!stringField(row,'purchase_id') || !safeInt(row.sequence) || row.sequence < 1 ||
        row.sequence > 60 || !validInvoiceMonth(String(row.invoice_month)) ||
        !safeInt(row.amount_cents) || row.amount_cents <= 0) {
        throw new Error('Parcela de cartão inválida no backup.');
      }
      break;
    case 'credit_card_invoice_payments':
      if (!stringField(row,'card_id') || !validInvoiceMonth(String(row.invoice_month)) ||
        !stringField(row,'account_id') || !stringField(row,'category_id') ||
        !safeInt(row.amount_cents) || row.amount_cents <= 0 || !validDate(String(row.paid_date)) ||
        !stringField(row,'transaction_id') || !timestamp(row.created_at)) {
        throw new Error('Pagamento de fatura inválido no backup.');
      }
      break;
    case 'recurrence_occurrences':
      if (!stringField(row,'rule_id') || typeof row.occurrence_date !== 'string' || !validDate(row.occurrence_date) ||
        !oneOf(row.status,['PENDING','CONFIRMED','SKIPPED']) || !optionalString(row.transaction_id) ||
        ((row.status === 'CONFIRMED') !== (typeof row.transaction_id === 'string')) ||
        !(row.override_date === null || (typeof row.override_date === 'string' && validDate(row.override_date))) ||
        !(row.override_cents === null || (safeInt(row.override_cents) && row.override_cents > 0)) ||
        !(row.override_description === null || (typeof row.override_description === 'string' &&
          row.override_description.trim().length > 0 && row.override_description.trim().length <= 150))) {
        throw new Error('Ocorrência inválida.');
      }
      break;
  }
}

/** Valida todos os dados e relacionamentos ANTES de qualquer alteração no banco. */
export function parseAndValidateBackup(json: string): BackupFile {
  if (json.length > MAX_BYTES) throw new Error('Backup excede o limite de 20 MB.');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('O arquivo não contém JSON válido.'); }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || !((raw.version === 1 && raw.schema_version === 4) ||
      (raw.version === 2 && raw.schema_version === 5) ||
      (raw.version === 3 && raw.schema_version === 6) ||
      (raw.version === 4 && raw.schema_version === 7) ||
      (raw.version === 5 && raw.schema_version === 8) ||
      (raw.version === 6 && raw.schema_version === 9) ||
      (raw.version === 7 && raw.schema_version === 10) ||
      (raw.version === BACKUP_VERSION && raw.schema_version === 11)) || !timestamp(raw.exported_at) || !isObj(raw.tables)) {
    throw new Error('Formato ou versão do backup incompatível.');
  }
  const data = raw.tables;
  const isLegacy = raw.version === 1;
  const rows = {} as BackupTables;
  let count = 0;
  for (const table of tables) {
    const records = (typeof raw.version === 'number' && raw.version < 6 && table === 'payment_cards')
      ? ((Array.isArray(data.credit_cards) ? data.credit_cards : []) as BackupRow[]).map(card => ({
          id:card.id,name:card.name,linked_account_id:null,allows_debit:0,allows_credit:1,
          created_at:card.created_at,archived_at:card.archived_at,
        }))
      : (typeof raw.version === 'number' && raw.version < 8 && table === 'account_transfers') ||
      (isLegacy && (table === 'installment_plans' || table === 'installment_items')) ||
      (typeof raw.version === 'number' && raw.version < 3 && table === 'budget_recurrence_rules') ||
      (typeof raw.version === 'number' && raw.version < 5 &&
        (table === 'credit_cards' || table === 'credit_card_purchases' ||
         table === 'credit_card_installments' || table === 'credit_card_invoice_payments'))
      ? [] : data[table];
    if (!Array.isArray(records)) throw new Error(`Tabela ausente: ${table}.`);
    count += records.length;
    if (count > MAX_ROWS) throw new Error('Backup excede 100 mil registros.');
    const unique = new Set<string>();
    rows[table] = records.map(item => {
      if (!isObj(item)) throw new Error(`Registro inválido em ${table}.`);
      // Backups v1-v3 não possuíam exceções por vencimento: ficam nulas.
      const normalizedV4 = table === 'recurrence_occurrences' && typeof raw.version === 'number' && raw.version < 4
        ? { ...item, override_date: null, override_cents: null, override_description: null } : item;
      const normalizedV6 = typeof raw.version === 'number' && raw.version < 6 && table === 'transactions'
        ? { ...normalizedV4, payment_kind:null, payment_card_id:null }
        : typeof raw.version === 'number' && raw.version < 6 && table === 'credit_card_purchases'
        ? { ...normalizedV4, category_id:null } : normalizedV4;
      // Exclusão lógica surgiu no esquema 10; backups antigos ficam com cartão visível.
      const normalized = table === 'payment_cards' && typeof raw.version === 'number' && raw.version < 7
        ? { ...normalizedV6, deleted_at:null } : normalizedV6;
      assertRow(table,normalized);
      const id = normalized.id as string;
      if (unique.has(id)) throw new Error(`Identificador duplicado em ${table}.`);
      unique.add(id);
      // Apenas colunas autorizadas são usadas na importação.
      return Object.fromEntries(columnMap[table].map(column => [column,normalized[column]]));
    });
  }
  if (!rows.accounts.length) throw new Error('O backup não contém nenhuma conta.');
  const keys = (table: BackupTable) => new Set(rows[table].map(row => row.id));
  const accountIDs = keys('accounts');
  const paymentCards = new Map(rows.payment_cards.map(row=>[row.id,row]));
  const categories = new Map(rows.categories.map(row => [row.id,row]));
  const goals = keys('savings_goals');
  const rules = new Map(rows.recurrence_rules.map(row => [row.id,row]));
  const transactionIDs = keys('transactions');
  const plans = new Map(rows.installment_plans.map(row => [row.id,row]));
  const usedNames = new Set<string>();
  for (const row of rows.categories) {
    const key = `${row.type}:${row.name}`;
    if (usedNames.has(key)) throw new Error('Nomes de categorias duplicados.');
    usedNames.add(key);
  }
  const seenBudgetRules = new Set<string>();
  for (const row of rows.budget_recurrence_rules) {
    if (categories.get(row.category_id)?.type !== 'EXPENSE') throw new Error('Regra de limite com categoria inválida.');
    const key = `${row.category_id}:${row.start_month}`;
    if (seenBudgetRules.has(key)) throw new Error('Regras automáticas duplicadas para a mesma categoria e mês.');
    seenBudgetRules.add(key);
  }
  for (const card of rows.payment_cards) {
    if (card.linked_account_id !== null && !accountIDs.has(card.linked_account_id)) {
      throw new Error('Cartão vinculado a conta inexistente.');
    }
  }
  for (const row of rows.transactions) {
    if (!accountIDs.has(row.account_id) || categories.get(row.category_id)?.type !== row.type ||
      (row.payment_card_id !== null && !paymentCards.has(row.payment_card_id)) ||
      (row.payment_kind === 'DEBIT' && (row.type !== 'EXPENSE' || !row.payment_card_id)) ||
      (row.payment_kind !== 'DEBIT' && row.payment_card_id !== null)) {
      throw new Error('Movimentação com conta, cartão ou categoria incompatível.');
    }
  }
  for (const transfer of rows.account_transfers) {
    if (!accountIDs.has(transfer.from_account_id) || !accountIDs.has(transfer.to_account_id)) {
      throw new Error('Transferência vinculada a conta inexistente.');
    }
  }
  for (const row of rows.goal_contributions) if (!goals.has(row.goal_id)) throw new Error('Aporte vinculado a uma meta inexistente.');
  const budgetKeys = new Set<string>();
  for (const row of rows.monthly_budgets) {
    if (categories.get(row.category_id)?.type !== 'EXPENSE') throw new Error('Limite sem categoria de despesa.');
    const key = `${row.category_id}:${row.month}`;
    if (budgetKeys.has(key)) throw new Error('Limites mensais duplicados.');
    budgetKeys.add(key);
  }
  for (const row of rows.recurrence_rules) {
    if (!accountIDs.has(row.account_id) || categories.get(row.category_id)?.type !== row.type) throw new Error('Recorrência com conta ou categoria incompatível.');
  }
  const dates = new Set<string>();
  const attached = new Set<string>();
  for (const row of rows.recurrence_occurrences) {
    if (!rules.has(row.rule_id)) throw new Error('Ocorrência sem regra correspondente.');
    const key = `${row.rule_id}:${row.occurrence_date}`;
    if (dates.has(key)) throw new Error('Ocorrências duplicadas.');
    dates.add(key);
    if (typeof row.transaction_id === 'string') {
      if (!transactionIDs.has(row.transaction_id) || attached.has(row.transaction_id)) throw new Error('Ocorrência com movimentação ausente ou repetida.');
      attached.add(row.transaction_id as string);
    }
  }
  const planTotals = new Map<string,{sum:number;count:number;sequences:Set<number>}>();
  for (const row of rows.installment_plans) {
    if (!accountIDs.has(row.account_id) || categories.get(row.category_id)?.type !== 'EXPENSE') {
      throw new Error('Parcelamento vinculado a conta ou categoria inválida.');
    }
    planTotals.set(row.id as string,{sum:0,count:0,sequences:new Set()});
  }
  for (const row of rows.installment_items) {
    const plan = plans.get(row.plan_id);
    if (!plan) throw new Error('Parcela sem parcelamento válido.');
    const key = row.plan_id as string;
    const stats = planTotals.get(key)!;
    const seq = row.sequence as number;
    if (seq > (plan.installments_count as number) || stats.sequences.has(seq)) throw new Error('Sequência de parcela duplicada.');
    stats.sequences.add(seq); stats.sum += row.amount_cents as number; stats.count++;
    if (typeof row.transaction_id === 'string') {
      if (!transactionIDs.has(row.transaction_id) || attached.has(row.transaction_id)) throw new Error('Parcela com movimentação ausente ou repetida.');
      attached.add(row.transaction_id);
    }
  }
  for (const row of rows.installment_plans) {
    const stats=planTotals.get(row.id as string)!;
    if (stats.count !== row.installments_count || stats.sum !== row.total_cents) throw new Error('Valor ou quantidade das parcelas não corresponde ao total.');
  }
  // Cartões, compras, parcelas e pagamentos só podem referenciar dados existentes.
  const cards = new Map(rows.credit_cards.map(row => [row.id, row]));
  for (const card of rows.payment_cards) {
    if ((card.allows_credit === 1) !== cards.has(card.id)) throw new Error('Perfil de cartão de crédito inconsistente.');
    const profile = cards.get(card.id);
    if (profile && (profile.name !== card.name || profile.archived_at !== card.archived_at)) {
      throw new Error('Nome ou arquivamento de cartão inconsistente.');
    }
  }
  for (const card of rows.credit_cards) if (!paymentCards.has(card.id)) {
    throw new Error('Cartão de crédito sem perfil de pagamento.');
  }
  const purchases = new Map(rows.credit_card_purchases.map(row => [row.id, row]));
  const purchaseStats = new Map<string, { sum: number; sequences: Set<number> }>();
  for (const row of rows.credit_card_purchases) {
    if (!cards.has(row.card_id) ||
      (row.category_id !== null && categories.get(row.category_id)?.type !== 'EXPENSE')) {
      throw new Error('Compra com cartão ou categoria inválidos.');
    }
    purchaseStats.set(row.id as string, { sum: 0, sequences: new Set<number>() });
  }
  const monthTotals = new Map<string, number>();
  for (const row of rows.credit_card_installments) {
    const purchase = purchases.get(row.purchase_id);
    if (!purchase) throw new Error('Parcela de cartão sem compra correspondente.');
    const stats = purchaseStats.get(row.purchase_id as string)!;
    const sequence = row.sequence as number;
    if (sequence > (purchase.installments_count as number) || stats.sequences.has(sequence)) {
      throw new Error('Sequência de compra em cartão duplicada.');
    }
    stats.sequences.add(sequence);
    stats.sum += row.amount_cents as number;
    const card = cards.get(purchase.card_id)!;
    const expected = shiftInvoiceMonth(firstInvoiceMonth(purchase.purchase_date as string,
      card.closing_day as number, card.due_day as number), sequence - 1);
    if (row.invoice_month !== expected) throw new Error('Mês de parcela inconsistente no backup.');
    const key = `${purchase.card_id}:${row.invoice_month}`;
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + (row.amount_cents as number));
  }
  for (const row of rows.credit_card_purchases) {
    const stats = purchaseStats.get(row.id as string)!;
    if (stats.sum !== row.total_cents || stats.sequences.size !== row.installments_count) {
      throw new Error('Parcelamento de cartão com total ou quantidade inconsistente.');
    }
  }
  const payments = new Set<string>();
  for (const row of rows.credit_card_invoice_payments) {
    if (!cards.has(row.card_id) || !accountIDs.has(row.account_id) ||
      categories.get(row.category_id)?.type !== 'EXPENSE') {
      throw new Error('Pagamento de fatura com cartão, conta ou categoria inválidos.');
    }
    const key = `${row.card_id}:${row.invoice_month}`;
    if (payments.has(key)) throw new Error('Fatura marcada como paga duas vezes.');
    payments.add(key);
    if (monthTotals.get(key) !== row.amount_cents) throw new Error('Pagamento divergente do total da fatura.');
    const linked = rows.transactions.find(tx => tx.id === row.transaction_id);
    if (!linked || attached.has(row.transaction_id as string) || linked.type !== 'EXPENSE' ||
      linked.account_id !== row.account_id || linked.category_id !== row.category_id ||
      linked.amount_cents !== row.amount_cents || linked.date !== row.paid_date) {
      throw new Error('Movimentação vinculada à fatura inválida.');
    }
    attached.add(row.transaction_id as string);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schema_version: 11,
    exported_at: raw.exported_at as string, tables: rows };
}

export function describeBackup(json: string): BackupOverview {
  const data = parseAndValidateBackup(json);
  return {
    date: data.exported_at,
    accounts: data.tables.accounts.length,
    transfers: data.tables.account_transfers.length,
    categories: data.tables.categories.length,
    expenses: data.tables.transactions.filter(row => row.type === 'EXPENSE').length,
    incomes: data.tables.transactions.filter(row => row.type === 'INCOME').length,
    savingsGoals: data.tables.savings_goals.length,
    contributions: data.tables.goal_contributions.length,
    monthlyBudgets: data.tables.monthly_budgets.length,
    recurrences: data.tables.recurrence_rules.length,
    occurrences: data.tables.recurrence_occurrences.length,
    installmentPlans: data.tables.installment_plans.length,
    installments: data.tables.installment_items.length,
    creditCards: data.tables.credit_cards.length,
    cardPurchases: data.tables.credit_card_purchases.length,
    invoicePayments: data.tables.credit_card_invoice_payments.length,
  };
}

/** Nunca confirma o salvamento sem reler o arquivo gerado. */
async function writeAndVerify(uri: string, json: string): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, json);
  const readBack = await FileSystem.readAsStringAsync(uri);
  if (readBack !== json) throw new Error('Falha ao conferir o backup salvo. Não utilize esse arquivo.');
}

export async function serializeBackup(db: SQLiteDatabase): Promise<string> {
  const tableData = {} as BackupTables;
  await db.withExclusiveTransactionAsync(async tx => {
    for (const table of tables) tableData[table] = await tx.getAllAsync<BackupRow>(`SELECT * FROM ${table}`);
  });
  const json = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, schema_version: 11,
    exported_at: new Date().toISOString(), tables: tableData });
  if (json.length > MAX_BYTES) throw new Error('Backup ultrapassa o limite de 20 MB.');
  // Garantia adicional: não exporta um arquivo que a própria restauração rejeitaria.
  parseAndValidateBackup(json);
  return json;
}
function docDir(): string {
  if (!FileSystem.documentDirectory) throw new Error('Armazenamento interno indisponível.');
  return FileSystem.documentDirectory;
}
export async function saveBackupToFolder(db: SQLiteDatabase): Promise<string | null> {
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;
  const json = await serializeBackup(db);
  const baseName = `finance-backup-${new Date().toISOString().replace(/[:.]/g,'-')}`;
  let uri: string | null = null;
  try {
    uri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri, baseName, 'application/json');
    await writeAndVerify(uri, json);
    return `${baseName}.json`;
  } catch (error) {
    // Se houve falha, tenta remover o arquivo incompleto para evitar restauração acidental.
    if (uri) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* acesso SAF pode expirar */ }
    }
    throw error;
  }
}

export async function shareBackup(db: SQLiteDatabase): Promise<string> {
  const json = await serializeBackup(db);
  const name = `finance-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  const uri = `${FileSystem.cacheDirectory ?? docDir()}${name}`;
  await writeAndVerify(uri, json);
  if (!await Sharing.isAvailableAsync()) throw new Error('Compartilhamento indisponível neste dispositivo.');
  await Sharing.shareAsync(uri,{ mimeType: 'application/json', dialogTitle: 'Salvar backup do Finance', UTI: 'public.json' });
  return name;
}

/**
 * Android pode devolver content:// em vez de file://. O FileSystem legacy não lê
 * esse URI diretamente, mas copyAsync aceita content:// como origem. Também
 * evitamos a cópia interna do DocumentPicker para diagnosticar falhas de I/O.
 * O JSON é validado antes que a tela ofereça a restauração do SQLite.
 */
export async function selectBackupFile(): Promise<string | null> {
  let chosen: Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>;
  try {
    chosen = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: false,
      multiple: false,
    });
  } catch (error) {
    throw new Error(
      `Falha ao selecionar o arquivo no Android. Experimente usar um JSON salvo em Downloads, ` +
      `e não um arquivo aberto diretamente da nuvem. Detalhes: ${errorMessage(error)}`
    );
  }
  if (chosen.canceled) return null;

  const selected = chosen.assets[0];
  if (!selected?.uri) throw new Error('O Android não retornou o endereço do arquivo selecionado.');
  if (selected.size !== undefined && selected.size > MAX_BYTES) {
    throw new Error('Arquivo maior que 20 MB.');
  }
  const destinationDir = FileSystem.cacheDirectory ?? docDir();
  const temporaryUri = `${destinationDir}finance-importacao-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  try {
    try {
      await FileSystem.copyAsync({ from: selected.uri, to: temporaryUri });
    } catch (error) {
      throw new Error(
        `Não foi possível copiar o arquivo selecionado para o armazenamento temporário. ` +
        `Tente movê-lo para Downloads no dispositivo. Detalhes: ${errorMessage(error)}`
      );
    }
    const info = await FileSystem.getInfoAsync(temporaryUri);
    if (!info.exists || info.isDirectory) throw new Error('O arquivo copiado não está disponível para leitura.');
    if (info.size > MAX_BYTES) throw new Error('Arquivo maior que 20 MB.');

    let json: string;
    try {
      json = await FileSystem.readAsStringAsync(temporaryUri);
    } catch (error) {
      throw new Error(`Falha ao ler a cópia temporária do arquivo. Detalhes: ${errorMessage(error)}`);
    }
    // Ainda não modifica o banco; rejeita imediatamente backup inválido.
    parseAndValidateBackup(json);
    return json;
  } finally {
    // A importação deve deixar apenas o arquivo externo original, nunca cópias órfãs.
    try { await FileSystem.deleteAsync(temporaryUri, { idempotent: true }); } catch { /* limpeza de cache é secundária */ }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Substitui todos os dados em UMA transação. Se falhar, o SQLite desfaz tudo. */
export async function restoreBackup(db: SQLiteDatabase, json: string, makeRecovery = true): Promise<void> {
  const backup = parseAndValidateBackup(json);
  if (makeRecovery) {
    // Não sobrescreve o estado atual sem antes salvar uma cópia interna de recuperação.
    const current = await serializeBackup(db);
    await writeAndVerify(`${docDir()}${RECOVERY_FILENAME}`, current);
  }
  await db.withExclusiveTransactionAsync(async tx => {
    for (const table of [...tables].reverse()) await tx.execAsync(`DELETE FROM ${table}`);
    for (const table of tables) {
      const cols: readonly string[] = columnMap[table];
      const placeholders = cols.map(() => '?').join(',');
      const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
      for (const record of backup.tables[table]) {
        await tx.runAsync(sql,cols.map(col => record[col] as string | number | null));
      }
    }
    for (const table of tables) {
      const actual = await tx.getFirstAsync<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
      if (actual?.total !== backup.tables[table].length) {
        throw new Error(`Falha ao conferir os dados restaurados: ${table}.`);
      }
    }
    const fk = await tx.getAllAsync('PRAGMA foreign_key_check');
    if (fk.length) throw new Error('Falha de integridade: vínculos inválidos.');
    const integrity = await tx.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
    if (integrity?.quick_check !== 'ok') throw new Error('Falha de integridade no banco restaurado.');
  });
}
export async function hasRecoveryBackup(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(`${docDir()}${RECOVERY_FILENAME}`);
  return info.exists;
}
export async function restoreRecoveryBackup(db: SQLiteDatabase): Promise<void> {
  const json = await FileSystem.readAsStringAsync(`${docDir()}${RECOVERY_FILENAME}`);
  await restoreBackup(db,json,false);
}
