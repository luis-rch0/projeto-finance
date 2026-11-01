import { useLocalSearchParams } from 'expo-router';
import { MovementCategoriesScreen } from '@/features/movements/MovementCategoriesScreen';
import { parseMovementRouteParams } from '@/features/movements/routeParams';

export default function CategoriesRoute() {
  const params = useLocalSearchParams<{ type?: string; year?: string; month?: string }>();
  const { type, period } = parseMovementRouteParams(params);
  return <MovementCategoriesScreen type={type} initialPeriod={period} />;
}
