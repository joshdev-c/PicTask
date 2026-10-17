import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';

export function ScanFab() {
  return (
    <Pressable style={styles.fab} onPress={() => router.push('/scan')}>
      <ThemedText type="smallBold" style={styles.label}>
        Scan
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: BottomTabInset + Spacing.four,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
    backgroundColor: '#208AEF',
  },
  label: {
    color: '#ffffff',
  },
});
