import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';
import { FinanceService } from '@/services/financeService';
export function useFinance(): FinanceService {
  const db=useSQLiteContext();
  return useMemo(()=>new FinanceService(db),[db]);
}
