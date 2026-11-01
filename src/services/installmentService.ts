import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { CategoryRepository } from '@/database/repositories/categoryRepository';
import { AccountRepository } from '@/database/repositories/accountRepository';
import { InstallmentRepository } from '@/database/repositories/installmentRepository';
import type { NewInstallment } from '@/types/finance';
import { validDate } from '@/utils/date';
import { addMonthsClamped, allocateInstallments } from '@/utils/installments';

export class InstallmentService {
  readonly plans: InstallmentRepository;
  constructor(private db: SQLiteDatabase) { this.plans = new InstallmentRepository(db); }

  async create(input: NewInstallment): Promise<void> {
    const description = input.description.trim();
    if (!description || description.length > 150) throw new Error('Informe uma descrição com até 150 caracteres.');
    if (!validDate(input.first_due_date)) throw new Error('Informe a data da primeira parcela em DD/MM/AAAA.');
    const amounts = allocateInstallments(input.total_cents,input.installments_count);
    const [account,category] = await Promise.all([
      new AccountRepository(this.db).findById(input.account_id),
      new CategoryRepository(this.db).findById(input.category_id),
    ]);
    if (!account || !category || category.type !== 'EXPENSE' || category.archived_at) throw new Error('Conta ou categoria de despesa inválida.');
    const now=new Date().toISOString();const planId=Crypto.randomUUID();
    await this.db.withExclusiveTransactionAsync(async tx=>{
      await tx.runAsync(`INSERT INTO installment_plans
        (id,description,account_id,category_id,total_cents,installments_count,first_due_date,created_at,archived_at)
        VALUES (?,?,?,?,?,?,?,?,NULL)`,
        [planId,description,input.account_id,input.category_id,input.total_cents,input.installments_count,input.first_due_date,now]);
      for (let index=0;index<amounts.length;index++) {
        await tx.runAsync(`INSERT INTO installment_items
          (id,plan_id,sequence,amount_cents,due_date,status,transaction_id)
          VALUES (?,?,?, ?,?,'PENDING',NULL)`,
          [Crypto.randomUUID(),planId,index+1,amounts[index],addMonthsClamped(input.first_due_date,index)]);
      }
    });
  }

  /** Atualiza uma parcela pendente sem tocar em transações já registradas. */
  async editItem(id: string, input: { due_date: string; amount_cents: number }): Promise<void> {
    if (!validDate(input.due_date)) throw new Error('Data inválida (DD/MM/AAAA).');
    if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) throw new Error('Valor inválido.');
    await this.db.withExclusiveTransactionAsync(async tx => {
      const item = await tx.getFirstAsync<{
        plan_id: string; sequence: number; status: string; archived_at: string | null;
      }>(`SELECT i.plan_id,i.sequence,i.status,p.archived_at
          FROM installment_items i JOIN installment_plans p ON p.id=i.plan_id WHERE i.id=?`, [id]);
      if (!item || item.archived_at || item.status !== 'PENDING') {
        throw new Error('Somente parcelas pendentes e ativas podem ser editadas.');
      }
      await tx.runAsync(`UPDATE installment_items SET due_date=?,amount_cents=?
        WHERE id=? AND status='PENDING' AND transaction_id IS NULL`,
        [input.due_date,input.amount_cents,id]);
      await tx.runAsync(`UPDATE installment_plans SET
          total_cents=(SELECT SUM(amount_cents) FROM installment_items WHERE plan_id=?)
          ${item.sequence === 1 ? ',first_due_date=?' : ''}
        WHERE id=?`, item.sequence === 1
          ? [item.plan_id,input.due_date,item.plan_id] : [item.plan_id,item.plan_id]);
    });
  }

  /** Mantém IDs das parcelas e bloqueia mudanças estruturais após confirmação. */
  async updatePlan(id: string, input: NewInstallment): Promise<void> {
    const description = input.description.trim();
    if (!description || description.length > 150) throw new Error('Descrição deve ter até 150 caracteres.');
    if (!validDate(input.first_due_date)) throw new Error('Data inválida (DD/MM/AAAA).');
    const amounts = allocateInstallments(input.total_cents,input.installments_count);
    const [account, category] = await Promise.all([
      new AccountRepository(this.db).findById(input.account_id),
      new CategoryRepository(this.db).findById(input.category_id),
    ]);
    if (!account || !category || category.type !== 'EXPENSE' || category.archived_at) {
      throw new Error('Conta ou categoria de despesa inválida.');
    }
    await this.db.withExclusiveTransactionAsync(async tx => {
      const plan = await tx.getFirstAsync<{
        total_cents: number; installments_count: number; first_due_date: string; archived_at: string | null;
      }>('SELECT total_cents,installments_count,first_due_date,archived_at FROM installment_plans WHERE id=?',[id]);
      if (!plan || plan.archived_at) throw new Error('Parcelamento ativo não encontrado.');
      const rows = await tx.getAllAsync<{
        id: string; sequence: number; status: string; due_date: string;
      }>('SELECT id,sequence,status,due_date FROM installment_items WHERE plan_id=? ORDER BY sequence',[id]);
      const structuralChange = plan.total_cents !== input.total_cents ||
        plan.installments_count !== input.installments_count ||
        plan.first_due_date !== input.first_due_date;
      if (structuralChange && rows.some(row => row.status === 'CONFIRMED')) {
        throw new Error('Existem parcelas confirmadas. Edite apenas a descrição, conta e categoria do plano; valores e datas das demais parcelas podem ser ajustados individualmente.');
      }
      // Ajustes de metadados não alteram itens nem datas individualmente editadas.
      if (structuralChange) {
        for (const row of rows) {
          if (row.sequence > input.installments_count) {
            await tx.runAsync('DELETE FROM installment_items WHERE id=?',[row.id]);
          }
        }
        for (let index = 0; index < input.installments_count; index++) {
          const sequence = index + 1;
          const old = rows.find(row => row.sequence === sequence);
          const dueDate = plan.first_due_date === input.first_due_date && old
            ? old.due_date : addMonthsClamped(input.first_due_date,index);
          if (old) {
            await tx.runAsync('UPDATE installment_items SET amount_cents=?,due_date=? WHERE id=?',
              [amounts[index],dueDate,old.id]);
          } else {
            await tx.runAsync(`INSERT INTO installment_items
              (id,plan_id,sequence,amount_cents,due_date,status,transaction_id)
              VALUES (?,?,?,?,?, 'PENDING',NULL)`,
              [Crypto.randomUUID(),id,sequence,amounts[index],dueDate]);
          }
        }
      }
      await tx.runAsync(`UPDATE installment_plans SET description=?,account_id=?,category_id=?,
        total_cents=?,installments_count=?,first_due_date=? WHERE id=? AND archived_at IS NULL`,
        [description,input.account_id,input.category_id,input.total_cents,
          input.installments_count,input.first_due_date,id]);
    });
  }

  /** Só uma parcela confirmada entra no histórico; operação é atômica. */
  async confirm(itemId: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async tx=>{
      const item=await tx.getFirstAsync<{
        status: string; sequence: number; amount_cents: number; due_date: string;
        description: string; account_id: string; category_id: string; archived_at: string|null;
        category_archived: string|null;
      }>(`SELECT i.status,i.sequence,i.amount_cents,i.due_date,p.description,p.account_id,p.category_id,p.archived_at,
         c.archived_at AS category_archived FROM installment_items i
         JOIN installment_plans p ON p.id=i.plan_id JOIN categories c ON c.id=p.category_id
         WHERE i.id=?`,[itemId]);
      if (!item || item.status!=='PENDING' || item.archived_at || item.category_archived) throw new Error('Parcela não está pendente ou categoria foi arquivada.');
      const now=new Date().toISOString();const transactionId=Crypto.randomUUID();
      await tx.runAsync(`INSERT INTO transactions
        (id,account_id,category_id,type,amount_cents,description,date,created_at,updated_at)
        VALUES (?,?,?,'EXPENSE',?,?,?,?,?)`,
        [transactionId,item.account_id,item.category_id,item.amount_cents,
          `${item.description} (${item.sequence}ª parcela)`,item.due_date,now,now]);
      const result=await tx.runAsync(`UPDATE installment_items SET status='CONFIRMED',transaction_id=?
        WHERE id=? AND status='PENDING'`,[transactionId,itemId]);
      if (!result.changes) throw new Error('Parcela já processada.');
    });
  }
  async skip(id: string): Promise<void> {
    const r=await this.db.runAsync("UPDATE installment_items SET status='SKIPPED' WHERE id=? AND status='PENDING'",[id]);
    if (!r.changes) throw new Error('Somente parcelas pendentes podem ser ignoradas.');
  }
  async reopen(id: string): Promise<void> {
    const r=await this.db.runAsync("UPDATE installment_items SET status='PENDING' WHERE id=? AND status='SKIPPED'",[id]);
    if (!r.changes) throw new Error('Somente parcelas ignoradas podem ser reabertas.');
  }
  archive(id:string):Promise<void> { return this.plans.archive(id); }
}
