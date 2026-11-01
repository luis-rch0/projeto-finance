import { useLocalSearchParams } from 'expo-router';
import { MovementHistoryScreen } from '@/features/movements/MovementHistoryScreen';
import { parseMovementRouteParams } from '@/features/movements/routeParams';

export default function HistoryRoute() {
  const params = useLocalSearchParams<{ type?: string; year?: string; month?: string; categoryId?: string }>();
  const { type, period, categoryId } = parseMovementRouteParams(params);
  return <MovementHistoryScreen type={type} initialPeriod={period} initialCategoryId={categoryId} />;
}
