import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const KIND_CHIPS = [
  { value: 'document', label: 'Document' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'bill', label: 'Bill' },
  { value: 'form', label: 'Form' },
] as const;

export type ScanKind = (typeof KIND_CHIPS)[number]['value'];

export function KindChips({
  value,
  onChange,
}: {
  value: ScanKind;
  onChange: (kind: ScanKind) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {KIND_CHIPS.map((chip) => {
        const selected = chip.value === value;
        return (
          <Pressable
            key={chip.value}
            onPress={() => onChange(chip.value)}
            style={[
              styles.chip,
              { backgroundColor: theme[selected ? 'backgroundSelected' : 'backgroundElement'] },
            ]}>
            <ThemedText type="smallBold">{chip.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
  },
});
