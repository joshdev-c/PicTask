import { useAction, useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  parseExtractionJson,
  type ExtractionResult,
  type ExtractionTask,
} from '../../../convex/lib/extraction';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Review extracted tasks</ThemedText>
        <ThemedText themeColor="textSecondary">{error.message}</ThemedText>
        <ActionButton label="Try again" onPress={retry} />
      </SafeAreaView>
    </ThemedView>
  );
}

export default function ReviewScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: Id<'documents'> }>();

  return <ReviewContent documentId={documentId} />;
}

function ReviewContent({ documentId }: { documentId: Id<'documents'> }) {
  const document = useQuery(api.documents.get, { documentId });
  const retry = useMutation(api.documents.retry);
  const acceptSuggestions = useMutation(api.documents.acceptSuggestions);
  const runExtraction = useAction(api.extract.run);
  const [dropped, setDropped] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const extraction = parseSuggestions(document?.suggestionJson);
  const selectedIndexes = extraction
    ? extraction.tasks.map((_, index) => index).filter((index) => !dropped.includes(index))
    : [];

  const toggleSuggestion = (index: number) => {
    setDropped((previous) =>
      previous.includes(index) ? previous.filter((item) => item !== index) : [...previous, index],
    );
  };

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await retry({ documentId });
      void runExtraction({ documentId }).catch(() =>
        Alert.alert('Could not start extraction. Check your connection.'),
      );
    } catch {
      Alert.alert('Could not retry. Check your connection.');
    } finally {
      setRetrying(false);
    }
  };

  const handleAccept = async () => {
    if (selectedIndexes.length === 0 || saving) return;
    setSaving(true);
    try {
      await acceptSuggestions({ documentId, selectedIndexes });
      router.replace('/');
    } catch {
      Alert.alert('Could not save tasks. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  if (document === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle">Review extracted tasks</ThemedText>
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const pages = typeof document.pageCount === 'number' ? ` · ${document.pageCount} page(s)` : '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">{document.title}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {document.fileName}
          {pages}
        </ThemedText>
        {document.status === 'failed' ? (
          <>
            <ThemedText themeColor="textSecondary">
              {document.errorMessage ?? 'Extraction failed.'}
            </ThemedText>
            <ActionButton label="Retry" onPress={handleRetry} disabled={retrying} />
          </>
        ) : document.status !== 'ready' ? (
          <ThemedText themeColor="textSecondary">Extracting…</ThemedText>
        ) : (
          <>
            <View style={styles.details}>
              <DetailRow
                label="Amount"
                value={formatAmount(document.fields?.amount, document.fields?.currency)}
              />
              <DetailRow label="Due" value={document.fields?.dueAt} />
              <DetailRow label="Account" value={document.fields?.accountNo} />
            </View>
            {extraction?.tasks.map((task, index) => (
              <Pressable key={`${index}-${task.title}`} onPress={() => toggleSuggestion(index)}>
                <ThemedView
                  type={dropped.includes(index) ? 'background' : 'backgroundElement'}
                  style={styles.suggestion}
                >
                  <View style={styles.suggestionHeader}>
                    <ThemedText type="smallBold">{task.title}</ThemedText>
                    <ThemedText themeColor="textSecondary" type="small">
                      {dropped.includes(index) ? 'Dropped' : 'Included'}
                    </ThemedText>
                  </View>
                  {taskMeta(task) ? (
                    <ThemedText themeColor="textSecondary" type="small">
                      {taskMeta(task)}
                    </ThemedText>
                  ) : null}
                  {task.sourceQuote ? (
                    <ThemedText themeColor="textSecondary" type="small">
                      “{task.sourceQuote}”
                    </ThemedText>
                  ) : null}
                  <ThemedText themeColor="textSecondary" type="small">
                    {document.fileName}
                    {task.sourcePage ? `, p.${task.sourcePage}` : ''}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}
            <ActionButton
              label={`Add ${selectedIndexes.length} tasks to PicTask`}
              onPress={handleAccept}
              disabled={selectedIndexes.length === 0 || saving}
            />
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function parseSuggestions(suggestionJson: unknown): ExtractionResult | null {
  if (typeof suggestionJson !== 'string') return null;
  try {
    return parseExtractionJson(suggestionJson);
  } catch {
    return null;
  }
}

function formatAmount(amount: unknown, currency: unknown): string | undefined {
  if (typeof amount !== 'number') return undefined;
  return typeof currency === 'string' ? `${amount} ${currency}` : String(amount);
}

function taskMeta(task: ExtractionTask): string {
  const parts: string[] = [];
  if (typeof task.amount === 'number') parts.push(String(task.amount));
  if (typeof task.dueAt === 'string') parts.push(task.dueAt);
  return parts.join(' · ');
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null) return null;
  return (
    <View style={styles.detailRow}>
      <ThemedText themeColor="textSecondary" type="small">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{String(value)}</ThemedText>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, disabled ? styles.buttonDisabled : null]}
      onPress={onPress}
      disabled={disabled}
    >
      <ThemedText type="smallBold" style={styles.buttonText}>
        {label}
      </ThemedText>
    </Pressable>
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
  details: {
    gap: Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  suggestion: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 12,
    backgroundColor: '#208AEF',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#ffffff',
  },
});
