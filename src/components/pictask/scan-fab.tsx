import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ScanFab() {
  const theme = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: theme.brand, shadowColor: theme.brand },
        pressed ? styles.pressed : null,
      ]}
      onPress={() => router.push('/scan')}
    >
      <ThemedText type="smallBold" style={styles.label}>
        Scan
      </ThemedText>
    </Pressable>
  );
}

// Thinking of changing to camera icon and circle
const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    ...Shadow.card,
    shadowOpacity: 0.22,
    elevation: 6,
  },
  pressed: {
    opacity: 0.9,
  },
  label: {
    color: '#ffffff',
  },
});
