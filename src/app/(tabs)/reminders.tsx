import { useMutation, useQuery } from 'convex/react';
import { type ErrorBoundaryProps } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { formatPeso } from '@/lib/format';

import type { Id } from '../../../convex/_generated/dataModel';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Reminder = {
  reminderId: string;
  taskId: string;
  title: string;
  fireAt: number;
  locked: boolean;
  blockedByStepIndex?: number;
  amount?: number;
  currency?: string;
  sourceName?: string;
};

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="display">Reminders</ThemedText>
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

export default function RemindersScreen() {
  const theme = useTheme();
  const reminders = useQuery(api.reminders.list, {});
  const snooze = useMutation(api.reminders.snooze);
  const complete = useMutation(api.tasks.complete);
  const [busy, setBusy] = useState<string | null>(null);

  const handleSnooze = async (reminderId: string) => {
    if (busy) return;
    setBusy(reminderId);
    try {
      await snooze({ reminderId: reminderId as Id<'reminders'> });
    } catch {
      Alert.alert('Could not snooze this reminder. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  const handleComplete = async (taskId: string) => {
    if (busy) return;
    setBusy(taskId);
    try {
      await complete({ taskId: taskId as Id<'tasks'> });
    } catch {
      Alert.alert('Could not mark this done. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  const now = new Date().getTime();
  const sorted = reminders
    ? [...(reminders as Reminder[])].sort((a, b) => a.fireAt - b.fireAt)
    : [];
  const next = sorted[0];
  const rest = sorted.slice(1);
  const thisWeek = rest.filter((item) => item.fireAt - now <= WEEK_MS);
  const later = rest.filter((item) => item.fireAt - now > WEEK_MS);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="display">Reminders</ThemedText>

          {reminders === undefined ? (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          ) : sorted.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              No reminders scheduled. Scan a document to get started.
            </ThemedText>
          ) : (
            <>
              {next ? (
                <ThemedView style={[styles.nextUp, { backgroundColor: theme.darkSurface }]}>
                  <ThemedText type="label" style={[styles.nextUpLabel, { color: theme.amber }]}>
                    NEXT UP
                  </ThemedText>
                  <ThemedText type="heading" style={styles.nextUpTitle}>
                    {next.title}
                  </ThemedText>
                  <ThemedText type="caption" style={styles.nextUpMeta}>
                    {[formatPeso(next.amount, next.currency), whenLine(next.fireAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                  {next.locked ? (
                    <ThemedText type="caption" style={styles.nextUpMeta}>
                      Locked · waiting on step {(next.blockedByStepIndex ?? 0) + 1}
                    </ThemedText>
                  ) : null}
                  <View style={styles.actions}>
                    <Pressable
                      style={({ pressed }) => [styles.snooze, pressed ? styles.pressed : null]}
                      onPress={() => handleSnooze(next.reminderId)}
                      disabled={busy !== null}
                    >
                      <ThemedText type="smallBold" style={styles.snoozeText}>
                        Snooze
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.done,
                        { backgroundColor: theme.amber },
                        next.locked || busy !== null ? styles.disabled : null,
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={() => handleComplete(next.taskId)}
                      disabled={next.locked || busy !== null}
                    >
                      <ThemedText type="smallBold" style={styles.doneText}>
                        Mark as done
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              ) : null}

              {thisWeek.length > 0 ? (
                <Section title="THIS WEEK">
                  {thisWeek.map((item) => (
                    <ReminderRow key={item.reminderId} item={item} />
                  ))}
                </Section>
              ) : null}

              {later.length > 0 ? (
                <Section title="LATER">
                  {later.map((item) => (
                    <ReminderRow key={item.reminderId} item={item} />
                  ))}
                </Section>
              ) : null}

              <ThemedText type="caption" themeColor="textSecondary" style={styles.footer}>
                Default reminder 3 days before · 9:00 AM
              </ThemedText>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="label" themeColor="textSecondary">
        {title}
      </ThemedText>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

function ReminderRow({ item }: { item: Reminder }) {
  const theme = useTheme();
  const date = new Date(item.fireAt);
  const month = date.toLocaleDateString('en-PH', { month: 'short' }).toUpperCase();
  const day = date.getDate();

  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View style={[styles.badge, { borderColor: theme.border }]}>
        <ThemedText type="caption" themeColor="textSecondary">
          {month}
        </ThemedText>
        <ThemedText type="smallBold">{day}</ThemedText>
      </View>
      <View style={styles.rowBody}>
        <ThemedText type="cardTitle" numberOfLines={1}>
          {item.title}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {[whenLine(item.fireAt), formatPeso(item.amount, item.currency)]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
        {item.locked ? (
          <ThemedText type="caption" themeColor="textSecondary">
            Locked · waiting on step {(item.blockedByStepIndex ?? 0) + 1}
          </ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

function whenLine(fireAt: number): string {
  const date = new Date(fireAt);
  const day = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
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
  nextUp: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.lg,
  },
  nextUpLabel: {
    letterSpacing: 1,
  },
  nextUpTitle: {
    color: '#ffffff',
  },
  nextUpMeta: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  snooze: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  snoozeText: {
    color: '#ffffff',
  },
  done: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
  },
  doneText: {
    color: '#08232B',
  },
  disabled: {
    opacity: 0.4,
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  badge: {
    width: 48,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  footer: {
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
