import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AnalyticsService, type AnalyticsSnapshot } from '@/services/analyticsService';
import { AnalyticsTrendChart } from '@/components/finance/AnalyticsTrendChart';
import { FinancePanel, SectionHeader } from '@/components/ui/FinancePanel';
import { MonthSwitcher, type SelectedMonth } from '@/components/finance/MonthSwitcher';
import { categorySymbol } from '@/features/categories/categoryStats';
import { formatMoney } from '@/utils/currency';
import { signedPercent } from '@/utils/analytics';
import { ConsumptionService, type ConsumptionSnapshot } from '@/services/consumptionService';

function currentMonth(): SelectedMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

type PeriodMonths = 3 | 6 | 12;

export default function AnalyticsScreen() {
  const db = useSQLiteContext();
  const analytics = useMemo(() => new AnalyticsService(db), [db]);
  const { colors } = useAppTheme();
  const consumptionService=useMemo(()=>new ConsumptionService(db),[db]);
  const [view,setView]=useState<'CASH'|'CONSUMPTION'>('CASH');
  const [consumption,setConsumption]=useState<ConsumptionSnapshot|null>(null);
  const [period, setPeriod] = useState<SelectedMonth>(currentMonth);
  const [months, setMonths] = useState<PeriodMonths>(6);
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [error, setError] = useState('');
  const [consumptionError,setConsumptionError] = useState('');
  const [consumptionRevision,setConsumptionRevision] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setData(null);
    setError('');
    analytics.load(period.year, period.month, months)
      .then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [analytics, period.year, period.month, months]));

  useFocusEffect(useCallback(()=>{
    let active=true;
    setConsumption(null);
    setConsumptionError('');
    consumptionService.load(period.year,period.month)
      .then(value=>{if(active)setConsumption(value);})
      .catch(cause=>{if(active)setConsumptionError(cause instanceof Error?cause.message:String(cause));});
    return()=>{active=false;};
  },[consumptionService,period.year,period.month,consumptionRevision]));
  const current = data?.current;
  const isEmpty = current?.incomeCount === 0 && current?.expenseCount === 0;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <Text style={[styles.title, { color: colors.text }]}>Análises</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Entenda as tendências do seu dinheiro, mês a mês.</Text>
      <MonthSwitcher value={period} onChange={setPeriod} />
      <View style={styles.periodSelector}>
        {([['CASH','Movimentação'],['CONSUMPTION','Consumo']] as const).map(([key,title])=><Pressable key={key}
          accessibilityRole="button" accessibilityState={{selected:view===key}} onPress={()=>setView(key)}
          style={[styles.viewTab,{borderColor:view===key?colors.primary:colors.border,
            backgroundColor:view===key?colors.surfaceAlt:colors.surface}]}>
          <Text style={{color:view===key?colors.primary:colors.text,fontWeight:'800',textAlign:'center'}}>{title}</Text>
        </Pressable>)}
      </View>
      {view==='CONSUMPTION' ? (consumptionError ? <FinancePanel>
        <Text style={{color:colors.expense}}>{consumptionError}</Text>
        <Pressable accessibilityRole="button" onPress={()=>setConsumptionRevision(n=>n+1)} style={{paddingVertical:12}}>
          <Text style={{color:colors.primary,fontWeight:'700'}}>Tentar novamente</Text>
        </Pressable>
      </FinancePanel> : !consumption ? <ActivityIndicator color={colors.primary} style={{marginTop:32}}/> : <>
        <View style={[styles.hero,{backgroundColor:colors.hero}]}>
          <Text style={styles.heroOverline}>CONSUMO DO MÊS</Text>
          <Text style={styles.heroCaption}>Compras e despesas pela data da compra</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.heroValue}>{formatMoney(consumption.totalCents)}</Text>
          <Text style={styles.heroHelp}>{consumption.count} lançamentos · Sem somar pagamento de fatura</Text>
        </View>
        <SectionHeader title="Consumo por categoria" caption="Inclui crédito, débito, dinheiro e Pix" />
        <FinancePanel style={styles.categoryPanel}>
          {!consumption.categories.length && <Text style={{color:colors.muted}}>Nenhuma compra no período.</Text>}
          {consumption.categories.map(c=><View key={c.id} style={styles.categoryRow}>
            <Text style={styles.categoryIcon}>{c.icon}</Text>
            <View style={{flex:1,gap:7}}>
              <View style={styles.categoryNameRow}><Text style={[styles.categoryName,{color:colors.text}]}>{c.name}</Text>
                <Text style={{color:colors.text,fontWeight:'800'}}>{formatMoney(c.amountCents)}</Text></View>
              <View style={[styles.track,{backgroundColor:colors.track}]}>
                <View style={[styles.fill,{backgroundColor:colors.primary,
                  width:`${consumption.totalCents>0?c.amountCents/consumption.totalCents*100:0}%`}]}/>
              </View>
              <Text style={{fontSize:11,color:colors.muted}}>{c.count} lançamentos</Text>
            </View>
          </View>)}
        </FinancePanel>
        <Text style={[styles.note,{color:colors.muted}]}>Compras no cartão aparecem no mês em que foram realizadas. A fatura paga aparece somente em Movimentação.</Text>
      </>) : null}

      {view==='CASH' && (error ? (
        <FinancePanel><Text style={{ color: colors.expense }}>{error}</Text></FinancePanel>
      ) : !data ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={[styles.hero, { backgroundColor: colors.hero }]}>
            <Text style={styles.heroOverline}>RESULTADO DO MÊS</Text>
            <Text style={styles.heroCaption}>Receitas menos despesas confirmadas</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroValue}>
              {data.differenceCents > 0 ? '+' : data.differenceCents < 0 ? '−' : ''}
              {formatMoney(Math.abs(data.differenceCents))}
            </Text>
            <Text style={styles.heroHelp}>{isEmpty ? 'Nenhum lançamento confirmado neste mês.'
              : data.differenceCents >= 0 ? 'Resultado mensal não negativo.' : 'Despesas acima das receitas.'}</Text>
          </View>

          <SectionHeader title="Comparação mensal" caption="Em relação ao mês anterior" />
          <View style={styles.twoColumns}>
            <FinancePanel style={styles.metric}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Receitas</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricAmount, { color: colors.text }]}>
                {formatMoney(data.current.incomeCents)}
              </Text>
              <Text style={[styles.metricChange, { color: colors.income }]}>
                {signedPercent(data.incomeChangePercent)}
              </Text>
            </FinancePanel>
            <FinancePanel style={styles.metric}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Despesas</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricAmount, { color: colors.text }]}>
                {formatMoney(data.current.expenseCents)}
              </Text>
              <Text style={[styles.metricChange, { color: data.expenseChangePercent !== null && data.expenseChangePercent > 0
                ? colors.expense : colors.income }]}>
                {signedPercent(data.expenseChangePercent)}
              </Text>
            </FinancePanel>
          </View>

          <SectionHeader title="Evolução financeira" caption="Entradas e saídas confirmadas" />
          <FinancePanel style={styles.chartPanel}>
            <View style={styles.periodSelector}>
              {([3, 6, 12] as const).map(option => (
                <Pressable key={option} onPress={() => setMonths(option)} accessibilityRole="button"
                  accessibilityState={{ selected: option === months }}
                  style={[styles.periodButton, { backgroundColor: option === months ? colors.surfaceAlt : 'transparent',
                    borderColor: option === months ? colors.primary : colors.border }]}>
                  <Text style={{ color: option === months ? colors.primary : colors.muted, fontWeight: '800', fontSize: 12 }}>
                    {option}M
                  </Text>
                </Pressable>
              ))}
            </View>
            <AnalyticsTrendChart rows={data.trend} />
            <Text style={[styles.note, { color: colors.muted }]}>Parcelamentos e recorrências pendentes não são contabilizados.</Text>
          </FinancePanel>

          <SectionHeader title="Saídas por categoria (caixa)" caption="Inclui pagamentos de faturas; para compras, use Consumo" />
          <FinancePanel style={styles.categoryPanel}>
            {data.expenseCategories.length === 0 ? (
              <Text style={{ color: colors.muted }}>Sem despesas registradas neste mês.</Text>
            ) : (
              <>
                {data.expenseCategories.map(category => (
                  <View key={category.id} style={styles.categoryRow}>
                    <Text style={styles.categoryIcon}>{categorySymbol({
                      type: 'EXPENSE', name: category.name, icon: category.icon,
                    })}</Text>
                    <View style={{ flex: 1, gap: 5 }}>
                      <View style={styles.categoryNameRow}>
                        <Text numberOfLines={1} style={[styles.categoryName, { color: colors.text }]}>{category.name}</Text>
                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>
                          {formatMoney(category.amountCents)}
                        </Text>
                      </View>
                      <View style={[styles.track, { backgroundColor: colors.track }]}>
                        <View style={[styles.fill, { width: `${Math.min(100, category.percent)}%`, backgroundColor: colors.primary }]} />
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>
                        {category.percent.toFixed(1).replace('.', ',')}% · {category.count} lançamentos
                      </Text>
                    </View>
                  </View>
                ))}
                {data.otherExpenseCents > 0 && (
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
                    Outras categorias: {formatMoney(data.otherExpenseCents)}
                  </Text>
                )}
              </>
            )}
          </FinancePanel>

          <SectionHeader title="Atenção aos limites" caption="Orçamentos perto ou acima do máximo" />
          <FinancePanel style={{ marginBottom: 22 }}>
            {data.budgetWarnings.length === 0 ? (
              <Text style={{ color: colors.muted, lineHeight: 20 }}>
                Nenhum orçamento acima de 80% no mês selecionado.
              </Text>
            ) : data.budgetWarnings.map(budget => (
              <View key={budget.id} style={styles.budgetRow}>
                <View style={styles.categoryNameRow}>
                  <Text numberOfLines={1} style={[styles.categoryName, { color: colors.text }]}>{budget.categoryName}</Text>
                  <Text style={{ color: budget.level === 'EXCEEDED' ? colors.expense : colors.warning,
                    fontWeight: '800', fontSize: 12 }}>
                    {budget.percent.toFixed(0)}%
                  </Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {formatMoney(budget.spentCents)} de {formatMoney(budget.limitCents)}
                </Text>
              </View>
            ))}
          </FinancePanel>
        </>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 128 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.6, marginBottom: 5 },
  subtitle: { fontSize: 13, marginBottom: 20, lineHeight: 19 },
  hero: { padding: 22, borderRadius: 24, marginBottom: 26, overflow: 'hidden' },
  heroOverline: { color: '#B6E9D1', fontSize: 11, letterSpacing: 1.1, fontWeight: '800', marginBottom: 14 },
  heroCaption: { color: '#D8F2E3', fontSize: 12, marginBottom: 8 },
  heroValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginBottom: 9 },
  heroHelp: { color: '#D1EEDD', fontSize: 12, lineHeight: 18 },
  twoColumns: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  metric: { flex: 1, minWidth: 0, padding: 14, gap: 8 },
  metricAmount: { fontSize: 19, fontWeight: '900' },
  metricChange: { fontSize: 11, fontWeight: '800' },
  chartPanel: { marginBottom: 27, padding: 14 },
  periodSelector: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  viewTab:{flex:1,paddingVertical:12,paddingHorizontal:6,borderRadius:13,borderWidth:1},
  periodButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  note: { marginTop: 12, fontSize: 11, lineHeight: 16 },
  categoryPanel: { marginBottom: 27 },
  categoryRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 19 },
  categoryIcon: { fontSize: 21, width: 30, textAlign: 'center' },
  categoryNameRow: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  categoryName: { flex: 1, fontSize: 13, fontWeight: '700' },
  track: { height: 6, borderRadius: 9, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 9 },
  budgetRow: { gap: 6, marginBottom: 16 },
});
