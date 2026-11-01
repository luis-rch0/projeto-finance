import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { SavingsGoalsScreen } from '@/features/goals/SavingsGoalsScreen';
import { BudgetsScreen } from '@/features/goals/BudgetsScreen';
import { FinanceIcon } from '@/components/ui/FinanceIcon';

type GoalTab = 'savings' | 'budgets';
export default function Goals() {
  const { colors } = useAppTheme();
  const keyboardBottom = useKeyboardBottomSpacing(122);
  const [tab, setTab] = useState<GoalTab>('savings');
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.page,{paddingBottom:keyboardBottom}]}
    keyboardShouldPersistTaps="handled">
    <View style={styles.intro}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[styles.heading, { color: colors.text }]}>Suas metas</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Planeje seus próximos passos.</Text>
      </View>
      <FinanceIcon name="goals" size={23} contained />
    </View>
    <View style={[styles.switcher, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {([{ key: 'savings', name: 'Objetivos' }, { key: 'budgets', name: 'Limites mensais' }] as const)
        .map(item => <Pressable key={item.key} accessibilityRole="button"
          accessibilityState={{ selected: tab === item.key }} onPress={() => setTab(item.key)}
          style={[styles.segment, tab === item.key && { backgroundColor: colors.primary }]}>
          <Text style={{ color: tab === item.key ? colors.onPrimary : colors.muted, fontWeight: '800', fontSize: 13 }}>
            {item.name}
          </Text>
        </Pressable>)}
    </View>
    {tab === 'savings' ? <SavingsGoalsScreen /> : <BudgetsScreen />}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 25, paddingBottom: 122 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 23 },
  heading: { fontSize: 29, fontWeight: '900', letterSpacing: -.7 },
  switcher: { flexDirection: 'row', borderWidth: 1, padding: 5, borderRadius: 18, marginBottom: 23 },
  segment: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 14 },
});
