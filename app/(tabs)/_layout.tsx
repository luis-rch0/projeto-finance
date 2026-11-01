
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { useAppTheme } from '@/hooks/useAppTheme';
import {
  FinanceIcon,
  type IconName,
} from '@/components/ui/FinanceIcon';

const destinations = [
  { name: 'index', title: 'Início', icon: 'home' },
  { name: 'expenses', title: 'Despesas', icon: 'expenses' },
  { name: 'income', title: 'Receitas', icon: 'income' },
  { name: 'goals', title: 'Metas', icon: 'goals' },
  { name: 'compare', title: 'Análises', icon: 'analysis' },
] as const;

export default function TabLayout() {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView
      edges={['top']}
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarHideOnKeyboard: true,
          tabBarStyle: [
            styles.tabBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              marginBottom: Math.max(insets.bottom, 8),
              shadowColor:
                scheme === 'dark' ? '#000000' : '#235A40',
            },
          ],
          tabBarItemStyle: styles.tabItem,
          tabBarLabelStyle: styles.label,
          tabBarIconStyle: styles.icon,
        }}
      >
        {destinations.map((item) => (
          <Tabs.Screen
            key={item.name}
            name={item.name}
            options={{
              title: item.title,
              tabBarIcon: ({ focused, color }) => (
                <View
                  style={[
                    styles.indicator,
                    focused && {
                      backgroundColor: colors.surfaceAlt,
                    },
                  ]}
                >
                  <FinanceIcon
                    name={item.icon as IconName}
                    color={color}
                    size={22}
                  />
                </View>
              ),
            }}
          />
        ))}
      </Tabs>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    borderWidth: 1,
    borderRadius: 24,
    height: 72,
    marginHorizontal: 12,
    position: 'absolute',
    paddingTop: 6,
    paddingBottom: 7,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  tabItem: {
    paddingTop: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 0,
  },
  icon: {
    marginTop: 0,
  },
  indicator: {
    width: 44,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
});
