import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FinanceDateField } from '@/components/ui/FinanceDateField';
import { FinanceIcon } from '@/components/ui/FinanceIcon';
import { FinanceNotice } from '@/components/ui/FinanceNotice';
import { FinancePanel, SectionHeader } from '@/components/ui/FinancePanel';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useKeyboardBottomSpacing } from '@/hooks/useKeyboardBottomSpacing';
import { TransferService } from '@/services/transferService';
import type { AccountTransferDetail, AccountWithBalance } from '@/types/finance';
import { formatMoney, parseMoney } from '@/utils/currency';
import { displayDate, todayISO } from '@/utils/date';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function TransfersScreen() {
  const db = useSQLiteContext();
  const service = useMemo(() => new TransferService(db), [db]);
  const { colors } = useAppTheme();
  const bottomSpacing = useKeyboardBottomSpacing(85);

  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [transfers, setTransfers] = useState<AccountTransferDetail[]>([]);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = useCallback(async () => {
    const [updatedAccounts, updatedTransfers] = await Promise.all([
      service.listAccountsWithBalance(),
      service.listRecent(),
    ]);
    setAccounts(updatedAccounts);
    setTransfers(updatedTransfers);
    setFromAccountId(current =>
      updatedAccounts.some(account => account.id === current)
        ? current
        : (updatedAccounts[0]?.id ?? ''),
    );
    setToAccountId(current =>
      updatedAccounts.some(account => account.id === current)
        ? current
        : (updatedAccounts[1]?.id ?? ''),
    );
  }, [service]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    refresh()
      .catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]));

  async function saveTransfer() {
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await service.create({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount_cents: parseMoney(amount),
        date,
        description,
      });
      await refresh();
      setAmount('');
      setDescription('');
      setSuccess('Transferência registrada. As receitas e despesas não foram alteradas.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(transfer: AccountTransferDetail) {
    Alert.alert(
      'Excluir transferência?',
      `A transferência de ${formatMoney(transfer.amount_cents)} será removida dos saldos das duas contas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive', onPress: () => {
            if (busy) return;
            setBusy(true);
            setError('');
            setSuccess('');
            void service.delete(transfer.id)
              .then(refresh)
              .then(() => setSuccess('Transferência excluída.'))
              .catch(cause => setError(errorMessage(cause)))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  const inputStyle = {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    color: colors.text,
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.page, { paddingBottom: bottomSpacing }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Transferências</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Mova dinheiro entre suas contas sem registrar receita ou despesa.
        Pagamentos para outras pessoas devem ser lançados como despesas.
      </Text>

      {!!error && <FinanceNotice kind="error" message={error} onDismiss={() => setError('')} />}
      {!!success && <FinanceNotice kind="success" message={success} onDismiss={() => setSuccess('')} />}

      <SectionHeader title="Nova transferência" caption="Entre duas contas cadastradas no Finance" />
      <FinancePanel>
        {loading ? (
          <Text style={{ color: colors.muted }}>Carregando contas...</Text>
        ) : accounts.length < 2 ? (
          <Text style={{ color: colors.muted }}>
            Cadastre pelo menos duas contas em Configurações → Contas e cartões.
          </Text>
        ) : (
          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.text }]}>Conta de origem</Text>
            <View style={styles.choices}>
              {accounts.map(account => (
                <Pressable
                  key={account.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: fromAccountId === account.id }}
                  onPress={() => setFromAccountId(account.id)}
                  style={[styles.choice, {
                    backgroundColor: fromAccountId === account.id ? colors.primary : colors.surfaceAlt,
                  }]}
                >
                  <Text style={{ color: fromAccountId === account.id ? colors.onPrimary : colors.text }}>
                    {account.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Conta de destino</Text>
            <View style={styles.choices}>
              {accounts.map(account => (
                <Pressable
                  key={account.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: toAccountId === account.id }}
                  onPress={() => setToAccountId(account.id)}
                  style={[styles.choice, {
                    backgroundColor: toAccountId === account.id ? colors.primary : colors.surfaceAlt,
                  }]}
                >
                  <Text style={{ color: toAccountId === account.id ? colors.onPrimary : colors.text }}>
                    {account.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            {fromAccountId === toAccountId && (
              <Text style={{ color: colors.expense, fontSize: 12 }}>
                Selecione duas contas diferentes.
              </Text>
            )}
            <Text style={[styles.label, { color: colors.text }]}>Valor (R$)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="Ex.: 150,00"
              placeholderTextColor={colors.muted}
              style={[styles.input, inputStyle]}
            />
            <Text style={[styles.label, { color: colors.text }]}>Data</Text>
            <FinanceDateField value={date} onChange={setDate} style={inputStyle} />
            <Text style={[styles.label, { color: colors.text }]}>Descrição (opcional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={160}
              placeholder="Ex.: Reserva do mês"
              placeholderTextColor={colors.muted}
              style={[styles.input, inputStyle]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy || fromAccountId === toAccountId}
              style={[styles.action, {
                backgroundColor: colors.primary,
                opacity: busy || fromAccountId === toAccountId ? 0.6 : 1,
              }]}
              onPress={() => void saveTransfer()}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>
                {busy ? 'Salvando...' : 'Registrar transferência'}
              </Text>
            </Pressable>
          </View>
        )}
      </FinancePanel>

      <SectionHeader title="Saldo por conta" caption="Saldo calculado com base nos registros do Finance" />
      <FinancePanel>
        {accounts.map(account => (
          <View key={account.id} style={[styles.entry, { borderBottomColor: colors.border }]}>
            <Text style={[styles.entryName, { color: colors.text }]}>{account.name}</Text>
            <Text style={{ color: colors.text, fontWeight: '800' }}>
              {formatMoney(account.balance_cents)}
            </Text>
          </View>
        ))}
      </FinancePanel>

      <SectionHeader title="Últimas transferências" caption="Até 50 registros mais recentes" />
      <FinancePanel>
        {transfers.length === 0 ? (
          <Text style={{ color: colors.muted }}>Nenhuma transferência registrada.</Text>
        ) : transfers.map(transfer => (
          <View key={transfer.id} style={[styles.transfer, { borderBottomColor: colors.border }]}>
            <FinanceIcon name="arrow" color={colors.primary} size={19} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.entryName, { color: colors.text }]}>
                {transfer.from_account_name} → {transfer.to_account_name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {displayDate(transfer.date)}{transfer.description ? ` · ${transfer.description}` : ''}
              </Text>
              <Text style={{ color: colors.text, fontWeight: '800' }}>
                {formatMoney(transfer.amount_cents)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Excluir transferência"
              disabled={busy}
              onPress={() => confirmDelete(transfer)}
              style={styles.deleteButton}
            >
              <Text style={{ color: colors.expense, fontWeight: '700' }}>Excluir</Text>
            </Pressable>
          </View>
        ))}
      </FinancePanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 16, gap: 12 },
  title: { fontSize: 27, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 20, marginBottom: 8 },
  form: { gap: 10 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 25 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 46, fontSize: 15 },
  action: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  entry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, gap: 10, borderBottomWidth: 0.5 },
  entryName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  transfer: { flexDirection: 'row', gap: 10, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 0.5 },
  deleteButton: { padding: 8 },
});
