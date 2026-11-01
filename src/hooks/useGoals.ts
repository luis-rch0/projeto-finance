import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';
import { GoalsService } from '@/services/goalsService';
export function useGoals(): GoalsService {
  const db = useSQLiteContext();
  return useMemo(() => new GoalsService(db), [db]);
}
