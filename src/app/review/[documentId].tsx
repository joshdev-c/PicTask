import { useAction, useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
        <ThemedText type="heading">Review extracted tasks</ThemedText>
        <ThemedText themeColor="textSecondary">{error.message}</ThemedText>
        <PrimaryButton label="Try again" onPress={retry} />
      </SafeAreaView>
    </ThemedView>
  );
}

export default function ReviewScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: Id<'documents'> }>();

  return <ReviewContent documentId={documentId} />;
}

function ReviewContent({ documentId }: { documentId: Id<'documents'> }) {
  const theme = useTheme();
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
          <ThemedText type="heading">Review extracted tasks</ThemedText>
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const pages = typeof document.pageCount === 'number' ? ` · ${document.pageCount} page(s)` : '';
  const details = detailRowsFor(document.fields);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="heading">{document.title}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {document.fileName}
              {pages}
            </ThemedText>
          </View>

          {document.status === 'failed' ? (
            <View style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary">
                {document.errorMessage ?? 'Extraction failed.'}
              </ThemedText>
              <PrimaryButton label="Retry" onPress={handleRetry} disabled={retrying} />
            </View>
          ) : document.status !== 'ready' ? (
            <ThemedText type="small" themeColor="textSecondary">
              Extracting…
            </ThemedText>
          ) : (
            <>
              <ThemedText type="smallBold" style={{ color: theme.green }}>
                {details.length} detail{details.length === 1 ? '' : 's'} found
              </ThemedText>

              {details.length > 0 ? (
                <View style={styles.section}>
                  <ThemedText type="cardTitle">Detected details</ThemedText>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    {details.map((row) => (
                      <DetailRow key={row.label} label={row.label} value={row.value} />
                    ))}
                  </ThemedView>
                </View>
              ) : null}

              {extraction && extraction.tasks.length > 0 ? (
                <View style={styles.section}>
                  <ThemedText type="cardTitle">Suggested tasks</ThemedText>
                  {extraction.tasks.map((task, index) => {
                    const included = !dropped.includes(index);
                    return (
                      <Pressable
                        key={`${index}-${task.title}`}
                        onPress={() => toggleSuggestion(index)}
                        style={({ pressed }) => (pressed ? styles.pressed : null)}
                      >
                        <ThemedView
                          type="backgroundElement"
                          style={[styles.suggestion, included ? null : styles.suggestionDropped]}
                        >
                          <View style={styles.suggestionHeader}>
                            <ThemedText type="cardTitle" style={styles.suggestionTitle}>
                              {task.title}
                            </ThemedText>
                            <View
                              style={[
                                styles.chip,
                                {
                                  backgroundColor: included
                                    ? theme.brandTint
                                    : theme.backgroundSelected,
                                },
                              ]}
                            >
                              <ThemedText
                                type="caption"
                                themeColor={included ? 'brand' : 'textSecondary'}
                                style={styles.chipText}
                              >
                                {included ? 'Included' : 'Dropped'}
                              </ThemedText>
                            </View>
                          </View>
                          {taskMeta(task) ? (
                            <ThemedText type="small" themeColor="textSecondary">
                              {taskMeta(task)}
                            </ThemedText>
                          ) : null}
                          {task.sourceQuote ? (
                            <View style={[styles.quote, { backgroundColor: theme.amberSurface }]}>
                              <ThemedText type="small" style={{ color: theme.amberInk }}>
                                “{task.sourceQuote}”
                              </ThemedText>
                            </View>
                          ) : null}
                          <ThemedText type="caption" themeColor="brand" numberOfLines={1}>
                            {document.fileName}
                            {task.sourcePage ? `, p.${task.sourcePage}` : ''}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <PrimaryButton
                label={`Add ${selectedIndexes.length} task${
                  selectedIndexes.length === 1 ? '' : 's'
                } to PicTask`}
                onPress={handleAccept}
                disabled={selectedIndexes.length === 0 || saving}
              />
            </>
          )}
        </ScrollView>
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

function detailRowsFor(fields?: {
  amount?: number;
  currency?: string;
  dueAt?: string;
  accountNo?: string;
  referenceNo?: string;
}): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const amount = formatAmount(fields?.amount, fields?.currency);
  if (amount) rows.push({ label: 'Amount', value: amount });
  if (fields?.dueAt) rows.push({ label: 'Due', value: fields.dueAt });
  if (fields?.accountNo) rows.push({ label: 'Account', value: fields.accountNo });
  if (fields?.referenceNo) rows.push({ label: 'Reference', value: fields.referenceNo });
  return rows;
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.brand },
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
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
  },
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
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
  suggestion: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  suggestionDropped: {
    opacity: 0.5,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  suggestionTitle: {
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
