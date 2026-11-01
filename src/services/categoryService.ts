import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { CategoryRepository } from '@/database/repositories/categoryRepository';
import type { MovementType } from '@/types/finance';

export class CategoryService {
  readonly categories: CategoryRepository;
  constructor(private db: SQLiteDatabase) { this.categories = new CategoryRepository(db); }
  private validate(name: string, color: string, icon: string): void {
    if (!name.trim() || name.trim().length > 45) throw new Error('Nome de 1 a 45 caracteres obrigatório.');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Use uma cor hexadecimal, como #16845D.');
    if (!icon.trim() || icon.length > 8 || /^\d+$/.test(icon.trim())) throw new Error('Escolha um símbolo, não um número, para o ícone.');
  }
  async create(type: MovementType, name: string, color: string, icon: string): Promise<void> {
    this.validate(name,color,icon);
    if (type !== 'INCOME' && type !== 'EXPENSE') throw new Error('Tipo inválido.');
    await this.categories.create({ id: Crypto.randomUUID(), name: name.trim(), type, color, icon, archived_at: null });
  }
  async edit(id: string, name: string, color: string, icon: string): Promise<void> {
    this.validate(name,color,icon);
    const current = await this.categories.findById(id);
    if (!current || current.archived_at) throw new Error('Categoria não encontrada.');
    await this.categories.update({ ...current, name: name.trim(), color, icon });
  }
  async archive(id: string): Promise<void> {
    const linked = await this.db.getFirstAsync<{ id: string }>(
      'SELECT id FROM recurrence_rules WHERE category_id=? AND archived_at IS NULL LIMIT 1', [id]);
    if (linked) throw new Error('Arquive primeiro as recorrências ativas desta categoria.');
    await this.categories.archive(id, new Date().toISOString());
  }
}
