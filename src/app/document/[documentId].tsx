import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
        <ThemedText type="display">Document</ThemedText>
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

export default function DocumentScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: Id<'documents'> }>();

  return <DocumentDetail documentId={documentId} />;
}

function DocumentDetail({ documentId }: { documentId: Id<'documents'> }) {
  const theme = useTheme();
  const document = useQuery(api.documents.get, { documentId });
  const tasks = useQuery(api.tasks.listByDocument, { documentId });

  if (document === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const imageUrl = typeof document.url === 'string' ? document.url : undefined;
  const amount = formatPeso(document.fields?.amount, document.fields?.currency);
  const meta = [kindLabel(document.kind), shortDate(document.createdAt), amount]
    .filter(Boolean)
    .join(' · ');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {imageUrl ? (
            <Image source={imageUrl} style={styles.image} contentFit="cover" transition={150} />
          ) : null}

          <View style={styles.header}>
            <ThemedText type="display">{document.title}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {meta}
            </ThemedText>
          </View>

          {document.status === 'failed' ? (
            <ThemedText type="small" themeColor="danger">
              {document.errorMessage ?? 'Extraction failed.'}
            </ThemedText>
          ) : document.status !== 'ready' ? (
            <ThemedText type="smallBold" style={{ color: theme.green }}>
              Extracting…
            </ThemedText>
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.green }}>
              Ready
            </ThemedText>
          )}

          {document.fields?.dueAt || document.fields?.accountNo || document.fields?.referenceNo ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <DetailRow label="Due" value={document.fields?.dueAt} />
              <DetailRow label="Account" value={document.fields?.accountNo} />
              <DetailRow label="Reference" value={document.fields?.referenceNo} />
            </ThemedView>
          ) : null}

          {tasks && tasks.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="cardTitle">Tasks</ThemedText>
              <ThemedView type="backgroundElement" style={styles.card}>
                {tasks.map((task) => (
                  <Pressable
                    key={task._id}
                    onPress={() =>
                      router.push({ pathname: '/task/[taskId]', params: { taskId: task._id } })
                    }
                    style={({ pressed }) => (pressed ? styles.pressed : null)}
                  >
                    <View style={styles.taskRow}>
                      <ThemedText type="small" style={styles.taskTitle} numberOfLines={1}>
                        {task.title}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {task.status === 'done' ? 'Done' : 'Open'}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </ThemedView>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.brand },
              pressed ? styles.pressed : null,
            ]}
            onPress={() =>
              router.push({ pathname: '/review/[documentId]', params: { documentId } })
            }
          >
            <ThemedText type="smallBold" style={styles.buttonText}>
              Review extraction
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
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
  section: {
    gap: Spacing.two,
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
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  taskTitle: {
    flex: 1,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three + Spacing.half,
    borderRadius: Radius.lg,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
