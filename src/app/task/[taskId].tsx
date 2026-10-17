import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { formatPeso } from '@/lib/format';

import type { Id } from '../../../convex/_generated/dataModel';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="display">Task</ThemedText>
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

export default function TaskScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: Id<'tasks'> }>();

  return <TaskDetail taskId={taskId} />;
}

function TaskDetail({ taskId }: { taskId: Id<'tasks'> }) {
  const theme = useTheme();
  const task = useQuery(api.tasks.get, { taskId });
  const document = useQuery(api.documents.get, task ? { documentId: task.documentId } : 'skip');
  const complete = useMutation(api.tasks.complete);
  const [completing, setCompleting] = useState(false);

  if (task === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const done = task.status === 'done';
  const amount = formatPeso(task.amount, task.currency);
  const due = shortDate(task.dueAt);
  const imageUrl = typeof document?.url === 'string' ? document.url : undefined;

  const handleComplete = async () => {
    if (completing || done) return;
    setCompleting(true);
    try {
      await complete({ taskId });
    } catch {
      Alert.alert('Could not mark task done. Check your connection.');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {imageUrl ? (
            <Image source={imageUrl} style={styles.image} contentFit="cover" transition={150} />
          ) : null}

          <View style={styles.header}>
            <View style={styles.headerRow}>
              <ThemedText type="heading" style={styles.title}>
                {task.title}
              </ThemedText>
              {done ? (
                <View style={[styles.chip, { backgroundColor: theme.brandTint }]}>
                  <ThemedText type="caption" themeColor="brand" style={styles.chipText}>
                    Done
                  </ThemedText>
                </View>
              ) : null}
            </View>
            {document ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {sourceLine(document.fileName, task.sourcePage)}
              </ThemedText>
            ) : null}
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <DetailRow label="Amount" value={amount} />
            <DetailRow label="Due" value={due} />
          </ThemedView>

          {task.sourceQuote ? (
            <View style={[styles.quote, { backgroundColor: theme.amberSurface }]}>
              <ThemedText type="small" style={{ color: theme.amberInk }}>
                “{task.sourceQuote}”
              </ThemedText>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.brand },
              done ? styles.buttonDisabled : null,
              pressed && !done ? styles.pressed : null,
            ]}
            onPress={handleComplete}
            disabled={done || completing}
          >
            <ThemedText type="smallBold" style={styles.buttonText}>
              {done ? 'Done' : completing ? 'Marking done…' : 'Mark as done'}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function shortDate(ms?: number): string {
  if (typeof ms !== 'number') return '';
  return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function sourceLine(fileName: string, sourcePage?: number): string {
  const page = typeof sourcePage === 'number' ? `, p.${sourcePage}` : '';
  return `Source · ${fileName}${page}`;
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
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
    paddingBottom: Spacing.five,
  },
  image: {
    width: '100%',
    height: 240,
    borderRadius: Radius.lg,
  },
  header: {
    gap: Spacing.one,
  },
  headerRow: {
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
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  quote: {
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three + Spacing.half,
    borderRadius: Radius.lg,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
