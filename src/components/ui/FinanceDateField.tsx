import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { displayDate } from '@/utils/date';

/** Campo brasileiro DD/MM/AAAA. O estado externo permanece no formato ISO usado pelo SQLite. */
export function dateDigitsToISO(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

export function maskBrazilianDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function displayValue(value: string): string {
  if (!value) return '';
  // Exibe datas completas mesmo quando inválidas, sem corrigir silenciosamente.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return displayDate(value);
  return maskBrazilianDate(value);
}

interface FinanceDateFieldProps {
  value: string;
  onChange: (iso: string) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  accessibilityLabel?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function FinanceDateField({ value, onChange, style, placeholder='DD/MM/AAAA', accessibilityLabel='Data, dia mês e ano', onFocus, onBlur }: FinanceDateFieldProps) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(() => displayValue(value));
  const lastEmitted = useRef<string | null>(null);
  useEffect(() => {
    // Não descarta o texto em edição ao receber de volta o valor enviado pelo campo.
    if (value !== lastEmitted.current) setDraft(displayValue(value));
  }, [value]);
  function change(text: string) {
    const nextDraft = maskBrazilianDate(text);
    // Texto parcial nunca vira uma data opcional vazia: o serviço precisa rejeitá-lo ao salvar.
    const iso = nextDraft ? (dateDigitsToISO(nextDraft) || 'INVALID_DATE') : '';
    lastEmitted.current = iso;
    setDraft(nextDraft);
    onChange(iso);
  }
  return <TextInput
    accessibilityLabel={accessibilityLabel}
    value={draft}
    onChangeText={change}
    onFocus={onFocus}
    onBlur={onBlur}
    keyboardType="number-pad"
    maxLength={10}
    placeholder={placeholder}
    placeholderTextColor={colors.muted}
    style={[styles.input, {color:colors.text,backgroundColor:colors.surface,borderColor:colors.border},style]}
  />;
}

const styles = StyleSheet.create({input:{borderWidth:1,borderRadius:12,padding:14,fontSize:16}});
