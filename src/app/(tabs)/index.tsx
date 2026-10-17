import { useQuery } from 'convex/react';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgendaCard } from '@/components/pictask/agenda-card';
import { ScanFab } from '@/components/pictask/scan-fab';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import type { AgendaItem } from '../../../convex/lib/agenda';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="display">Today</ThemedText>
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

export default function TodayScreen() {
  const agenda = useQuery(api.tasks.agenda, {});
  const theme = useTheme();
  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            {/* ADD LOGO */}
            <ThemedText
              type="cardTitle"
              style={[
                styles.brand,
                { color: theme.brand },
                { fontSize: 36 },
                { fontWeight: 'bold' },
                { marginTop: Spacing.two },
              ]}
            >
              PicTask
            </ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.four }}>
              {today}
            </ThemedText>

            <ThemedText type="display" style={{ marginTop: Spacing.one }}>
              {agenda === undefined
                ? 'Loading…'
                : agenda.length === 0
                  ? 'All clear'
                  : `${agenda.length} task${agenda.length === 1 ? '' : 's'} need attention`}
            </ThemedText>
          </View>
          {agenda !== undefined && agenda.length > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <ThemedText type="heading">Due soon</ThemedText>
                <Pressable onPress={() => router.push('/tasks')}>
                  <ThemedText type="smallBold" themeColor="brand">
                    See all
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.list}>
                {agenda.map((item: AgendaItem) => (
                  <AgendaCard
                    key={item.kind === 'task' ? item.taskId : item.workflowId}
                    item={item}
                    onPress={() => openItem(item)}
                  />
                ))}
              </View>
            </>
          ) : null}
          {agenda !== undefined && agenda.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nothing due. Scan a document to get started.
            </ThemedText>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <ScanFab />
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
  brand: {
    fontSize: 22,
    lineHeight: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
});
