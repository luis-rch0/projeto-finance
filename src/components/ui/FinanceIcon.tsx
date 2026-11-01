
import type { ComponentProps } from 'react';

import Ionicons from '@expo/vector-icons/Ionicons';

import {
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';

export type IconName =
  | 'home'
  | 'expenses'
  | 'income'
  | 'goals'
  | 'analysis'
  | 'settings'
  | 'calendar'
  | 'search'
  | 'category'
  | 'plus'
  | 'chevron'
  | 'repeat'
  | 'card'
  | 'history'
  | 'arrow';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const icons: Record<IconName, IoniconName> = {
  home: 'home-outline',
  expenses: 'arrow-up-circle-outline',
  income: 'arrow-down-circle-outline',
  goals: 'flag-outline',
  analysis: 'stats-chart-outline',
  settings: 'settings-outline',
  calendar: 'calendar-outline',
  search: 'search-outline',
  category: 'grid-outline',
  plus: 'add-outline',
  chevron: 'chevron-forward',
  repeat: 'repeat-outline',
  card: 'card-outline',
  history: 'time-outline',
  arrow: 'arrow-forward-outline',
};

interface FinanceIconProps {
  name: IconName;
  color?: ColorValue;
  size?: number;
  contained?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function FinanceIcon({
  name,
  color,
  size = 21,
  contained = false,
  style,
}: FinanceIconProps) {
  const { colors } = useAppTheme();

  const dimension = contained ? size * 1.95 : size + 4;

  return (
    <View
      style={[
        styles.icon,
        {
          width: dimension,
          height: dimension,
        },
        contained && {
          borderRadius: size * 0.66,
          backgroundColor: colors.surfaceAlt,
        },
        style,
      ]}
    >
      <Ionicons
        name={icons[name]}
        size={size}
        color={color ?? colors.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
