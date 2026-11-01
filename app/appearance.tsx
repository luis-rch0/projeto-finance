import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FinancePanel, SectionHeader } from '@/components/ui/FinancePanel';
import { type ThemePreference } from '@/theme/appearance';

const choices: Array<{ key: ThemePreference; title: string; detail: string }> = [
  { key: 'system', title: 'Automático', detail: 'Acompanha a aparência do seu celular' },
  { key: 'light', title: 'Claro', detail: 'Fundo claro em todas as telas' },
  { key: 'dark', title: 'Escuro', detail: 'Visual escuro, confortável à noite' },
];

export default function AppearanceSettings() {
  const { colors, themePreference, highContrast, updateAppearance } = useAppTheme();
  const [saving, setSaving] = useState(false);

  async function save(changes: { theme?: ThemePreference; highContrast?: boolean }) {
    if (saving) return;
    setSaving(true);
    try {
      await updateAppearance(changes);
    } catch {
      Alert.alert('Não foi possível salvar', 'Tente novamente em instantes.');
    } finally {
      setSaving(false);
    }
  }

  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
    <Text style={[styles.title, { color: colors.text }]}>Aparência</Text>
    <Text style={[styles.subtitle, { color: colors.muted }]}>Deixe o Finance confortável para você.</Text>

    <SectionHeader title="Tema do aplicativo" />
    <FinancePanel style={styles.panel}>
      {choices.map((choice, i) => {
        const selected = themePreference === choice.key;
        return <Pressable key={choice.key} disabled={saving} accessibilityRole="radio"
          accessibilityState={{ checked: selected }} accessibilityLabel={choice.title}
          onPress={() => void save({ theme: choice.key })}
          style={({ pressed }) => [styles.option, i > 0 && { borderTopColor: colors.border, borderTopWidth: 1 },
            { opacity: pressed ? .65 : 1 }] }>
          <View style={styles.grow}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>{choice.title}</Text>
            <Text style={[styles.optionDetail, { color: colors.muted }]}>{choice.detail}</Text>
          </View>
          <View style={[styles.ring, { borderColor: selected ? colors.primary : colors.border }] }>
            {selected && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
          </View>
        </Pressable>;
      })}
    </FinancePanel>

    <SectionHeader title="Leitura e contraste" />
    <FinancePanel style={styles.panel}>
      <View style={styles.option}>
        <View style={styles.grow}>
          <Text style={[styles.optionTitle, { color: colors.text }]}>Contraste reforçado</Text>
          <Text style={[styles.optionDetail, { color: colors.muted }]}>Textos e contornos mais definidos.</Text>
        </View>
        <Switch accessibilityLabel="Contraste reforçado" disabled={saving}
          value={highContrast} onValueChange={value => void save({ highContrast: value })}
          trackColor={{ false: colors.track, true: colors.primary }} thumbColor={colors.surface}/>
      </View>
    </FinancePanel>
    <Text style={[styles.hint, { color: colors.muted }]}>
      O Finance também respeita o tamanho do texto configurado nas opções de acessibilidade do seu celular quando o componente permite escala de fonte.
    </Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 72 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -.5 },
  subtitle: { fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 29 },
  panel: { paddingHorizontal: 15, paddingVertical: 0, marginBottom: 28 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 74, paddingVertical: 14, gap: 14 },
  grow: { flex: 1, gap: 5 },
  optionTitle: { fontSize: 15, fontWeight: '800' },
  optionDetail: { fontSize: 12, lineHeight: 18 },
  ring: { width: 23, height: 23, borderWidth: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 11, height: 11, borderRadius: 6 },
  hint: { fontSize: 12, lineHeight: 19, marginTop: -8 },
});
