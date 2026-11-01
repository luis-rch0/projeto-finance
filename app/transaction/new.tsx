import { useLocalSearchParams } from 'expo-router';
import { TransactionForm } from '@/features/transactions/TransactionForm';
export default function NewTransactionScreen() {
  const {type} = useLocalSearchParams<{type?: string}>();
  return <TransactionForm initialType={type==='INCOME'?'INCOME':'EXPENSE'}/>;
}
