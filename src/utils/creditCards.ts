import { validDate } from '@/utils/date';

export function validInvoiceMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
}

export function shiftInvoiceMonth(month: string, offset: number): string {
  if (!validInvoiceMonth(month) || !Number.isInteger(offset) || Math.abs(offset) > 1200) {
    throw new Error('Mês da fatura inválido.');
  }
  const year = Number(month.slice(0, 4));
  const part = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(year, part - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * A fatura é identificada pelo mês do seu VENCIMENTO, não pelo fechamento.
 * Se o dia de vencimento <= fechamento, vence no mês seguinte ao fechamento.
 */
export function firstInvoiceMonth(purchaseDate: string, closingDay: number, dueDay: number): string {
  if (!validDate(purchaseDate) || !validCardDay(closingDay) || !validCardDay(dueDay)) {
    throw new Error('Data ou dias do cartão inválidos.');
  }
  const month = purchaseDate.slice(0, 7);
  const boughtAfterClose = Number(purchaseDate.slice(8, 10)) > closingDay;
  const dueAfterClose = dueDay > closingDay;
  const offset = Number(boughtAfterClose) + Number(!dueAfterClose);
  return shiftInvoiceMonth(month, offset);
}

export function validCardDay(value: number): boolean {
  // Limite deliberado: 28 evita datas impossíveis em fevereiro.
  return Number.isInteger(value) && value >= 1 && value <= 28;
}

export function invoiceDueDate(month: string, day: number): string {
  if (!validInvoiceMonth(month) || !validCardDay(day)) throw new Error('Vencimento inválido.');
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Divide centavos exatamente, sem arredondamentos acumulados. */
export function splitCardInstallments(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || !Number.isInteger(count) ||
      count < 1 || count > 60 || totalCents < count) {
    throw new Error('Valor e quantidade de parcelas incompatíveis.');
  }
  const each = Math.floor(totalCents / count);
  const rest = totalCents % count;
  return Array.from({ length: count }, (_, index) => each + Number(index < rest));
}
