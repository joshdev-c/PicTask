import { useQuery } from 'convex/react';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScanFab } from '@/components/pictask/scan-fab';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { formatPeso } from '@/lib/format';

type DocumentKind = 'document' | 'receipt' | 'bill' | 'form' | 'notice';

const FILTERS: { label: string; value?: DocumentKind }[] = [
  { label: 'All' },
  { label: 'Bills', value: 'bill' },
  { label: 'Receipts', value: 'receipt' },
  { label: 'Forms', value: 'form' },
  { label: 'Notices', value: 'notice' },
];

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="display">Vault</ThemedText>
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

export default function VaultScreen() {
  const theme = useTheme();
  const [kind, setKind] = useState<DocumentKind | undefined>(undefined);
  const [search, setSearch] = useState('');
  const documents = useQuery(api.documents.list, {
    kind,
    search: search.trim() || undefined,
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="display">Vault</ThemedText>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search documents"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.search,
              {
                backgroundColor: theme.backgroundElement,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {FILTERS.map((filter) => {
              const selected = filter.value === kind;
              return (
                <Pressable
                  key={filter.label}
                  onPress={() => setKind(filter.value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? theme.brand : theme.backgroundElement,
                      borderColor: selected ? theme.brand : theme.border,
                    },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={{ color: selected ? '#ffffff' : theme.textSecondary }}
                  >
                    {filter.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sectionHeader}>
            <ThemedText type="heading">Recent</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              Sort: Newest
            </ThemedText>
          </View>

          {documents === undefined ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : documents.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              No documents yet. Tap Scan to add one.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {documents.map((document) => (
                <Pressable
                  key={document._id}
                  onPress={() =>
                    router.push({
                      pathname: '/document/[documentId]',
                      params: { documentId: document._id },
                    })
                  }
                  style={({ pressed }) => (pressed ? styles.pressed : null)}
                >
                  <ThemedView type="backgroundElement" style={styles.row}>
                    <View style={styles.rowHeader}>
                      <ThemedText type="cardTitle" style={styles.rowTitle} numberOfLines={1}>
                        {document.title}
                      </ThemedText>
                      <StatusChip status={document.status} />
                    </View>
                    <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                      {rowMeta(document.kind, document.createdAt, document.fields)}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      <ScanFab />
    </ThemedView>
  );
}

function StatusChip({ status }: { status: 'uploading' | 'extracting' | 'ready' | 'failed' }) {
  const theme = useTheme();
  const tone =
    status === 'ready'
      ? { backgroundColor: theme.brandTint, color: theme.brand, label: 'Ready' }
      : status === 'failed'
        ? { backgroundColor: theme.dangerSurface, color: theme.danger, label: 'Failed' }
        : { backgroundColor: theme.amberSurface, color: theme.amberInk, label: 'Extracting' };
  return (
    <View style={[styles.statusChip, { backgroundColor: tone.backgroundColor }]}>
      <ThemedText type="caption" style={[styles.statusText, { color: tone.color }]}>
        {tone.label}
      </ThemedText>
    </View>
  );
}

function rowMeta(
  kind: DocumentKind,
  createdAt: number,
  fields?: { amount?: number; currency?: string },
): string {
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  const date = new Date(createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const amount = formatPeso(fields?.amount, fields?.currency);
  return [label, date, amount].filter(Boolean).join(' · ');
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
  search: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    fontSize: 15,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
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
  row: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rowTitle: {
    flex: 1,
  },
  statusChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Radius.pill,
  },
  statusText: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
