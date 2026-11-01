import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migration001 } from './migrations/migration001';
import { migration002 } from './migrations/migration002';
import { migration003 } from './migrations/migration003';
import { migration004 } from './migrations/migration004';
import { migration005 } from './migrations/migration005';
import { migration006 } from './migrations/migration006';
import { migration007 } from './migrations/migration007';
import { migration008 } from './migrations/migration008';
import { migration009 } from './migrations/migration009';
import { migration010 } from './migrations/migration010';
import { migration011 } from './migrations/migration011';

type Migration = (db: SQLiteDatabase) => Promise<void>;
type CategoryType = 'EXPENSE' | 'INCOME';

// A posição de cada migração define seu número. Nunca reordenar ou editar
// migrações já publicadas: alterações futuras devem acrescentar uma nova.
const migrations: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
];

const initialCategories: ReadonlyArray<{
  type: CategoryType;
  names: readonly string[];
}> = [
  {
    type: 'EXPENSE',
    names: [
      'Alimentação', 'Transporte', 'Moradia', 'Saúde',
      'Educação', 'Lazer', 'Compras', 'Outros',
    ],
  },
  {
    type: 'INCOME',
    names: ['Salário', 'Freelance', 'Investimentos', 'Outros'],
  },
];

const initialIcons: Record<string, string> = {
  'EXPENSE:Alimentação': '🍽️',
  'EXPENSE:Transporte': '🚗',
  'EXPENSE:Moradia': '🏠',
  'EXPENSE:Saúde': '💊',
  'EXPENSE:Educação': '📚',
  'EXPENSE:Lazer': '🎮',
  'EXPENSE:Compras': '🛍️',
  'EXPENSE:Outros': '📌',
  'INCOME:Salário': '💼',
  'INCOME:Freelance': '💻',
  'INCOME:Investimentos': '📈',
  'INCOME:Outros': '💰',
};

async function applyMigrations(db: SQLiteDatabase, currentVersion: number): Promise<void> {
  for (let index = currentVersion; index < migrations.length; index += 1) {
    await migrations[index](db);
    await db.execAsync(`PRAGMA user_version = ${index + 1}`);
  }
}

async function seedCategories(db: SQLiteDatabase): Promise<void> {
  for (const { type, names } of initialCategories) {
    for (const name of names) {
      await db.runAsync(
        'INSERT OR IGNORE INTO categories (id,name,type,color,icon) VALUES (?,?,?,?,?)',
        [
          Crypto.randomUUID(),
          name,
          type,
          type === 'INCOME' ? '#16845D' : '#D94B56',
          initialIcons[`${type}:${name}`] ?? '🏷️',
        ],
      );
    }
  }
}

async function ensureDefaultAccount(db: SQLiteDatabase): Promise<void> {
  const count = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM accounts',
  );

  if ((count?.total ?? 0) > 0) return;

  await db.runAsync(
    'INSERT INTO accounts (id,name,type,initial_balance_cents,created_at) VALUES (?,?,?,?,?)',
    [Crypto.randomUUID(), 'Carteira', 'CASH', 0, new Date().toISOString()],
  );
}

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON');

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version',
    );
    const currentVersion = row?.user_version ?? 0;

    if (currentVersion > migrations.length) {
      throw new Error('Este banco pertence a uma versão mais nova do Finance.');
    }

    await applyMigrations(transaction, currentVersion);

    // Não recriar categorias arquivadas ou renomeadas em bancos existentes.
    if (currentVersion === 0) {
      await seedCategories(transaction);
    }

    await ensureDefaultAccount(transaction);
  });
}
