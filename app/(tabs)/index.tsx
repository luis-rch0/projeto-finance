import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useAppTheme } from "@/hooks/useAppTheme";
import { HomeService, type HomeSnapshot } from "@/services/homeService";
import {
  MonthSwitcher,
  type SelectedMonth,
} from "@/components/finance/MonthSwitcher";
import { FinanceIcon } from "@/components/ui/FinanceIcon";
import { FinancePanel, SectionHeader } from "@/components/ui/FinancePanel";
import { formatMoney } from "@/utils/currency";
import { ReminderShortcut } from '@/components/finance/ReminderShortcut';

const thisMonth = (): SelectedMonth => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

export default function Home() {
  const db = useSQLiteContext();
  const service = useMemo(() => new HomeService(db), [db]);
  const { colors } = useAppTheme();
  const [period, setPeriod] = useState<SelectedMonth>(thisMonth);
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [quickType, setQuickType] =
  useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSnapshot(null);
      setError("");
      service
        .load(period.year, period.month)
        .then((result) => {
          if (active) setSnapshot(result);
        })
        .catch((cause) => {
          if (active)
            setError(cause instanceof Error ? cause.message : String(cause));
        });
      return () => {
        active = false;
      };
    }, [service, period.year, period.month, retry]),
  );

  const difference = snapshot
    ? snapshot.incomeCents - snapshot.expenseCents
    : 0;
  const max = Math.max(
    1,
    ...(snapshot?.history.flatMap((row) => [
      row.incomeCents,
      row.expenseCents,
    ]) ?? [1]),
  );
  const summary =
    !snapshot || snapshot.incomeCents + snapshot.expenseCents === 0
      ? "Seus lançamentos aparecerão aqui."
      : difference > 0
        ? "As receitas superaram as despesas."
        : difference < 0
          ? "As despesas superaram as receitas."
          : "Receitas e despesas estão equilibradas.";

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
    >
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text
            numberOfLines={1}
            style={[styles.greeting, { color: colors.text }]}
          >
            Olá!
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Aqui está seu panorama financeiro do mês.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/due")}
          accessibilityRole="button"
          accessibilityLabel="Ver vencimentos"
          style={[
            styles.topAction,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <FinanceIcon name="calendar" size={20} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel="Configurações"
          style={[
            styles.topAction,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <FinanceIcon name="settings" size={20} color={colors.text} />
        </Pressable>
      </View>

      <MonthSwitcher value={period} onChange={setPeriod} />
      <ReminderShortcut />
      {error ? (
        <FinancePanel>
          <Text style={{ color: colors.expense }}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}
            style={{ marginTop: 12, paddingVertical: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Tentar novamente ›</Text>
          </Pressable>
        </FinancePanel>
      ) : !snapshot ? (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginVertical: 55 }}
        />
      ) : (
        <>
          <View style={[styles.hero, { backgroundColor: colors.hero }]}>
            <View
              pointerEvents="none"
              style={[styles.glow, { backgroundColor: colors.glow }]}
            />
            <View style={styles.heroTop}>
              <Text style={styles.heroCaption}>PANORAMA DO MÊS</Text>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>Mensal</Text>
              </View>
            </View>
            <Text style={styles.heroLabel}>
              Diferença entre entradas e saídas
            </Text>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={styles.heroValue}
            >
              {difference < 0 ? "−" : difference > 0 ? "+" : ""}
              {formatMoney(Math.abs(difference))}
            </Text>
            <Text style={styles.heroFoot}>{summary}</Text>
          </View>

          <View style={styles.stats}>
            <FinancePanel style={styles.metric}>
              <View style={styles.metricTop}>
                <FinanceIcon name="income" size={20} color={colors.income} />
                <Text style={[styles.metricLabel, { color: colors.muted }]}>
                  Receitas
                </Text>
              </View>
              <Text
                style={[styles.metricValue, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatMoney(snapshot.incomeCents)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                Neste mês
              </Text>
            </FinancePanel>
            <FinancePanel style={styles.metric}>
              <View style={styles.metricTop}>
                <FinanceIcon name="expenses" size={20} color={colors.expense} />
                <Text style={[styles.metricLabel, { color: colors.muted }]}>
                  Despesas
                </Text>
              </View>
              <Text
                style={[styles.metricValue, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatMoney(snapshot.expenseCents)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                Neste mês
              </Text>
            </FinancePanel>
          </View>

          <SectionHeader
            title="Visão dos últimos meses"
            caption="Receitas e despesas • valores reais"
            actionLabel="Análises"
            onAction={() => router.push("/compare")}
          />
          <FinancePanel style={styles.chartPanel}>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View
                  style={[styles.dot, { backgroundColor: colors.income }]}
                />
                <Text style={[styles.legendText, { color: colors.muted }]}>
                  Receitas
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[styles.dot, { backgroundColor: colors.expense }]}
                />
                <Text style={[styles.legendText, { color: colors.muted }]}>
                  Despesas
                </Text>
              </View>
            </View>
            <View style={styles.chart}>
              {[0, 1, 2, 3].map((tick) => (
                <View
                  key={tick}
                  pointerEvents="none"
                  style={[
                    styles.gridLine,
                    { top: `${tick * 31}%`, backgroundColor: colors.border },
                  ]}
                />
              ))}
              {snapshot.history.map((row) => (
                <View key={row.month} style={styles.column}>
                  <View style={styles.bars}>
                    <View
                      style={[
                        styles.bar,
                        {
                          backgroundColor: colors.income,
                          height: `${Math.max(2, (row.incomeCents / max) * 100)}%`,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.bar,
                        {
                          backgroundColor: colors.expense,
                          height: `${Math.max(2, (row.expenseCents / max) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {new Date(
                      Number(row.month.slice(0, 4)),
                      Number(row.month.slice(5, 7)) - 1,
                      1,
                    )
                      .toLocaleDateString("pt-BR", { month: "short" })
                      .replace(".", "")}
                  </Text>
                </View>
              ))}
            </View>
          </FinancePanel>

          <SectionHeader
            title="Próximos vencimentos"
            caption="Compromissos aguardando confirmação"
            actionLabel="Ver todos"
            onAction={() => router.push("/due")}
          />
          <FinancePanel style={styles.duePanel}>
            {snapshot.upcoming.length === 0 ? (
              <Text style={{ color: colors.muted, lineHeight: 22 }}>
                Nenhum vencimento pendente neste mês.
              </Text>
            ) : (
              snapshot.upcoming.map((row, index) => (
                <View
                  key={row.kind + row.id}
                  style={[
                    styles.dueRow,
                    index > 0 && {
                      borderTopColor: colors.border,
                      borderTopWidth: 1,
                    },
                  ]}
                >
                  <FinanceIcon
                    name="calendar"
                    contained
                    color={colors.primary}
                    size={19}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: colors.text,
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {row.description}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {row.date.slice(8, 10)}/{row.date.slice(5, 7)} ·{" "}
                      {row.kind === "INSTALLMENT" ? "Parcela" : row.kind === "CARD_INVOICE" ? "Fatura" : "Recorrência"}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    {formatMoney(row.amountCents)}
                  </Text>
                </View>
              ))
            )}
          </FinancePanel>
        </>
      )}

      <SectionHeader title="Acesso rápido" />

      <View
        style={[
          styles.quickSelector,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {(
          [
            {
              type: "EXPENSE",
              label: "Despesa",
              icon: "expenses",
            },
            {
              type: "INCOME",
              label: "Receita",
              icon: "income",
            },
          ] as const
        ).map((item) => {
          const selected = quickType === item.type;

          return (
            <Pressable
              key={item.type}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setQuickType(item.type)}
              style={[
                styles.quickOption,
                selected && {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.primary,
                },
              ]}
            >
              <FinanceIcon
                name={item.icon}
                size={20}
                color={selected ? colors.primary : colors.muted}
              />

              <Text
                style={{
                  color: selected ? colors.primary : colors.muted,
                  fontWeight: "800",
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname: "/transaction/new",
            params: { type: quickType },
          })
        }
        style={({ pressed }) => [
          styles.primaryAction,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <FinanceIcon name="plus" color={colors.onPrimary} size={22} />

        <Text
          style={{
            color: colors.onPrimary,
            fontSize: 15,
            fontWeight: "800",
          }}
        >
          Registrar {quickType === "EXPENSE" ? "despesa" : "receita"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 130,
  },

  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  topAction: {
    borderWidth: 1,
    width: 42,
    height: 42,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  hero: {
    padding: 22,
    borderRadius: 25,
    overflow: "hidden",
    marginBottom: 12,
    minHeight: 184,
  },
  glow: {
    position: "absolute",
    right: -65,
    top: -100,
    width: 245,
    height: 245,
    borderRadius: 130,
    opacity: 0.4,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  heroCaption: {
    color: "#B5D5C4",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  heroPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#6AA58A",
    borderRadius: 30,
  },
  heroPillText: { color: "#E2FFE9", fontSize: 11, fontWeight: "700" },
  heroLabel: { color: "#D4ECE0", fontSize: 12, marginBottom: 7 },
  heroValue: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginBottom: 9,
  },
  heroFoot: { color: "#C9E7D5", fontSize: 12 },
  stats: { flexDirection: "row", gap: 11, marginBottom: 28 },
  metric: { flex: 1, padding: 15, gap: 11 },
  metricTop: { flexDirection: "row", gap: 7, alignItems: "center" },
  metricLabel: { fontSize: 12, fontWeight: "700" },
  metricValue: { fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  chartPanel: {
    paddingHorizontal: 14,
    paddingTop: 17,
    paddingBottom: 13,
    marginBottom: 26,
  },
  legend: { flexDirection: "row", gap: 18, marginBottom: 11 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: "600" },
  chart: {
    height: 166,
    flexDirection: "row",
    paddingTop: 10,
    position: "relative",
  },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1 },
  column: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  bars: {
    flex: 1,
    width: "80%",
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
  },
  bar: {
    flex: 1,
    maxWidth: 16,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 2,
  },
  duePanel: { paddingVertical: 6, marginBottom: 26 },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 12,
  },
 quickSelector: {
  flexDirection: 'row',
  gap: 10,
  marginBottom: 12,
  padding: 7,
  borderRadius: 20,
  borderWidth: 1,
},

quickOption: {
  flex: 1,
  height: 50,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 15,
  borderWidth: 1,
  borderColor: 'transparent',
},

primaryAction: {
  minHeight: 54,
  borderRadius: 17,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
},
});
