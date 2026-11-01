import { useLocalSearchParams } from 'expo-router';
import { TransactionForm } from '@/features/transactions/TransactionForm';
export default function EditTransactionScreen() {
  const {id} = useLocalSearchParams<{id:string}>();
  return <TransactionForm id={id}/>;
}
