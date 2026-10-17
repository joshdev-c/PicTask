import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDue, formatPeso, formatRelativeDue } from '@/lib/format';

import type { AgendaItem } from '../../../convex/lib/agenda';

export function AgendaCard({ item, onPress }: { item: AgendaItem; onPress?: () => void }) {
  const theme = useTheme();
  const attention = item.urgency === 'dueSoon';
  const meta = metaLineFor(item);

  const card = (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="cardTitle" style={styles.title}>
          {item.title}
        </ThemedText>
        <View
          style={[
            styles.chip,
            { backgroundColor: attention ? theme.amberSurface : theme.brandTint },
          ]}>
          <ThemedText
            type="caption"
            themeColor={attention ? 'amberInk' : 'brand'}
            style={styles.chipText}>
            {chipLabelFor(item)}
          </ThemedText>
        </View>
      </View>
      {meta ? (
        <ThemedText type="small" themeColor="textSecondary">
          {meta}
        </ThemedText>
      ) : null}
      {item.sourceName ? (
        <ThemedText type="caption" themeColor="brand" numberOfLines={1}>
          {item.sourceName}
        </ThemedText>
      ) : null}
    </ThemedView>
  );

  if (!onPress) return card;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {card}
    </Pressable>
  );
}

function chipLabelFor(item: AgendaItem): string {
  if (item.kind === 'workflow') return 'Workflow';
  return formatRelativeDue(item.dueAt) || 'Open';
}

function metaLineFor(item: AgendaItem): string {
  const due = formatDue(item.dueAt);
  const detail =
    item.kind === 'workflow'
      ? `Step ${item.currentIndex + 1} of ${item.totalCount}`
      : formatPeso(item.amount, item.currency);
  return [due, detail].filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  pressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Radius.pill,
  },
  chipText: {
    fontWeight: '700',
  },
});
