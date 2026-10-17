import { useQuery } from 'convex/react';
import { type ErrorBoundaryProps } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScanFab } from '@/components/pictask/scan-fab';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import type { AgendaItem } from '../../../convex/lib/agenda';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Today</ThemedText>
        <ThemedText themeColor="textSecondary">{error.message}</ThemedText>
        <Pressable onPress={retry}>
          <ThemedText type="linkPrimary">Try again</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function TodayScreen() {
  const agenda = useQuery(api.tasks.agenda, {});

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Today</ThemedText>
        {agenda === undefined ? (
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        ) : agenda.length === 0 ? (
          <ThemedText themeColor="textSecondary">
            Nothing due. Scan a document to get started.
          </ThemedText>
        ) : (
          agenda.map((item: AgendaItem) => (
            <ThemedText key={item.kind === 'task' ? item.taskId : item.workflowId}>
              {item.title}
            </ThemedText>
          ))
        )}
      </SafeAreaView>
      <ScanFab />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
});
