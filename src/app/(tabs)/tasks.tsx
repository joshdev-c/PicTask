import { useQuery } from 'convex/react';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgendaCard } from '@/components/pictask/agenda-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import type { AgendaItem } from '../../../convex/lib/agenda';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="display">Tasks</ThemedText>
        <ThemedText themeColor="textSecondary">{error.message}</ThemedText>
        <Pressable onPress={retry}>
          <ThemedText type="smallBold" themeColor="brand">
            Try again
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function TasksScreen() {
  const agenda = useQuery(api.tasks.agenda, {});

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="display">Tasks</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {agenda === undefined
                ? 'Loading…'
                : agenda.length === 0
                  ? 'Nothing open'
                  : `${agenda.length} open item${agenda.length === 1 ? '' : 's'}`}
            </ThemedText>
          </View>
          {agenda !== undefined && agenda.length > 0 ? (
            <View style={styles.list}>
              {agenda.map((item: AgendaItem) => (
                <AgendaCard
                  key={item.kind === 'task' ? item.taskId : item.workflowId}
                  item={item}
                  onPress={() => openItem(item)}
                />
              ))}
            </View>
          ) : null}
          {agenda !== undefined && agenda.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nothing due. Scan a document to get started.
            </ThemedText>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function openItem(item: AgendaItem) {
  if (item.kind === 'task') {
    router.push({ pathname: '/task/[taskId]', params: { taskId: item.taskId } });
  } else {
    router.push({ pathname: '/workflow/[workflowId]', params: { workflowId: item.workflowId } });
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  header: {
    gap: Spacing.one,
  },
  list: {
    gap: Spacing.three,
  },
});
