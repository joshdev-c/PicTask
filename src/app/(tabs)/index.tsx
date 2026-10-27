import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from 'convex/react';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgendaCard } from '@/components/pictask/agenda-card';
import { ScanFab } from '@/components/pictask/scan-fab';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useAppColorScheme } from '@/hooks/use-app-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import type { AgendaItem } from '../../../convex/lib/agenda';

// Alert palette from the mockup
const ALERT_BG = '#FBE9E6';
const ALERT_FG = '#B3261E';

type ConflictInfo = { title: string; body: string };

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

function BrandLogo({ color }: { color: string }) {
  return (
    <View style={[styles.logo, { backgroundColor: color }]}>
      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
    </View>
  );
}

function ConflictBanner({ conflict, onReview }: { conflict: ConflictInfo; onReview?: () => void }) {
  return (
    <View style={styles.alert}>
      <Ionicons name="warning-outline" size={26} color={ALERT_FG} style={styles.alertIcon} />
      <View style={styles.alertBody}>
        <ThemedText type="heading" style={styles.alertTitle}>
          {conflict.title}
        </ThemedText>
        <ThemedText type="small" style={styles.alertText}>
          {conflict.body}
        </ThemedText>
        <Pressable onPress={onReview} hitSlop={8}>
          <ThemedText type="smallBold" style={{ color: ALERT_FG }}>
            Review conflict
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export default function TodayScreen() {
  const agenda = useQuery(api.tasks.agenda, {});
  const theme = useTheme();
  const { colorScheme, toggleColorScheme } = useAppColorScheme();
  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Design placeholder: the mockup's "Dates don't match" banner.
  // Wire this to real data later; it renders nothing while null.
  const conflict = null as ConflictInfo | null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandLeft}>
                <BrandLogo color={theme.brand} />
                <ThemedText type="cardTitle" style={[styles.brand, { color: theme.brand }]}>
                  PicTask
                </ThemedText>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open reminders"
                  style={styles.iconButton}
                  hitSlop={8}
                  onPress={() => router.push('/reminders')}
                >
                  <Ionicons name="notifications-outline" size={24} color={theme.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode`}
                  style={styles.iconButton}
                  hitSlop={8}
                  onPress={toggleColorScheme}
                >
                  <Ionicons
                    name={colorScheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
                    size={24}
                    color={theme.text}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.titleBlock}>
              <ThemedText type="small" themeColor="textSecondary">
                {today}
              </ThemedText>

              <ThemedText type="display" style={{ marginTop: Spacing.one, letterSpacing: 0.3 }}>
                {agenda === undefined
                  ? 'Loading…'
                  : agenda.length === 0
                    ? 'Great Job! All clear'
                    : `${agenda.length} task${agenda.length === 1 ? '' : 's'} need attention`}
              </ThemedText>
            </View>
          </View>

          {conflict ? <ConflictBanner conflict={conflict} /> : null}

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
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  header: {
    gap: Spacing.four,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    gap: Spacing.one,
  },
  alert: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 20,
    backgroundColor: ALERT_BG,
  },
  alertIcon: {
    marginTop: 2,
  },
  alertBody: {
    flex: 1,
    gap: Spacing.one,
  },
  alertTitle: {
    color: '#1B1B1B',
  },
  alertText: {
    color: '#1B1B1B',
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
