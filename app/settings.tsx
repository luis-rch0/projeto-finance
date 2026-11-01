import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FinanceIcon, type IconName } from '@/components/ui/FinanceIcon';
import { FinancePanel, SectionHeader } from '@/components/ui/FinancePanel';

type MenuEntry = { title: string; detail: string; href: Href; icon: IconName };

const preferences: MenuEntry[] = [
  { title: 'Aparência', detail: 'Tema e contraste', href: '/appearance', icon: 'settings' },
  { title: 'Lembretes', detail: 'Avisos de contas e parcelas', href: '/notifications', icon: 'calendar' },
];
const finances: MenuEntry[] = [
  { title: 'Transferências', detail: 'Movimente dinheiro entre contas', href: '/transfers', icon: 'repeat' },
  { title: 'Contas e cartões', detail: 'Bancos, débito, crédito e faturas', href: '/accounts', icon: 'card' },
  { title: 'Categorias', detail: 'Organize seus lançamentos', href: '/categories', icon: 'category' },
  { title: 'Backup e restauração', detail: 'Proteja seus registros', href: '/backup', icon: 'history' },
  { title: 'Exportar dados', detail: 'Arquivo CSV para planilhas', href: '/export', icon: 'analysis' },
];

function Menu({ items }: { items: MenuEntry[] }) {
  const { colors } = useAppTheme();
  return <FinancePanel style={styles.menu}>
    {items.map((item, index) => <Pressable key={item.title} onPress={() => router.push(item.href)}
      accessibilityRole="button" accessibilityLabel={item.title}
      style={({ pressed }) => [styles.menuRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 },
        { opacity: pressed ? .7 : 1 }]}>
      <FinanceIcon name={item.icon} size={18} contained />
      <View style={styles.grow}>
        <Text style={[styles.menuTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.menuDetail, { color: colors.muted }]}>{item.detail}</Text>
      </View>
      <FinanceIcon name="chevron" size={20} color={colors.muted} />
    </Pressable>)}
  </FinancePanel>;
}

export default function Settings() {
  const { colors } = useAppTheme();
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
    <Text style={[styles.title, { color: colors.text }]}>Configurações</Text>
    <Text style={[styles.subtitle, { color: colors.muted }]}>Um Finance do seu jeito.</Text>

    <SectionHeader title="Preferências" />
    <Menu items={preferences} />

    <SectionHeader title="Organização e dados" />
    <Menu items={finances} />

    <SectionHeader title="Sobre" />
    <FinancePanel style={styles.about}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Finance</Text>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>
        Versão {Constants.expoConfig?.version ?? '2.4.0'}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
        Suas informações permanecem armazenadas no dispositivo. Faça backups regularmente para mantê-las seguras.
      </Text>
    </FinancePanel>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 78 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -.6 },
  subtitle: { marginTop: 7, marginBottom: 28, fontSize: 13, lineHeight: 20 },
  menu: { paddingHorizontal: 15, paddingVertical: 0, marginBottom: 27 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, paddingVertical: 13 },
  menuTitle: { fontWeight: '800', fontSize: 14 },
  menuDetail: { fontSize: 12, marginTop: 4 },
  grow: { flex: 1 },
  about: { marginBottom: 10 },
});
