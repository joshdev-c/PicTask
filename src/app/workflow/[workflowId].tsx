import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { formatDue } from '@/lib/format';

import type { Id } from '../../../convex/_generated/dataModel';

type StepStatus = 'done' | 'ready' | 'locked';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="display">Workflow</ThemedText>
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

export default function WorkflowScreen() {
  const { workflowId } = useLocalSearchParams<{ workflowId: Id<'workflows'> }>();

  return <WorkflowDetail workflowId={workflowId} />;
}

function WorkflowDetail({ workflowId }: { workflowId: Id<'workflows'> }) {
  const theme = useTheme();
  const data = useQuery(api.workflows.get, { workflowId });
  const completeStep = useMutation(api.workflows.completeStep);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);

  if (data === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const { workflow, steps } = data;
  const doneCount = steps.filter((step) => statusOf(step) === 'done').length;
  const due = formatDue(workflow.dueAt);

  const handleComplete = async (stepIndex: number) => {
    if (busyIndex !== null) return;
    setBusyIndex(stepIndex);
    try {
      await completeStep({ workflowId, stepIndex });
    } catch {
      Alert.alert('Could not complete this step. Check your connection.');
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="display">{workflow.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {doneCount} of {steps.length} step{steps.length === 1 ? '' : 's'} done
            </ThemedText>
            {due ? (
              <ThemedText type="caption" themeColor="brand">
                {due}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.timeline}>
            {steps.map((step, position) => {
              const status = statusOf(step);
              const last = position === steps.length - 1;
              const circleColor =
                status === 'done'
                  ? theme.green
                  : status === 'ready'
                    ? theme.brand
                    : theme.backgroundSelected;
              const circleTextColor =
                status === 'locked' ? theme.textSecondary : '#ffffff';

              const body = (
                <View style={styles.stepBody}>
                  <ThemedText type="cardTitle">{step.task?.title ?? 'Untitled step'}</ThemedText>
                  <ThemedText type="caption" style={statusColorFor(status, theme)}>
                    {statusLine(step, status)}
                  </ThemedText>
                </View>
              );

              return (
                <View key={step.index} style={styles.stepRow}>
                  <View style={styles.rail}>
                    <View style={[styles.circle, { backgroundColor: circleColor }]}>
                      <ThemedText type="smallBold" style={{ color: circleTextColor }}>
                        {step.index + 1}
                      </ThemedText>
                    </View>
                    {last ? null : <View style={[styles.line, { backgroundColor: theme.border }]} />}
                  </View>
                  {status === 'ready' ? (
                    <Pressable
                      style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
                      onPress={() => handleComplete(step.index)}
                      disabled={busyIndex !== null}
                    >
                      {body}
                    </Pressable>
                  ) : (
                    body
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type WorkflowStep = {
  index: number;
  blockedByStepIndex?: number;
  task: { status: string; dueAt?: number } | null;
};

function statusOf(step: WorkflowStep): StepStatus {
  if (step.task?.status === 'done') return 'done';
  if (step.blockedByStepIndex !== undefined) return 'locked';
  return 'ready';
}

function statusLine(step: WorkflowStep, status: StepStatus): string {
  if (status === 'done') return 'Done';
  if (status === 'locked') return `Waiting on step ${(step.blockedByStepIndex ?? 0) + 1}`;
  const due = formatDue(step.task?.dueAt);
  return due ? `${due} · Ready to start` : 'Ready to start';
}

function statusColorFor(
  status: StepStatus,
  theme: { green: string; brand: string; textSecondary: string },
) {
  if (status === 'done') return { color: theme.green };
  if (status === 'ready') return { color: theme.brand };
  return { color: theme.textSecondary };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  header: {
    gap: Spacing.one,
  },
  timeline: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.three,
  },
  rail: {
    width: 28,
    alignItems: 'center',
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 2,
    marginTop: Spacing.one,
    borderRadius: 1,
  },
  pressable: {
    flex: 1,
  },
  stepBody: {
    flex: 1,
    gap: Spacing.half,
    paddingBottom: Spacing.four,
  },
  pressed: {
    opacity: 0.85,
  },
});
