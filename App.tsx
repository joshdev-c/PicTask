import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, AppState, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Notifications from 'expo-notifications';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ThemeProvider, useTheme, type ThemeColors } from './src/theme';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationBar } from 'expo-navigation-bar';
import { ArrowRight, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Coffee, FileText, House, Moon, Plus, ScanLine, Search, Shield, Sun, UserRound, X } from 'lucide-react-native';
import type { AppTab, AppUser, DocumentCategory, DocumentRecord, DocumentStatus, RetentionChoice, ScanReviewInput, TaskRecord } from './src/types';
import { createId, extractReview, makeTasks, maskIdentifier, recommendedTaskTitles } from './src/lib/extractor';
import { getCurrentTaskInChain, getCurrentTasks, getTaskPrerequisite } from './src/lib/taskChains';
import { loadLocalRecords, loadMutations, queueMutation, removeLocalDocumentAndTasks, removeLocalRecords, removeLocalTask, removeMutation, saveLocalDocument, saveLocalTask } from './src/lib/db';
import { deleteRemoteDocument, deleteRemoteTask, fetchRemoteRecords, getVaultImageUrl, supabase, syncDocument, syncTask } from './src/lib/supabase';
import { getUpcomingTaskReminders, scheduleTaskReminders, type UpcomingTaskReminder } from './src/lib/notifications';
import { getOverdueTasksForFollowUp, getRecentOverdueTasks, isMoreThanDaysPast } from './src/lib/overdueTasks';

const appIcons = {
  'arrow-right': ArrowRight,
  bell: Bell,
  calendar: CalendarDays,
  check: Check,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  coffee: Coffee,
  'file-text': FileText,
  home: House,
  moon: Moon,
  plus: Plus,
  'scan-line': ScanLine,
  search: Search,
  shield: Shield,
  sun: Sun,
  user: UserRound,
  x: X,
};
type AppIconName = keyof typeof appIcons;

function AppIcon({ name, size, color }: { name: AppIconName; size: number; color: string }) {
  const Icon = appIcons[name];
  return <Icon size={size} color={color} strokeWidth={1.8} />;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; listener.remove(); };
  }, []);
  return reduced;
}

function AnimatedPage({ children, fill = true }: { children: React.ReactNode; fill?: boolean }) {
  const progress = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  return <Animated.View style={{ flex: fill ? 1 : undefined, gap: 20, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

function AppHeader({ notificationCount, onNotificationsPress }: { notificationCount: number; onNotificationsPress: () => void }) {
  const { colors } = useTheme();
  const styles = useAppStyles();
  return <View style={styles.appHeader}>
    <View style={styles.headerBrand}><View style={styles.headerMark}><AppIcon name="check" size={22} color={colors.onPrimary} /></View><Text style={styles.headerName}>PicTask</Text></View>
    <View style={styles.headerActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Notifications${notificationCount ? `, ${notificationCount} upcoming reminders` : ''}`} onPress={onNotificationsPress} style={({ pressed }) => [styles.themeToggle, pressed && styles.buttonPressed]}>
        <AppIcon name="bell" size={20} color={colors.primaryDark} />
        {notificationCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text></View> : null}
      </Pressable>
    </View>
  </View>;
}

const tabs: Array<{ id: AppTab; icon: AppIconName; label: string }> = [
  { id: 'home', icon: 'home', label: 'Home' }, { id: 'calendar', icon: 'calendar', label: 'Calendar' },
  { id: 'scan', icon: 'scan-line', label: 'Scan' }, { id: 'vault', icon: 'shield', label: 'Vault' }, { id: 'profile', icon: 'user', label: 'Profile' },
];
const dayLabel = (date?: string) => date ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00`)) : 'No due date';
const stepLabel = (index: number) => {
  const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  const number = index + 1;
  const word = words[index];
  if (word) return `${word} step`;
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? 'th' : number % 10 === 1 ? 'st' : number % 10 === 2 ? 'nd' : number % 10 === 3 ? 'rd' : 'th';
  return `${number}${suffix} step`;
};
const isoDateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isPastDate = (value: string) => value < isoDateValue(new Date());
const peso = (value?: number) => value === undefined ? 'Amount not detected' : value.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
const nowIso = () => new Date().toISOString();
const getFunctionErrorMessage = async (error: unknown) => {
  const fallback = error instanceof Error ? error.message : 'Please try again.';
  if (!error || typeof error !== 'object' || !('context' in error) || !(error.context instanceof Response)) return fallback;
  try {
    const body: unknown = await error.context.clone().json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  } catch {
    return fallback;
  }
  return fallback;
};
const isValidIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.getUTCFullYear() === Number(year) && parsed.getUTCMonth() === Number(month) - 1 && parsed.getUTCDate() === Number(day);
};
const hasExistingMainTitle = (title: string, records: DocumentRecord[]) => {
  const normalizedTitle = title.normalize('NFKC').trim().toLocaleLowerCase();
  return records.some((record) => record.details.title.normalize('NFKC').trim().toLocaleLowerCase() === normalizedTitle);
};
const getOAuthCallbackParams = (input: string) => {
  const url = new URL(input, 'https://pictask.invalid');
  const errorCode = url.searchParams.get('errorCode');
  url.searchParams.delete('errorCode');
  const params: Record<string, string> = Object.fromEntries(url.searchParams.entries());
  if (url.hash) new URLSearchParams(url.hash.slice(1)).forEach((value, key) => { params[key] = value; });
  return { errorCode, params };
};

function GoogleMark() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <Path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
    <Path fill="#EA4335" d="M12 4.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0a11 11 0 0 0-9.82 7.06l3.66 2.84C6.71 7.3 9.14 4.36 12 4.36z" />
  </Svg>;
}

function Button({ label, onPress, kind = 'primary', disabled = false, leading }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'cancel'; disabled?: boolean; leading?: React.ReactNode }) {
  const { colors, layout, isDark } = useTheme();
  const styles = useAppStyles();
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const animatePress = (toValue: number) => {
    Animated.spring(scale, { toValue, speed: 35, bounciness: 3, useNativeDriver: true }).start();
  };
  const style = kind === 'primary' ? layout.button : kind === 'secondary' ? layout.secondaryButton : kind === 'danger' ? styles.dangerButton : [layout.secondaryButton, { backgroundColor: isDark ? '#3A444A' : '#E5E7EB' }];
  const textStyle = kind === 'danger' ? [layout.buttonText, { color: colors.white }] : kind === 'primary' ? layout.buttonText : layout.secondaryButtonText;
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" accessibilityState={{ disabled, busy: disabled }} disabled={disabled} onPressIn={() => { if (!reduced) animatePress(0.975); }} onPressOut={() => animatePress(1)} onPress={onPress} style={({ pressed }) => [style, leading ? styles.buttonWithLeading : undefined, disabled ? styles.disabled : undefined, pressed ? { opacity: 0.85 } : undefined]}>{leading}<Text style={textStyle}>{label}</Text>{kind === "primary" ? <AppIcon name="arrow-right" size={18} color={colors.onPrimary} /> : null}</Pressable></Animated.View>;
}
function Card({ children, style }: { children: React.ReactNode; style?: object }) { const { layout } = useTheme(); return <View style={[layout.card, style]}>{children}</View>; }
function ScreenBackground() {
  const { colors, isDark } = useTheme();
  return <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
    <Defs>
      <SvgLinearGradient id="screenBackgroundGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor={isDark ? '#102B30' : '#F6FCFD'} />
        <Stop offset="100%" stopColor={colors.background} />
      </SvgLinearGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#screenBackgroundGradient)" />
  </Svg>;
}
function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' | 'warning' | 'blue' }) {
  const { colors } = useTheme();
  const styles = useAppStyles();
  const background = tone === 'success' ? colors.successSurface : tone === 'warning' ? colors.warningSurface : tone === 'blue' ? colors.blueSurface : colors.surfaceMuted;
  const foreground = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'blue' ? colors.primary : colors.textMuted;
  return <View style={[styles.pill, { backgroundColor: background }]}><Text style={[styles.pillText, { color: foreground }]}>{text}</Text></View>;
}

function AuthScreen({ onPreview }: { onPreview: () => void }) {
  const { colors, layout, isDark } = useTheme();
  const styles = useAppStyles();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn'); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const configured = Boolean(supabase);
  const submit = async () => {
    if (!supabase) return;
    if (!email.trim() || password.length < 8) { setMessageIsError(true); setMessage('Use a valid email and a password with at least 8 characters.'); return; }
    setBusy(true); setMessage(''); setMessageIsError(false);
    const response = mode === 'signIn' ? await supabase.auth.signInWithPassword({ email: email.trim(), password }) : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false); setMessageIsError(Boolean(response.error)); setMessage(response.error ? response.error.message : mode === 'signUp' ? 'Check your email to confirm your account, then sign in.' : 'Signed in.');
  };
  const signInWithGoogle = async () => {
    if (!supabase) return;
    setBusy(true); setMessage(''); setMessageIsError(false);
    try {
      const redirectTo = AuthSession.makeRedirectUri({ scheme: 'pictask', path: 'auth/callback' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Google sign-in could not be started.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success') throw new Error('Google sign-in did not complete.');

      const { params, errorCode } = getOAuthCallbackParams(result.url);
      if (errorCode || params.error_description || params.error) throw new Error(params.error_description || params.error || errorCode || 'Google sign-in failed.');
      if (params.code) {
        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(params.code);
        if (sessionError) throw sessionError;
      } else if (params.access_token && params.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (sessionError) throw sessionError;
      } else {
        throw new Error('Google sign-in returned no session. Please try again.');
      }
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return <KeyboardAvoidingView style={layout.screen} behavior={Platform.select({ ios: 'padding', default: undefined })}><ScreenBackground /><StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
    <SafeAreaView style={[layout.screen, { backgroundColor: 'transparent' }]} edges={["top", "left", "right", "bottom"]}><ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
      <AnimatedPage fill={false}>
      <View style={styles.authHero}>
        <Text accessibilityRole="header" style={styles.welcomeHeadline}>Less paperwork.{"\n"}<Text style={{ color: colors.primary }}>More peace of mind.</Text></Text>
        <Text style={styles.authWelcomeText}>Complete tasks one step at a time.</Text>
      </View>
      
      <Card style={styles.authCard}><Text style={[styles.authCardTitle, styles.authCardTitleUncentered]}>{configured ? (mode === 'signIn' ? 'Welcome back' : 'Get started') : 'Your next step starts here'}</Text><Text style={[layout.subtitle, styles.authSubtitleUncentered]}>{configured ? (mode === 'signIn' ? 'Sign-in and continue where you left off.' : 'Create your account and take the first step.') : 'Explore a calmer way to keep track of your tasks.'}</Text>
        {configured ? <><Text style={layout.label}>Email address</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} accessibilityLabel="Email address" autoComplete="email" style={layout.input} autoCapitalize="none" keyboardType="email-address" placeholder="Email address" placeholderTextColor={colors.textMuted} value={email} onChangeText={setEmail} /><Text style={layout.label}>Password</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} accessibilityLabel="Password" autoComplete={mode === "signIn" ? "current-password" : "new-password"} style={layout.input} secureTextEntry placeholder="Password" placeholderTextColor={colors.textMuted} value={password} onChangeText={setPassword} />{message ? <Text style={[styles.message, styles.messageUncentered, messageIsError && { color: colors.danger }]}>{message}</Text> : null}<Button label={busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'} onPress={submit} disabled={busy} /><Text style={styles.authDivider}>or</Text><Button label={busy ? 'Please wait…' : 'Continue with Google'} kind="secondary" leading={<GoogleMark />} onPress={() => void signInWithGoogle()} disabled={busy} /><Pressable disabled={busy} onPress={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setMessage(''); }}><Text style={styles.link}>{mode === 'signIn' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</Text></Pressable></> : <><Text style={[styles.message, styles.messageUncentered]}>Try the local preview. Your documents stay on this device.</Text><Button label="Open local preview" onPress={onPreview} /></>}
      </Card><View style={styles.privacyRow}><AppIcon name="shield" size={16} color={colors.textMuted} /><Text style={styles.privacyCopy}>Private by design. Always in your control.</Text></View></AnimatedPage>
    </ScrollView></SafeAreaView></KeyboardAvoidingView>;
}

function CalendarGrid({ tasks, selectedDate, onSelect }: { tasks: TaskRecord[]; selectedDate: string; onSelect: (value: string) => void }) {
  const { colors, layout } = useTheme();
  const styles = useAppStyles();
  const [cursor, setCursor] = useState(() => new Date(`${selectedDate}T12:00:00`)); const year = cursor.getFullYear(); const month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay(); const total = new Date(year, month + 1, 0).getDate(); const activeDates = new Set(tasks.filter((task) => !task.completed && task.dueDate).map((task) => task.dueDate)); const today = isoDateValue(new Date());
  const cells = Array.from({ length: first + total }, (_, index) => index < first ? null : index - first + 1);
  return <Card style={styles.calendarCard}><View style={styles.calendarHeader}><Pressable accessibilityRole="button" accessibilityLabel="Previous month" style={styles.calendarArrow} onPress={() => setCursor(new Date(year, month - 1, 1))}><AppIcon name="chevron-left" size={24} color={colors.primary} /></Pressable><Text style={layout.heading}>{cursor.toLocaleString('en-PH', { month: 'long', year: 'numeric' })}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next month" style={styles.calendarArrow} onPress={() => setCursor(new Date(year, month + 1, 1))}><AppIcon name="chevron-right" size={24} color={colors.primary} /></Pressable></View><View style={styles.weekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text style={styles.weekday} key={`${day}-${index}`}>{day}</Text>)}</View><View style={styles.calendarGrid}>{cells.map((day, index) => {
    if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />; const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const selected = value === selectedDate; const isToday = value === today;
    return <Pressable key={value} onPress={() => onSelect(value)} style={[styles.dayCell, isToday && !selected && styles.todayDay, selected && styles.selectedDay]}><Text style={[styles.dayText, selected && styles.selectedDayText]}>{day}</Text>{activeDates.has(value) ? <View style={[styles.dayDot, selected && styles.selectedDot]} /> : null}</Pressable>;
  })}</View></Card>;
}

function TaskRow({ task, onToggle, onOpen, onEdit, blockedBy, compact = false, reducedMotion = false }: { task: TaskRecord; onToggle: () => void; onOpen?: () => void; onEdit?: () => void; blockedBy?: TaskRecord; compact?: boolean; reducedMotion?: boolean }) {
  const { colors } = useTheme();
  const styles = useAppStyles();
  const locked = !task.completed && Boolean(blockedBy);
  const overdue = !task.completed && Boolean(task.dueDate && isPastDate(task.dueDate));
  const taskStatus = locked ? `Complete "${blockedBy?.title}" first` : task.syncState === 'synced' ? 'Synced' : task.syncState === 'local' ? 'Local preview' : 'Waiting to sync';
  const checkScale = useRef(new Animated.Value(task.completed ? 1 : 0)).current;
  const rowScale = useRef(new Animated.Value(1)).current;
  const previousCompleted = useRef(task.completed);
  useEffect(() => {
    if (previousCompleted.current === task.completed) return;
    previousCompleted.current = task.completed;
    if (reducedMotion) {
      checkScale.setValue(task.completed ? 1 : 0);
      rowScale.setValue(1);
      return;
    }
    if (task.completed) {
      checkScale.setValue(0.3);
      rowScale.setValue(0.97);
      const animation = Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, damping: 7, stiffness: 240, mass: 0.55 }),
        Animated.spring(rowScale, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 220 }),
      ]);
      animation.start();
      return () => animation.stop();
    }
    checkScale.setValue(0);
    rowScale.setValue(1);
  }, [checkScale, rowScale, reducedMotion, task.completed]);
  return <Animated.View style={{ transform: [{ scale: rowScale }] }}><View style={[styles.taskRow, task.completed && styles.completedRow]}><Pressable accessibilityRole="checkbox" accessibilityLabel={locked ? `${task.title}, locked until ${blockedBy?.title} is complete` : task.title} hitSlop={6} disabled={locked} accessibilityState={{ checked: task.completed, disabled: locked }} onPress={onToggle} style={[styles.check, task.completed && styles.checked, locked && styles.disabled]}><Animated.View style={{ opacity: checkScale, transform: [{ scale: checkScale }] }}><AppIcon name="check" size={17} color={colors.onPrimary} /></Animated.View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${onOpen ? 'View' : 'Edit'} task: ${task.title}`} accessibilityHint={onOpen ? 'Opens task details and related tasks' : 'Opens the task editor'} onPress={onOpen ?? onEdit} style={styles.taskText}><Text style={[styles.taskTitle, task.completed && styles.completedText]}>{task.title}</Text>{!compact ? <View style={styles.dueDateLine}><AppIcon name="calendar" size={14} color={colors.textMuted} /><Text style={[styles.taskMeta, overdue && styles.taskOverdueMeta]}>{dayLabel(task.dueDate)} · {overdue ? `Overdue · ${taskStatus}` : taskStatus}</Text></View> : null}</Pressable>{onEdit ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit task: ${task.title}`} onPress={onEdit}><Text style={styles.rowAction}>Edit</Text></Pressable> : null}</View></Animated.View>;
}

function PlanProgress({ completed, total }: { completed: number; total: number }) {
  const { colors } = useTheme();
  const styles = useAppStyles();
  const center = 32;
  const radius = 25;
  const segmentAngle = 360 / total;
  const gapAngle = Math.min(10, segmentAngle * 0.2);
  const percentage = Math.round((completed / total) * 100);
  const segments = Array.from({ length: total }, (_, index) => {
    const startAngle = -90 + index * segmentAngle + gapAngle / 2;
    const endAngle = -90 + (index + 1) * segmentAngle - gapAngle / 2;
    const startRadians = (startAngle * Math.PI) / 180;
    const endRadians = (endAngle * Math.PI) / 180;
    const startX = center + radius * Math.cos(startRadians);
    const startY = center + radius * Math.sin(startRadians);
    const endX = center + radius * Math.cos(endRadians);
    const endY = center + radius * Math.sin(endRadians);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return {
      id: index,
      path: `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`,
      completed: index < completed,
    };
  });

  return <View
    accessible
    accessibilityRole="progressbar"
    accessibilityLabel={`${percentage}% complete, ${completed} of ${total} tasks`}
    accessibilityValue={{ min: 0, max: 100, now: percentage }}
    style={styles.planProgress}
  >
    <Svg width={64} height={64} viewBox="0 0 64 64">
      {segments.map((segment) => <Path
        key={segment.id}
        d={segment.path}
        fill="none"
        stroke={segment.completed ? colors.primary : colors.border}
        strokeWidth={6}
        strokeLinecap="round"
      />)}
    </Svg>
    <Text style={styles.planProgressText}>{percentage}%</Text>
  </View>;
}

function DocumentThumbnail({ document }: { document: DocumentRecord }) {
  const { colors } = useTheme();
  const styles = useAppStyles();
  const [imageUri, setImageUri] = useState(document.sourceUri);
  const [imageFailed, setImageFailed] = useState(false);
  const icon: AppIconName = document.category === 'deadline'
    ? 'calendar'
    : document.category === 'bill'
      ? 'file-text'
      : document.sourceType === 'manual' ? 'check' : 'file-text';

  useEffect(() => {
    let active = true;
    setImageFailed(false);
    if (document.sourceUri) {
      setImageUri(document.sourceUri);
    } else if (document.imagePath) {
      setImageUri(undefined);
      void getVaultImageUrl(document.imagePath).then((uri) => {
        if (active) setImageUri(uri);
      }).catch((error: unknown) => {
        if (!active) return;
        console.warn('Could not load document image preview', error);
        setImageFailed(true);
      });
    } else {
      setImageUri(undefined);
    }
    return () => { active = false; };
  }, [document.imagePath, document.sourceUri]);

  return <View style={styles.planThumbnail}>
    {imageUri && !imageFailed
      ? <Image source={{ uri: imageUri }} style={styles.planThumbnailImage} resizeMode="cover" onError={() => setImageFailed(true)} />
      : <View style={styles.planThumbnailFallback}><AppIcon name={icon} size={27} color={colors.primary} /></View>}
  </View>;
}

type TextInputInstance = React.ElementRef<typeof TextInput>;
type ScrollViewInstance = React.ElementRef<typeof ScrollView>;
type ViewInstance = React.ElementRef<typeof View>;

function App() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { colors, layout, isDark, toggleTheme } = useTheme();
  const styles = useAppStyles();
  const [user, setUser] = useState<AppUser | null>(null); const [ready, setReady] = useState(false); const [tab, setTab] = useState<AppTab>('home');
  const [startupComplete, setStartupComplete] = useState(false);
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultCategory, setVaultCategory] = useState<DocumentCategory | 'all'>('all');
  const [plansExpanded, setPlansExpanded] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]); const [tasks, setTasks] = useState<TaskRecord[]>([]); const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recentlyCompletedTaskIds, setRecentlyCompletedTaskIds] = useState<Set<string>>(() => new Set());
  const [dismissedOverdueTaskIds, setDismissedOverdueTaskIds] = useState<Set<string>>(() => new Set());
  const completionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [biometricEnabled, setBiometricEnabled] = useState(false); const [syncing, setSyncing] = useState(false); const [review, setReview] = useState<ScanReviewInput | null>(null); const [reviewTasks, setReviewTasks] = useState<TaskRecord[]>([]); const [editTask, setEditTask] = useState<TaskRecord | null>(null); const [taskDetails, setTaskDetails] = useState<TaskRecord | null>(null); const [vaultDocumentDetails, setVaultDocumentDetails] = useState<DocumentRecord | null>(null); const [archiveReview, setArchiveReview] = useState<DocumentRecord | null>(null); const [archiving, setArchiving] = useState(false); const [restoringReviewedTasks, setRestoringReviewedTasks] = useState(false); const [selectedVaultIds, setSelectedVaultIds] = useState<Set<string>>(() => new Set()); const [deleteVaultVisible, setDeleteVaultVisible] = useState(false); const [vaultDeleteFromDetails, setVaultDeleteFromDetails] = useState(false); const [vaultActionBusy, setVaultActionBusy] = useState(false); const [newTaskTitle, setNewTaskTitle] = useState(''); const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [deliveredReminders, setDeliveredReminders] = useState<UpcomingTaskReminder[]>([]);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [taskEditErrors, setTaskEditErrors] = useState<Record<string, string>>({});
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [amountDueInput, setAmountDueInput] = useState('');
  const [datePickerTarget, setDatePickerTarget] = useState<{ kind: 'review' | 'suggested' | 'newTask' | 'edit'; taskId?: string } | null>(null);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const reviewScrollRef = useRef<ScrollViewInstance | null>(null);
  const editTaskScrollRef = useRef<ScrollViewInstance | null>(null);
  const validationInputs = useRef<Record<string, TextInputInstance | null>>({});
  const validationViews = useRef<Record<string, ViewInstance | null>>({});
  const [screenOwnerId, setScreenOwnerId] = useState<string | null>(null);

  useEffect(() => () => {
    completionTimers.current.forEach(clearTimeout);
    completionTimers.current.clear();
  }, []);

  const scrollToValidationInput = (field: string, scrollRef: React.RefObject<ScrollViewInstance | null>) => {
    const input = validationInputs.current[field];
    const scroll = scrollRef.current;
    if (!input || !scroll) return;
    input.measureLayout(
      scroll,
      (_x, y) => scroll.scrollTo({ y: Math.max(y - 24, 0), animated: true }),
      () => input.focus(),
    );
  };
  const scrollToValidationView = (field: string, scrollRef: React.RefObject<ScrollViewInstance | null>) => {
    const view = validationViews.current[field];
    const scroll = scrollRef.current;
    if (!view || !scroll) return;
    view.measureLayout(scroll, (_x, y) => scroll.scrollTo({ y: Math.max(y - 24, 0), animated: true }));
  };
  const openDatePicker = (target: NonNullable<typeof datePickerTarget>, value?: string) => {
    const date = value && isValidIsoDate(value) ? new Date(`${value}T12:00:00`) : new Date();
    setDatePickerMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setDatePickerTarget(target);
  };
  const chooseDate = (value: string) => {
    if (!datePickerTarget) return;
    if (datePickerTarget.kind === 'review') {
      const previousDate = review?.details.dueDate;
      updateReview({ dueDate: value });
      setReviewTasks((all) => all.map((task) => task.dueDate === previousDate ? { ...task, dueDate: value } : task));
      setNewTaskDueDate((current) => !current || current === previousDate ? value : current);
      setReviewErrors((errors) => ({ ...errors, dueDate: '' }));
    } else if (datePickerTarget.kind === 'suggested' && datePickerTarget.taskId) {
      setReviewTasks((all) => all.map((task) => task.id === datePickerTarget.taskId ? { ...task, dueDate: value } : task));
      setReviewErrors((errors) => ({ ...errors, [`taskDue-${datePickerTarget.taskId}`]: '' }));
    } else if (datePickerTarget.kind === 'newTask') {
      setNewTaskDueDate(value);
      setReviewErrors((errors) => ({ ...errors, newTaskDueDate: '' }));
    } else if (datePickerTarget.kind === 'edit' && editTask) {
      setEditTask({ ...editTask, dueDate: value });
      setTaskEditErrors((errors) => ({ ...errors, dueDate: '' }));
    }
    setDatePickerTarget(null);
  };

  // Reset before rendering a new session so a previous screen or modal cannot flash.
  const ownerId = user?.id ?? null;
  if (screenOwnerId !== ownerId) {
    setScreenOwnerId(ownerId);
    setTab('home');
    setReview(null);
    setReviewErrors({});
    setReviewTasks([]);
    setNewTaskDueDate('');
    setEditTask(null);
    setTaskEditErrors({});
    setTaskDetails(null);
    setArchiveReview(null);
    setRestoringReviewedTasks(false);
    setDatePickerTarget(null);
    setArchiving(false);
    setSelectedVaultIds(new Set());
    setDeleteVaultVisible(false);
    setVaultActionBusy(false);
    setNewTaskTitle('');
    setNotificationsVisible(false);
    setPlansExpanded(false);
    completionTimers.current.forEach(clearTimeout);
    completionTimers.current.clear();
    setRecentlyCompletedTaskIds(new Set());
    setDismissedOverdueTaskIds(new Set());
  }

  useEffect(() => { let active = true; let unsubscribe: (() => void) | undefined; void (async () => { const saved = await SecureStore.getItemAsync('pictask.biometric'); if (active) setBiometricEnabled(saved === 'true'); if (supabase) { const { data } = await supabase.auth.getSession(); if (active && data.session?.user) setUser({ id: data.session.user.id, email: data.session.user.email ?? 'Account', preview: false }); const listener = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user ? { id: session.user.id, email: session.user.email ?? 'Account', preview: false } : null); }); unsubscribe = () => listener.data.subscription.unsubscribe(); } if (active) setReady(true); })(); return () => { active = false; unsubscribe?.(); }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setStartupComplete(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const flushPending = async (ownerId: string) => { if (!supabase) return; for (const mutation of await loadMutations(ownerId)) { try { if (mutation.operation === 'upsert' && mutation.entity === 'document') await syncDocument(JSON.parse(mutation.payload) as DocumentRecord); if (mutation.operation === 'upsert' && mutation.entity === 'task') await syncTask(JSON.parse(mutation.payload) as TaskRecord); if (mutation.operation === 'delete' && mutation.entity === 'task') await deleteRemoteTask(JSON.parse(mutation.payload).id); if (mutation.operation === 'delete' && mutation.entity === 'document') await deleteRemoteDocument(JSON.parse(mutation.payload) as DocumentRecord); await removeMutation(mutation.id); } catch { break; } } };
  const loadRecords = async (ownerId: string, preview: boolean) => { const local = await loadLocalRecords(ownerId); setDocuments(local.documents); setTasks(local.tasks); if (!preview && supabase) try { await flushPending(ownerId); const remote = await fetchRemoteRecords(ownerId); if (remote) { setDocuments(remote.documents); setTasks(remote.tasks); await Promise.all(remote.documents.map(saveLocalDocument)); await Promise.all(remote.tasks.map(saveLocalTask)); } } catch { /* local cache stays available offline */ } };
  useEffect(() => { setAmountDueInput(review?.details.amountDue?.toString() ?? ''); }, [review?.sourceType, review?.sourceUri]);
  useEffect(() => { if (user) void loadRecords(user.id, user.preview); else { setDocuments([]); setTasks([]); } }, [user?.id]);
  useEffect(() => {
    const listener = NetInfo.addEventListener((state) => { if (state.isConnected && user && !user.preview) void flushPending(user.id); });
    return () => listener();
  }, [user?.id]);
  const persistDocument = async (record: DocumentRecord) => { await saveLocalDocument(record); if (!user || user.preview || !supabase) return { ...record, syncState: 'local' as const }; try { const remote = await syncDocument(record); return { ...remote, syncState: 'synced' as const }; } catch { await queueMutation({ id: createId('mutation'), ownerId: record.ownerId, entity: 'document', operation: 'upsert', payload: JSON.stringify(record), localTimestamp: nowIso(), retryCount: 0 }); return { ...record, syncState: 'failed' as const }; } };
  const persistTask = async (record: TaskRecord) => { await saveLocalTask(record); if (!user || user.preview || !supabase) return { ...record, syncState: 'local' as const }; try { await syncTask(record); return { ...record, syncState: 'synced' as const }; } catch { await queueMutation({ id: createId('mutation'), ownerId: record.ownerId, entity: 'task', operation: 'upsert', payload: JSON.stringify(record), localTimestamp: nowIso(), retryCount: 0 }); return { ...record, syncState: 'failed' as const }; } };
  const syncAll = async () => { if (!user || user.preview || !supabase) return; setSyncing(true); await Promise.all(documents.map(async (record) => { const saved = await persistDocument({ ...record, syncState: 'pending' }); setDocuments((all) => all.map((item) => item.id === record.id ? saved : item)); })); await Promise.all(tasks.map(async (record) => { const saved = await persistTask({ ...record, syncState: 'pending' }); setTasks((all) => all.map((item) => item.id === record.id ? saved : item)); })); setSyncing(false); };
  const openVault = async () => { if (biometricEnabled && await LocalAuthentication.hasHardwareAsync()) { const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your PicTask Vault', disableDeviceFallback: false }); if (!result.success) return; } setTab('vault'); };
  const changeTab = (next: AppTab) => { if (next === 'vault') void openVault(); else { setSelectedVaultIds(new Set()); setTab(next); } };
  const startManual = (dueDate?: string) => { const input: ScanReviewInput = { sourceType: 'manual', category: 'general', confidence: 'manual', retention: 'details_only', details: { title: 'New task', provider: '', dueDate, retainFullIdentifier: false } }; setReview(input); setAmountDueInput(''); setReviewErrors({}); setReviewTasks([]); setNewTaskDueDate(dueDate ?? ''); };
  const scanImage = async (mode: 'camera' | 'photo') => { const permission = mode === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) { Alert.alert('Permission needed', `Please allow ${mode === 'camera' ? 'camera' : 'photo'} access to scan a document you choose.`); return; } const result = mode === 'camera' ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }); if (result.canceled) return; const uri = result.assets[0].uri; try { const recognized = await TextRecognition.recognize(uri); const draft = extractReview(recognized.text, uri, mode === 'camera' ? 'scan' : 'photo'); setReviewErrors({}); setReview(draft); setNewTaskDueDate(draft.details.dueDate ?? ''); setReviewTasks(makeTasks(user?.id ?? 'local-user', 'draft', draft.category, draft.details.dueDate, draft.details.amountDue)); } catch { const draft = extractReview('', uri, mode === 'camera' ? 'scan' : 'photo'); draft.confidence = 'low'; setReviewErrors({}); setReview(draft); setNewTaskDueDate(''); setReviewTasks(makeTasks(user?.id ?? 'local-user', 'draft', draft.category)); Alert.alert('Review required', 'Text could not be read automatically. You can enter details manually. OCR requires an Android development build.'); } };
  const updateReview = (change: Partial<ScanReviewInput['details']>) => setReview((current) => current ? { ...current, details: { ...current.details, ...change } } : current);
  const changeCategory = (category: DocumentCategory) => { setReview((current) => current ? { ...current, category } : current); setReviewTasks((current) => current.map((task, index) => ({ ...task, title: recommendedTaskTitles(category, review?.details.amountDue)[index] ?? task.title, recommendationSource: category === 'bill' ? 'bill_rule' : category === 'deadline' ? 'deadline_rule' : 'general_rule' }))); };
  const addDraftTask = () => {
    if (!user) return;
    if (!newTaskTitle.trim()) {
      setReviewErrors((errors) => ({ ...errors, newTask: 'Enter a title before adding this task.' }));
      scrollToValidationInput('newTask', reviewScrollRef);
      return;
    }
    setReviewErrors((errors) => ({ ...errors, newTask: '' }));
    if (!newTaskDueDate || !isValidIsoDate(newTaskDueDate) || isPastDate(newTaskDueDate)) { setReviewErrors((errors) => ({ ...errors, newTaskDueDate: 'Choose today or a future date.' })); scrollToValidationView('newTaskDueDate', reviewScrollRef); return; }
    setReviewTasks((current) => [...current, { id: createId('task'), ownerId: user.id, documentId: 'draft', position: current.length, title: newTaskTitle.trim(), dueDate: newTaskDueDate, completed: false, recommendationSource: 'manual', reminderDays: [7, 3, 1], syncState: 'pending', createdAt: nowIso(), updatedAt: nowIso() }]);
    setNewTaskTitle('');
  };
  const persistReviewedPlan = async (archived: boolean) => {
    if (!review || !user) return;
    const id = createId('document');
    const timestamp = nowIso();
    const cleanDetails = { ...review.details, title: review.details.title.trim(), dueDate: review.details.dueDate?.trim() };
    delete cleanDetails.rawText;
    if (cleanDetails.accountNumber && !cleanDetails.retainFullIdentifier) cleanDetails.accountNumber = cleanDetails.accountNumber.slice(-4);
    const document: DocumentRecord = {
      id,
      ownerId: user.id,
      sourceType: review.sourceType,
      category: review.category,
      details: cleanDetails,
      retention: review.retention,
      sourceUri: review.retention === 'image_and_details' ? review.sourceUri : undefined,
      status: archived ? 'archived' : 'active',
      archivedAt: archived ? timestamp : undefined,
      syncState: user.preview ? 'local' : 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextTasks = reviewTasks.map((task, position) => ({
      ...task,
      title: task.title.trim(),
      documentId: id,
      ownerId: user.id,
      position,
      dueDate: task.dueDate ?? document.details.dueDate,
      updatedAt: timestamp,
    }));
    const savedDocument = await persistDocument(document);
    const savedTasks = await Promise.all(nextTasks.map(persistTask));
    setDocuments((all) => [savedDocument, ...all]);
    setTasks((all) => [...all, ...savedTasks]);
    if (!archived) {
      const firstTask = getCurrentTaskInChain(savedTasks);
      if (firstTask) void scheduleTaskReminders(firstTask);
    }
    if (review.sourceUri && review.retention !== 'image_and_details') {
      try {
        await FileSystem.deleteAsync(review.sourceUri, { idempotent: true });
      } catch {
        // Gallery providers may own the original URI.
      }
    }
    setReview(null);
    setReviewErrors({});
    setReviewTasks([]);
    setNewTaskDueDate('');
    setTab('home');
  };
  const saveReview = async () => {
    if (!review || !user) return;
    const errors: Record<string, string> = {};
    if (!review.details.title.trim()) errors.title = 'Enter a title.';
    else if (hasExistingMainTitle(review.details.title, documents)) errors.title = 'This main title already exists. Choose a different title.';
    if (!review.details.dueDate || !isValidIsoDate(review.details.dueDate)) errors.dueDate = 'Choose a valid due date.';
    else if (review.sourceType === 'manual' && isPastDate(review.details.dueDate)) errors.dueDate = 'Choose today or a future date.';
    const emptyTask = reviewTasks.find((task) => !task.title.trim());
    if (emptyTask) errors[`task-${emptyTask.id}`] = 'Enter a task title or remove this task.';
    const taskWithoutDate = reviewTasks.find((task) => !task.dueDate || !isValidIsoDate(task.dueDate));
    if (taskWithoutDate) errors[`taskDue-${taskWithoutDate.id}`] = 'Choose a valid due date for this task.';
    else if (review.sourceType === 'manual') {
      const taskWithPastDate = reviewTasks.find((task) => task.dueDate && isPastDate(task.dueDate));
      if (taskWithPastDate) errors[`taskDue-${taskWithPastDate.id}`] = 'Choose today or a future date for this task.';
    }
    setReviewErrors(errors);
    const taskWithDateError = reviewTasks.find((task) => errors[`taskDue-${task.id}`]);
    const invalidField = errors.title ? 'title' : errors.dueDate ? 'dueDate' : emptyTask ? `task-${emptyTask.id}` : taskWithoutDate || taskWithDateError ? `taskDue-${(taskWithoutDate ?? taskWithDateError)?.id}` : undefined;
    if (invalidField) {
      if (invalidField.startsWith('taskDue-')) scrollToValidationView(invalidField, reviewScrollRef);
      else scrollToValidationInput(invalidField, reviewScrollRef);
      return;
    }
    if (review.sourceType !== 'manual' && isMoreThanDaysPast(review.details.dueDate, 30)) {
      Alert.alert(
        'This document is over a month past due',
        'Would you like to save this plan in your Vault?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Keep in Vault',
            onPress: () => {
              void persistReviewedPlan(true).catch((error) => {
                Alert.alert('Could not save plan', error instanceof Error ? error.message : 'Please try again.');
              });
            },
          },
        ],
      );
      return;
    }
    try {
      await persistReviewedPlan(false);
    } catch (error) {
      Alert.alert('Could not save plan', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const toggleTask = async (task: TaskRecord) => {
    const chain = tasks.filter((item) => item.documentId === task.documentId);
    const prerequisite = task.completed ? undefined : getTaskPrerequisite(chain, task);
    if (prerequisite) {
      Alert.alert('Task locked', `Complete "${prerequisite.title}" before starting "${task.title}".`);
      return;
    }
    if (task.completed && chain.some((item) => item.position > task.position && item.completed)) {
      Alert.alert('Task chain in progress', 'Complete the later task steps before reopening this task.');
      return;
    }
    const optimistic = { ...task, completed: !task.completed, updatedAt: nowIso(), syncState: user?.preview ? 'local' as const : 'pending' as const };
    const updatedTasks = tasks.map((item) => item.id === task.id ? optimistic : item);
    setTasks(updatedTasks);
    const currentTask = getCurrentTaskInChain(updatedTasks.filter((item) => item.documentId === task.documentId));
    const previousTimer = completionTimers.current.get(task.id);
    if (previousTimer) clearTimeout(previousTimer);
    if (optimistic.completed) {
      setRecentlyCompletedTaskIds((current) => new Set(current).add(task.id));
      completionTimers.current.set(task.id, setTimeout(() => {
        completionTimers.current.delete(task.id);
        setRecentlyCompletedTaskIds((current) => {
          const updated = new Set(current);
          updated.delete(task.id);
          return updated;
        });
      }, 3000));
    } else {
      completionTimers.current.delete(task.id);
      setRecentlyCompletedTaskIds((current) => {
        const updated = new Set(current);
        updated.delete(task.id);
        return updated;
      });
    }
    try {
      const saved = await persistTask(optimistic);
      setTasks((all) => all.map((item) => item.id === saved.id ? saved : item));
      if (optimistic.completed && currentTask) void scheduleTaskReminders(currentTask);
    } catch (error) {
      const timer = completionTimers.current.get(task.id);
      if (timer) clearTimeout(timer);
      completionTimers.current.delete(task.id);
      setRecentlyCompletedTaskIds((current) => {
        const updated = new Set(current);
        updated.delete(task.id);
        return updated;
      });
      setTasks((all) => all.map((item) => item.id === task.id ? task : item));
      Alert.alert('Could not update task', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const saveEditedTask = async () => {
    if (!editTask) return;
    const errors: Record<string, string> = {};
    if (!editTask.title.trim()) errors.title = 'Enter a task title.';
    if (!editTask.dueDate || !isValidIsoDate(editTask.dueDate)) errors.dueDate = 'Enter a valid date in YYYY-MM-DD format.';
    setTaskEditErrors(errors);
    const invalidField = errors.title ? 'editTitle' : errors.dueDate ? 'editDueDate' : undefined;
    if (invalidField) {
      if (invalidField === 'editDueDate') scrollToValidationView(invalidField, editTaskScrollRef);
      else scrollToValidationInput(invalidField, editTaskScrollRef);
      return;
    }
    const saved = await persistTask({ ...editTask, title: editTask.title.trim(), dueDate: editTask.dueDate?.trim(), updatedAt: nowIso(), syncState: user?.preview ? 'local' : 'pending' }); const updatedTasks = tasks.map((item) => item.id === saved.id ? saved : item); setTasks(updatedTasks); setEditTask(null); setTaskEditErrors({}); const currentTask = getCurrentTaskInChain(updatedTasks.filter((task) => task.documentId === saved.documentId)); if (currentTask?.id === saved.id) void scheduleTaskReminders(saved);
  };
  const deleteTask = async (task: TaskRecord) => { await removeLocalTask(task.id); const updatedTasks = tasks.filter((item) => item.id !== task.id); setTasks(updatedTasks); setEditTask(null); const currentTask = getCurrentTaskInChain(updatedTasks.filter((item) => item.documentId === task.documentId)); if (currentTask) void scheduleTaskReminders(currentTask); if (!user || user.preview || !supabase) return; try { await deleteRemoteTask(task.id); } catch { await queueMutation({ id: createId('mutation'), ownerId: task.ownerId, entity: 'task', operation: 'delete', payload: JSON.stringify({ id: task.id }), localTimestamp: nowIso(), retryCount: 0 }); } };
  const archiveDocument = async (document: DocumentRecord) => { const timestamp = nowIso(); const saved = await persistDocument({ ...document, status: 'archived' as DocumentStatus, archivedAt: timestamp, updatedAt: timestamp, syncState: user?.preview ? 'local' : 'pending' }); setDocuments((all) => all.map((item) => item.id === saved.id ? saved : item)); };
  const deleteOverdueDocument = async (document: DocumentRecord) => {
    await removeLocalDocumentAndTasks(document.id);
    setDocuments((all) => all.filter((item) => item.id !== document.id));
    setTasks((all) => all.filter((task) => task.documentId !== document.id));
    if (!user || user.preview || !supabase) return;
    try {
      await deleteRemoteDocument(document);
    } catch {
      await queueMutation({ id: createId('mutation'), ownerId: document.ownerId, entity: 'document', operation: 'delete', payload: JSON.stringify(document), localTimestamp: nowIso(), retryCount: 0 });
    }
  };
  const reviewOverdueTask = (task: TaskRecord) => {
    const document = documents.find((item) => item.id === task.documentId);
    if (!document) return;
    Alert.alert('Is this task resolved?', `Choose what to do with "${task.title}" and its plan.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Keep in Vault',
        onPress: () => {
          void archiveDocument(document).catch((error) => {
            Alert.alert('Could not move to Vault', error instanceof Error ? error.message : 'Please try again.');
          });
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => Alert.alert('Delete this plan permanently?', 'This removes the plan, all linked tasks, and any retained image. This cannot be undone.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete permanently',
            style: 'destructive',
            onPress: () => {
              void deleteOverdueDocument(document).catch((error) => {
                Alert.alert('Could not delete plan', error instanceof Error ? error.message : 'Please try again.');
              });
            },
          },
        ]),
      },
    ]);
  };
  const confirmArchive = async () => {
    if (!archiveReview) return;
    setArchiving(true);
    try {
      await archiveDocument(archiveReview);
      setArchiveReview(null);
    } catch (error) {
      Alert.alert('Could not move to Vault', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setArchiving(false);
    }
  };
  const restoreReviewedTasks = async () => {
    if (!archiveReview) return;
    const completedTasks = tasks.filter((task) => task.documentId === archiveReview.id && task.completed);
    if (!completedTasks.length) {
      setArchiveReview(null);
      return;
    }
    setRestoringReviewedTasks(true);
    const failedTaskTitles: string[] = [];
    const restoredTasks = new Map<string, TaskRecord>();
    for (const task of completedTasks) {
      try {
        const restored = await persistTask({
          ...task,
          completed: false,
          updatedAt: nowIso(),
          syncState: user?.preview ? 'local' : 'pending',
        });
        restoredTasks.set(restored.id, restored);
        setTasks((all) => all.map((item) => item.id === restored.id ? restored : item));
      } catch {
        failedTaskTitles.push(task.title);
      }
    }
    const restoredChain = tasks
      .filter((task) => task.documentId === archiveReview.id)
      .map((task) => restoredTasks.get(task.id) ?? task);
    const currentTask = getCurrentTaskInChain(restoredChain);
    if (currentTask) void scheduleTaskReminders(currentTask);
    setRestoringReviewedTasks(false);
    if (failedTaskTitles.length) {
      Alert.alert('Could not restore all tasks', `Restored ${completedTasks.length - failedTaskTitles.length} of ${completedTasks.length} tasks. Please try again for: ${failedTaskTitles.join(', ')}.`);
      return;
    }
    setArchiveReview(null);
  };
  const restoreDocument = async (document: DocumentRecord) => { const saved = await persistDocument({ ...document, status: 'active' as DocumentStatus, archivedAt: undefined, updatedAt: nowIso(), syncState: user?.preview ? 'local' : 'pending' }); setDocuments((all) => all.map((item) => item.id === saved.id ? saved : item)); };
  const restoreSelectedVaultRecords = async () => {
    const selected = documents.filter((document) => selectedVaultIds.has(document.id) && document.status === 'archived');
    if (!selected.length) return;
    setVaultActionBusy(true);
    const failedIds = new Set<string>();
    for (const document of selected) {
      try {
        await restoreDocument(document);
      } catch {
        failedIds.add(document.id);
      }
    }
    setSelectedVaultIds(failedIds);
    setVaultActionBusy(false);
    if (failedIds.size) Alert.alert('Could not restore all records', `${selected.length - failedIds.size} restored. Please try the remaining record${failedIds.size === 1 ? '' : 's'} again.`);
  };
  const restoreVaultDocumentDetails = async () => {
    if (!vaultDocumentDetails) return;
    setVaultActionBusy(true);
    try {
      await restoreDocument(vaultDocumentDetails);
      setVaultDocumentDetails(null);
    } catch (error) {
      Alert.alert('Could not restore record', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setVaultActionBusy(false);
    }
  };
  const deleteSelectedVaultRecords = async () => {
    const selected = documents.filter((document) => selectedVaultIds.has(document.id) && document.status === 'archived');
    if (!selected.length || !user) return;
    setVaultActionBusy(true);
    const failedIds = new Set<string>();
    for (const document of selected) {
      try {
        if (!user.preview && supabase) {
          try {
            await deleteRemoteDocument(document);
          } catch {
            await queueMutation({ id: createId('mutation'), ownerId: document.ownerId, entity: 'document', operation: 'delete', payload: JSON.stringify(document), localTimestamp: nowIso(), retryCount: 0 });
          }
        }
        await removeLocalDocumentAndTasks(document.id);
        setDocuments((all) => all.filter((item) => item.id !== document.id));
        setTasks((all) => all.filter((task) => task.documentId !== document.id));
      } catch {
        failedIds.add(document.id);
      }
    }
    setSelectedVaultIds(failedIds);
    setDeleteVaultVisible(false);
    setVaultDeleteFromDetails(false);
    setVaultActionBusy(false);
    if (failedIds.size) Alert.alert('Could not delete all records', `${selected.length - failedIds.size} deleted. Please try the remaining record${failedIds.size === 1 ? '' : 's'} again.`);
  };
  const activeDocuments = documents.filter((document) => document.status === 'active'); const activeTasks = tasks.filter((task) => activeDocuments.some((document) => document.id === task.documentId)); const activePlans = activeDocuments.map((document) => ({ document, tasks: activeTasks.filter((task) => task.documentId === document.id).sort((a, b) => a.position - b.position) })).filter(({ tasks: planTasks }) => planTasks.length > 0).sort((a, b) => (a.document.details.dueDate ?? '9999').localeCompare(b.document.details.dueDate ?? '9999')); const sortByDeadline = (a: TaskRecord, b: TaskRecord) => Number(a.completed) - Number(b.completed) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'); const nextTasks = getCurrentTasks(activeTasks).sort(sortByDeadline); const recentlyCompletedTasks = activeTasks.filter((task) => recentlyCompletedTaskIds.has(task.id)); const temporarilyHiddenDocumentIds = new Set(recentlyCompletedTasks.map((task) => task.documentId)); const upcomingTasks = [...recentlyCompletedTasks, ...nextTasks.filter((task) => !temporarilyHiddenDocumentIds.has(task.documentId))]; const upcomingReminders = getUpcomingTaskReminders(nextTasks); const tasksForSelectedDay = activeTasks.filter((task) => task.dueDate === selectedDate).sort(sortByDeadline); const overdueCautionTasks = getRecentOverdueTasks(activeTasks); const overdueFollowUpTasks = getOverdueTasksForFollowUp(activeTasks).filter((task) => !dismissedOverdueTaskIds.has(task.id)); const readyToArchive = activeDocuments.filter((document) => { const documentTasks = tasks.filter((task) => task.documentId === document.id); return documentTasks.length > 0 && documentTasks.every((task) => task.completed) && !documentTasks.some((task) => recentlyCompletedTaskIds.has(task.id)); }); const selectedTask = taskDetails ? tasks.find((task) => task.id === taskDetails.id) ?? taskDetails : null; const selectedTaskDocument = selectedTask ? documents.find((document) => document.id === selectedTask.documentId) : undefined; const tasksInSelectedPlan = selectedTask ? tasks.filter((task) => task.documentId === selectedTask.documentId).sort((a, b) => a.position - b.position) : [];
  const selectedArchivedVaultDocuments = documents.filter((document) => document.status === 'archived' && selectedVaultIds.has(document.id));
  const refreshDeliveredReminders = async (showError = false) => {
    try {
      const presented = await Notifications.getPresentedNotificationsAsync();
      const currentTasks = new Map(nextTasks.map((task) => [task.id, task]));
      const reminders = presented.flatMap((notification) => {
        const taskId = notification.request.content.data?.taskId;
        if (typeof taskId !== 'string') return [];
        const task = currentTasks.get(taskId);
        if (!task?.dueDate) return [];
        const due = new Date(`${task.dueDate}T09:00:00+08:00`);
        if (Number.isNaN(due.getTime())) return [];
        const dataDays = notification.request.content.data?.daysUntilDue;
        const bodyDays = /due in (\d+) days?/i.exec(notification.request.content.body ?? '')?.[1];
        const daysUntilDue = typeof dataDays === 'number'
          ? dataDays
          : bodyDays ? Number(bodyDays) : Math.max(0, Math.round((due.getTime() - notification.date) / (24 * 60 * 60 * 1000)));
        return [{ taskId, taskTitle: task.title, daysUntilDue, scheduledAt: new Date(notification.date) }];
      }).sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
      setDeliveredReminders(reminders);
    } catch (error) {
      console.error('Could not load delivered notifications', error);
      if (showError) Alert.alert('Could not load notifications', 'Please try opening Notifications again.');
    }
  };
  useEffect(() => {
    void refreshDeliveredReminders();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshDeliveredReminders();
    });
    const notificationSubscription = Notifications.addNotificationReceivedListener(() => {
      void refreshDeliveredReminders();
    });
    return () => {
      appStateSubscription.remove();
      notificationSubscription.remove();
    };
  }, [tasks, documents]);
  const toggleBiometric = async (next: boolean) => { if (next) { if (!(await LocalAuthentication.hasHardwareAsync())) { Alert.alert('Not available', 'This device does not offer biometric or device-credential authentication.'); return; } const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm Vault protection', disableDeviceFallback: false }); if (!result.success) return; } setBiometricEnabled(next); await SecureStore.setItemAsync('pictask.biometric', String(next)); };
  const exportData = async () => { await Share.share({ title: 'PicTask export', message: JSON.stringify({ exportedAt: nowIso(), documents, tasks }, null, 2) }); };
  const resetPassword = async () => { if (!supabase || !user || user.preview) return; const { error } = await supabase.auth.resetPasswordForEmail(user.email); Alert.alert(error ? 'Could not send email' : 'Email sent', error?.message ?? 'Check your inbox for password-reset instructions.'); };
  const deleteAccount = () => Alert.alert('Delete account?', 'This permanently removes your app records, optional vault images, and local cache.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => {
        void (async () => {
          if (!user) return;
          if (!user.preview) {
            if (!supabase) {
              Alert.alert('Could not delete account', 'Supabase is not configured. Your account and data have not been deleted.');
              return;
            }
            const { error } = await supabase.functions.invoke('delete-account');
            if (error) {
              console.error('Account deletion failed', error);
              Alert.alert('Could not delete account', `${await getFunctionErrorMessage(error)} Your data has not been removed from this device.`);
              return;
            }
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) console.error('Could not clear the deleted account session', signOutError);
          }
          try {
            await removeLocalRecords(user.id);
          } catch (error) {
            console.error('Could not remove local records after account deletion', error);
            Alert.alert('Account deleted', 'Your account was deleted, but some data remains cached on this device. Please clear the app storage or reinstall PicTask.');
          } finally {
            setUser(null);
          }
        })().catch((error: unknown) => {
          console.error('Account deletion failed unexpectedly', error);
          Alert.alert('Could not delete account', error instanceof Error ? error.message : 'Please try again.');
        });
      },
    },
  ]);
  const signOut = async () => { if (supabase && !user?.preview) await supabase.auth.signOut(); setUser(null); };
  const openNotifications = async () => {
    setNotificationsVisible(true);
    await refreshDeliveredReminders(true);
  };
  if (!ready || !startupComplete) return <View style={[layout.screen, styles.startupScreen]}><ScreenBackground /><NavigationBar style={isDark ? 'dark' : 'light'} /><StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} /><View style={styles.startupBrand}><View style={styles.startupMark}><AppIcon name="check" size={28} color={colors.onPrimary} /></View><Text style={styles.startupName}>PicTask</Text></View>{reducedMotion ? <View style={styles.startupStaticIndicator} /> : <ActivityIndicator accessibilityLabel="Loading PicTask" size="small" color={colors.primary} style={styles.startupIndicator} />}<Text style={styles.startupMessage}>Getting things ready for you...</Text></View>;
  if (!user) return <><NavigationBar style={isDark ? 'dark' : 'light'} /><AuthScreen onPreview={() => setUser({ id: 'local-preview', email: 'Local preview', preview: true })} /></>;

  const renderHome = () => <ScrollView contentContainerStyle={layout.content}>
    <AppHeader notificationCount={deliveredReminders.length} onNotificationsPress={() => void openNotifications()} />
    <View style={[styles.attentionCard, isDark && styles.attentionCardDark]}>
      <View pointerEvents="none" style={styles.attentionGlow} />
      <View pointerEvents="none" style={styles.attentionAccent} />
      <View style={styles.attentionCopy}>
        <Text style={styles.attentionEyebrow}>{new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())}</Text>
        <Text accessibilityRole="header" style={styles.attentionTitle}>
          {nextTasks.length === 0 ? 'Well done!' : `${nextTasks.length} task${nextTasks.length === 1 ? '' : 's'} need${nextTasks.length === 1 ? 's' : ''} attention`}
        </Text>
        {nextTasks.length === 0 ? <Text style={styles.attentionSubtitle}>You're all caught up. Enjoy the breathing room.</Text> : null}
      </View>
      <Svg width={158} height={158} viewBox="0 0 160 160" style={styles.attentionArtwork} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M66 31 130 43a9 9 0 0 1 7 11l-19 79a10 10 0 0 1-12 7l-61-15a10 10 0 0 1-7-12l18-75a10 10 0 0 1 10-7Z" fill="#075E63" opacity={0.65} />
        <Path d="m60 25 65 12a8 8 0 0 1 6 10l-18 77a9 9 0 0 1-10 7l-64-14a9 9 0 0 1-7-11l17-74a9 9 0 0 1 11-7Z" fill="#FFFFFF" />
        <Path d="m75 29 3-10a8 8 0 0 1 9-6l14 3a8 8 0 0 1 6 9l-2 10Z" fill="#087A78" />
        <Path d="m53 58 7 7 14-15" fill="none" stroke="#078E87" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="m88 59 25 5M49 89l7 7 14-15" fill="none" stroke="#078E87" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="m84 91 23 5M45 115l7 7 14-15" fill="none" stroke="#078E87" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="m80 117 21 5" fill="none" stroke="#A8D9D7" strokeWidth={5} strokeLinecap="round" />
        <Path d="m28 42 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Zm108 62 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#B4F1E8" opacity={0.8} />
      </Svg>
    </View>
    {user.preview ? <Card style={styles.previewCard}><Pill text="Local preview" tone="warning" /><Text style={layout.body}>A space to try things out. Your preview stays on this device.</Text></Card> : null}
    {overdueCautionTasks.map((task) => {
      const document = activeDocuments.find((item) => item.id === task.documentId);
      return <Card key={task.id} style={styles.overdueReviewCard}>
        <Pill text="Overdue · action needed" tone="warning" />
        <Text style={layout.heading}>{task.title}</Text>
        <Text style={layout.subtitle}>{document?.details.title ?? 'Plan'} · Due {dayLabel(task.dueDate)}</Text>
        <Text style={layout.body}>This task is past due. Review it or mark it done.</Text>
        <View style={styles.overdueReviewActions}>
          <Button label="Review task" kind="secondary" onPress={() => { setTaskEditErrors({}); setEditTask(task); }} />
          <Button label="Mark done" onPress={() => void toggleTask(task)} />
        </View>
      </Card>;
    })}
    {overdueFollowUpTasks.map((task) => {
      const document = activeDocuments.find((item) => item.id === task.documentId);
      return <Card key={task.id} style={styles.overdueReviewCard}>
        <View style={styles.overdueReviewHeader}>
          <View style={styles.grow}><Pill text="Overdue more than 30 days" tone="warning" /><Text style={[layout.heading, styles.overdueTaskTitle]}>{task.title}</Text><Text style={layout.subtitle}>{document?.details.title ?? 'Plan'} · Due {dayLabel(task.dueDate)}</Text></View>
        </View>
        <Text style={layout.body}>Is this task resolved? Move its plan to Vault or delete it.</Text>
        <View style={styles.overdueReviewActions}>
          <Button label="Dismiss" kind="secondary" onPress={() => setDismissedOverdueTaskIds((current) => new Set(current).add(task.id))} />
          <Button label="Done" onPress={() => reviewOverdueTask(task)} />
        </View>
      </Card>;
    })}
    {readyToArchive.length ? <><Text style={layout.heading}>Ready for Vault</Text>{readyToArchive.map((document) => <Card key={document.id}><Text style={layout.heading}>{document.details.title}</Text><Text style={layout.subtitle}>All tasks are complete. Review the record before moving it to your Vault.</Text><Button label="Review record" onPress={() => setArchiveReview(document)} /></Card>)}</> : null}
    <View style={styles.homePlanSection}>
    <View style={styles.sectionHeader}>
      <Text style={layout.heading}>Plans</Text>
      {activePlans.length > 1 ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={plansExpanded ? 'View less plans' : `View more plans, ${activePlans.length} total`}
        accessibilityState={{ expanded: plansExpanded }}
        onPress={() => setPlansExpanded((expanded) => !expanded)}
      >
        <Text style={styles.link}>{plansExpanded ? 'View less' : 'View more'}</Text>
      </Pressable> : null}
    </View>
    {activePlans.slice(0, plansExpanded ? activePlans.length : 1).map(({ document, tasks: planTasks }) => {
      const currentTask = getCurrentTaskInChain(planTasks) ?? planTasks[0];
      const completedCount = planTasks.filter((task) => task.completed).length;
      return <Card key={document.id} style={styles.planCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${document.details.title}, ${completedCount} of ${planTasks.length} tasks done, due ${dayLabel(document.details.dueDate)}`}
          accessibilityHint={currentTask ? 'Opens this plan and its task list' : undefined}
          disabled={!currentTask}
          onPress={() => { if (currentTask) setTaskDetails(currentTask); }}
        >
          <View style={styles.sectionHeader}>
            <DocumentThumbnail document={document} />
            <View style={styles.grow}>
              <View style={styles.vaultTitleRow}>
                <Text style={[layout.heading, styles.vaultTitle]}>{document.details.title}</Text>
                <Text style={styles.smallNote}>{completedCount}/{planTasks.length} tasks</Text>
              </View>
              <View style={styles.dueDateLine}><AppIcon name="calendar" size={15} color={colors.textMuted} /><Text style={layout.subtitle}>{dayLabel(document.details.dueDate)}</Text></View>
            </View>
            <PlanProgress completed={completedCount} total={planTasks.length} />
          </View>
        </Pressable>
      </Card>;
    })}
    {!activePlans.length ? <Card><Text style={layout.body}>Your plans will appear here when you create one.</Text></Card> : null}
    <View style={styles.sectionHeader}><Text style={layout.heading}>Upcoming</Text><Pressable onPress={() => setTab('calendar')}><Text style={styles.link}>View calendar</Text></Pressable></View>
    {upcomingTasks.slice(0, 4).map((task) => <Card key={task.id}><TaskRow task={task} onToggle={() => void toggleTask(task)} onOpen={() => setTaskDetails(task)} onEdit={() => { setTaskEditErrors({}); setEditTask(task); }} reducedMotion={reducedMotion} /></Card>)}
    {!upcomingTasks.length ? <Card style={[styles.emptyCard, styles.emptyGlassCard, { backgroundColor: isDark ? 'rgba(27, 57, 62, 0.68)' : 'rgba(190, 225, 238, 0.5)' }]}><View style={styles.emptyCoffeeIcon}><AppIcon name="coffee" size={26} color={colors.primary} /></View><Text style={layout.heading}>A little breathing room.</Text><Text style={styles.emptyText}>Your upcoming tasks will find a home here. Start by scanning your first document.</Text><Button label="Scan a document" kind="secondary" onPress={() => setTab("scan")} /></Card> : null}
    </View>
  </ScrollView>;
  const renderCalendar = () => <ScrollView contentContainerStyle={layout.content}><View><Text style={layout.title}>Calendar</Text><Text style={layout.subtitle}>Choose a day to see its planned actions.</Text></View><CalendarGrid tasks={activeTasks} selectedDate={selectedDate} onSelect={setSelectedDate} /><View style={styles.sectionHeader}><View><Text style={layout.heading}>{dayLabel(selectedDate)}</Text><Text style={layout.subtitle}>Tasks for this date</Text></View><Pill text={`${tasksForSelectedDay.length} task${tasksForSelectedDay.length === 1 ? '' : 's'}`} tone="blue" /></View>{tasksForSelectedDay.map((task) => <Card key={task.id}><TaskRow task={task} blockedBy={getTaskPrerequisite(activeTasks, task)} onToggle={() => void toggleTask(task)} onOpen={() => setTaskDetails(task)} onEdit={() => { setTaskEditErrors({}); setEditTask(task); }} reducedMotion={reducedMotion} /></Card>)}{!tasksForSelectedDay.length ? <Card style={[styles.emptyCard, styles.emptyGlassCard, { backgroundColor: isDark ? 'rgba(27, 57, 62, 0.68)' : 'rgba(190, 225, 238, 0.5)' }]}><View style={styles.emptyCoffeeIcon}><AppIcon name="coffee" size={26} color={colors.primary} /></View><Text style={layout.heading}>A little breathing room.</Text><Text style={styles.emptyText}>Nothing is scheduled for this day. Take a moment to chill and relax.</Text><Button label="Create a task" kind="secondary" onPress={() => startManual(selectedDate)} /></Card> : null}</ScrollView>;
  const renderScanStart = () => <ScrollView contentContainerStyle={layout.content}><View><Text style={layout.title}>Create a plan</Text><Text style={layout.subtitle}>Scan a bill, import a notice, or start with a manual task.</Text></View><Card style={styles.scanFeature}><AppIcon name="file-text" size={36} color={colors.primary} /><Text style={layout.heading}>Your document stays in your control</Text><Text style={layout.subtitle}>Text recognition runs on your Android device. You review every detail before saving.</Text></Card><Button label="Scan document" onPress={() => void scanImage('camera')} /><Button label="Import photo" kind="secondary" onPress={() => void scanImage('photo')} /><Button label="Create task manually" kind="secondary" onPress={startManual} /><Card><Text style={layout.label}>Privacy default</Text><Text style={layout.body}>Scans save as reviewed details only unless you explicitly choose to retain the original image.</Text></Card></ScrollView>;
  const renderReview = () => {
    if (!review) return null;
    const identifier = review.details.accountNumber;
    return <ScrollView ref={reviewScrollRef} contentContainerStyle={layout.content} keyboardShouldPersistTaps="handled">
      <View style={styles.sectionHeader}>
        <View><Text style={layout.title}>Review details</Text><Text style={layout.subtitle}>{review.confidence === 'high' ? 'Check the detected fields before creating tasks.' : 'Add the missing details to make this plan useful.'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close review" hitSlop={10} onPress={() => { setReview(null); setReviewErrors({}); }}><AppIcon name="x" size={22} color={colors.textMuted} /></Pressable>
      </View>
      {review.sourceUri ? <Image source={{ uri: review.sourceUri }} style={styles.previewImage} /> : null}
      <Card>
        <Text style={layout.label}>Document type</Text>
        <View style={styles.choiceRow}>{(['bill', 'deadline', 'general'] as DocumentCategory[]).map((category) => <Pressable key={category} onPress={() => changeCategory(category)} style={[styles.choice, review.category === category && styles.choiceSelected]}><Text style={[styles.choiceText, review.category === category && styles.choiceTextSelected]}>{category === 'bill' ? 'Bill' : category === 'deadline' ? 'Deadline' : 'General'}</Text></Pressable>)}</View>
        <Text style={layout.label}>Title *</Text>
        <TextInput ref={(input) => { validationInputs.current.title = input; }} keyboardAppearance={isDark ? 'dark' : 'light'} style={[layout.input, reviewErrors.title ? styles.validationInput : undefined]} value={review.details.title} onChangeText={(title) => { updateReview({ title }); setReviewErrors((errors) => ({ ...errors, title: '' })); }} placeholder="Task title" placeholderTextColor={colors.textMuted} />
        {reviewErrors.title ? <Text accessibilityRole="alert" style={styles.validationError}>{reviewErrors.title}</Text> : null}
        <Text style={layout.label}>Provider or source</Text>
        <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} style={layout.input} value={review.details.provider} onChangeText={(provider) => updateReview({ provider })} placeholder="Meralco, school, employer..." placeholderTextColor={colors.textMuted} />
        <Text style={layout.label}>Amount due</Text>
        <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} style={layout.input} keyboardType="decimal-pad" value={amountDueInput} onChangeText={(value) => { const sanitized = value.replace(/,/g, '').replace(/[^\d.]/g, ''); const [whole = '', ...fraction] = sanitized.split('.'); const nextValue = fraction.length ? `${whole}.${fraction.join('').slice(0, 2)}` : whole; setAmountDueInput(nextValue); updateReview({ amountDue: nextValue && nextValue !== '.' ? Number(nextValue) : undefined }); }} placeholder="e.g. 1520.50" placeholderTextColor={colors.textMuted} />
        <Text style={layout.label}>Due date *</Text>
        <View ref={(view) => { validationViews.current.dueDate = view; }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Choose due date${review.details.dueDate ? `, ${dayLabel(review.details.dueDate)}` : ''}`} onPress={() => openDatePicker({ kind: 'review' }, review.details.dueDate)} style={[layout.input, styles.dateField, reviewErrors.dueDate ? styles.validationInput : undefined]}>
            <AppIcon name="calendar" size={18} color={colors.primary} />
            <Text style={review.details.dueDate ? layout.body : styles.datePlaceholder}>{review.details.dueDate ? dayLabel(review.details.dueDate) : 'Choose a date'}</Text>
          </Pressable>
        </View>
        {reviewErrors.dueDate ? <Text accessibilityRole="alert" style={styles.validationError}>{reviewErrors.dueDate}</Text> : null}
        <Text style={layout.label}>Billing period</Text>
        <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} style={layout.input} value={review.details.billingPeriod ?? ''} onChangeText={(billingPeriod) => updateReview({ billingPeriod })} placeholder="Optional" placeholderTextColor={colors.textMuted} />
        <Text style={layout.label}>Account/reference number</Text>
        <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} style={layout.input} value={review.details.accountNumber ?? ''} onChangeText={(accountNumber) => updateReview({ accountNumber })} placeholder="Optional" placeholderTextColor={colors.textMuted} />
        {identifier ? <View style={styles.inline}><Pill text={maskIdentifier(identifier)} /><Text style={styles.smallNote}>Masked in the app by default.</Text></View> : null}
        <View style={styles.switchRow}><View style={styles.grow}><Text style={layout.body}>Retain full identifier</Text><Text style={layout.subtitle}>Only enable if you need it for payment reference.</Text></View><Switch value={review.details.retainFullIdentifier} onValueChange={(retainFullIdentifier) => updateReview({ retainFullIdentifier })} trackColor={{ true: colors.primary }} /></View>
      </Card>
      <Card>
        <Text style={layout.heading}>Keep the original image?</Text>
        <Text style={layout.subtitle}>Details only is selected by default.</Text>
        {(['details_only', 'image_and_details', 'discard_after_task'] as RetentionChoice[]).map((retention) => <Pressable key={retention} onPress={() => setReview({ ...review, retention })} style={[styles.retentionOption, review.retention === retention && styles.retentionSelected]}><Text style={styles.retentionTitle}>{retention === 'details_only' ? 'Save reviewed details only' : retention === 'image_and_details' ? 'Save image and reviewed details' : 'Discard image after task creation'}</Text><Text style={layout.subtitle}>{retention === 'details_only' ? 'Original image is not kept.' : retention === 'image_and_details' ? 'Stored privately in your Vault.' : 'Creates tasks but keeps no source record.'}</Text></Pressable>)}
      </Card>
      <Card>
        <Text style={layout.heading}>Suggested tasks</Text>
        <Text style={layout.subtitle}>Set the order for this task chain. Complete each step before the next one becomes available; use the up button to move tasks earlier.</Text>
        {reviewTasks.map((task, index) => <View key={task.id} style={styles.draftTask}>
          <Text style={styles.taskMeta}>{stepLabel(index)}</Text>
          <TextInput ref={(input) => { validationInputs.current[`task-${task.id}`] = input; }} keyboardAppearance={isDark ? 'dark' : 'light'} style={[layout.input, reviewErrors[`task-${task.id}`] ? styles.validationInput : undefined]} value={task.title} onChangeText={(title) => { setReviewTasks((all) => all.map((item) => item.id === task.id ? { ...item, title } : item)); setReviewErrors((errors) => ({ ...errors, [`task-${task.id}`]: '' })); }} />
          {reviewErrors[`task-${task.id}`] ? <Text accessibilityRole="alert" style={styles.validationError}>{reviewErrors[`task-${task.id}`]}</Text> : null}
          <View style={styles.draftTaskActions}>
            <View style={styles.grow} ref={(view) => { validationViews.current[`taskDue-${task.id}`] = view; }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Choose due date for ${task.title}${task.dueDate ? `, ${dayLabel(task.dueDate)}` : ''}`} onPress={() => openDatePicker({ kind: 'suggested', taskId: task.id }, task.dueDate)} style={[layout.input, styles.dateField, styles.taskDateField, reviewErrors[`taskDue-${task.id}`] ? styles.validationInput : undefined]}>
                <AppIcon name="calendar" size={16} color={colors.primary} />
                <Text style={task.dueDate ? styles.taskDateText : styles.datePlaceholder}>{task.dueDate ? dayLabel(task.dueDate) : 'Choose due date'}</Text>
              </Pressable>
            </View>
            <View style={styles.reorderActions}>
            <Pressable style={[styles.reorderButton, styles.reorderRemoveButton]} accessibilityRole="button" accessibilityLabel={`Remove ${task.title}`} onPress={() => setReviewTasks((all) => all.filter((item) => item.id !== task.id))}><AppIcon name="x" size={19} color={colors.danger} /></Pressable>
            <Pressable style={[styles.reorderButton, styles.reorderMoveButton, index === 0 && styles.disabled]} accessibilityRole="button" accessibilityLabel={`Move ${task.title} up`} disabled={index === 0} onPress={() => setReviewTasks((all) => { const copy = [...all]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; return copy.map((item, position) => ({ ...item, position })); })}><Text style={styles.reorderButtonText}>{'\u2191'}</Text></Pressable>
            </View>
          </View>
          {reviewErrors[`taskDue-${task.id}`] ? <Text accessibilityRole="alert" style={styles.validationError}>{reviewErrors[`taskDue-${task.id}`]}</Text> : null}
        </View>)}
        <View style={[styles.grow, styles.draftTask]}>
          <TextInput ref={(input) => { validationInputs.current.newTask = input; }} keyboardAppearance={isDark ? 'dark' : 'light'} style={[layout.input, reviewErrors.newTask ? styles.validationInput : undefined]} value={newTaskTitle} onChangeText={(value) => { setNewTaskTitle(value); setReviewErrors((errors) => ({ ...errors, newTask: '' })); }} placeholder="Add a task" placeholderTextColor={colors.textMuted} />
          {reviewErrors.newTask ? <Text accessibilityRole="alert" style={styles.validationError}>{reviewErrors.newTask}</Text> : null}
          <View style={styles.addTask}>
            <View style={styles.grow} ref={(view) => { validationViews.current.newTaskDueDate = view; }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Choose due date for new task${newTaskDueDate ? `, ${dayLabel(newTaskDueDate)}` : ''}`} onPress={() => openDatePicker({ kind: 'newTask' }, newTaskDueDate)} style={[layout.input, styles.dateField, styles.taskDateField, reviewErrors.newTaskDueDate ? styles.validationInput : undefined]}>
                <AppIcon name="calendar" size={16} color={colors.primary} />
                <Text style={newTaskDueDate ? styles.taskDateText : styles.datePlaceholder}>{newTaskDueDate ? dayLabel(newTaskDueDate) : 'Choose due date'}</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={addDraftTask} style={styles.addCircle}><AppIcon name="plus" size={22} color={colors.onPrimary} /></Pressable>
          </View>
          {reviewErrors.newTaskDueDate ? <Text accessibilityRole="alert" style={styles.validationError}>{reviewErrors.newTaskDueDate}</Text> : null}
        </View>
      </Card>
      <Button label="Save plan" onPress={() => void saveReview()} />
      <View style={{ marginTop: -10 }}><Button label="Cancel" kind="cancel" onPress={() => { setReview(null); setReviewErrors({}); }} /></View>
    </ScrollView>;
  };
  const renderVault = () => {
    const archivedDocuments = documents.filter((document) => document.status === 'archived');
    const toggleVaultSelection = (documentId: string) => setSelectedVaultIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
    const query = vaultSearch.trim().toLocaleLowerCase();
    const matchingDocuments = archivedDocuments.filter((document) => {
      if (vaultCategory !== 'all' && document.category !== vaultCategory) return false;
      const searchableText = [
        document.details.title,
        document.details.provider,
        document.details.billingPeriod,
        document.details.dueDate,
        document.details.amountDue?.toString(),
        document.details.accountNumber,
        document.category,
        document.sourceType,
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      return searchableText.includes(query);
    });
    return <ScrollView contentContainerStyle={layout.content}>
      <View><Text style={layout.title}>Vault</Text><Text style={layout.subtitle}>Completed records, protected by your device lock.</Text></View>
      <View style={styles.vaultSearch}>
        <AppIcon name="search" size={19} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search Vault files"
          keyboardAppearance={isDark ? 'dark' : 'light'}
          style={styles.vaultSearchInput}
          value={vaultSearch}
          onChangeText={setVaultSearch}
          placeholder="Search files"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
      </View>
      <View style={styles.choiceRow}>
        {([
          { value: 'all', label: 'All' },
          { value: 'bill', label: 'Bills' },
          { value: 'deadline', label: 'Deadlines' },
          { value: 'general', label: 'General' },
        ] as const).map(({ value, label }) => {
          const selected = vaultCategory === value;
          return <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => setVaultCategory(value)}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
          </Pressable>;
        })}
      </View>
      {selectedArchivedVaultDocuments.length ? <Card style={styles.vaultSelectionBar}>
        <View style={styles.sectionHeader}><Text style={layout.heading}>{selectedArchivedVaultDocuments.length} selected</Text><Pressable accessibilityRole="button" onPress={() => setSelectedVaultIds(new Set())}><Text style={styles.rowAction}>Clear</Text></Pressable></View>
        <View style={styles.vaultSelectionActions}>
          <View style={styles.vaultSelectionAction}><Button label={vaultActionBusy ? 'Restoring…' : 'Restore selected'} kind="secondary" disabled={vaultActionBusy || deleteVaultVisible} onPress={() => void restoreSelectedVaultRecords()} /></View>
          <View style={styles.vaultSelectionAction}><Button label="Delete selected" kind="danger" disabled={vaultActionBusy} onPress={() => setDeleteVaultVisible(true)} /></View>
        </View>
      </Card> : null}
      {!selectedArchivedVaultDocuments.length ? <Text style={styles.smallNote}>Long press a record to select it for restore or deletion.</Text> : null}
      {matchingDocuments.map((document) => {
        const docTasks = tasks.filter((task) => task.documentId === document.id);
        const selected = selectedVaultIds.has(document.id);
        return <Card key={document.id} style={[styles.vaultRecordCard, selected && styles.vaultRecordSelected]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${document.details.title}, ${selected ? 'selected' : 'not selected'}`} accessibilityState={{ selected }} accessibilityHint={selectedVaultIds.size ? 'Tap to change selection. Long press to select this record and its linked tasks.' : 'Opens archived record details. Long press to select this record and its linked tasks.'} onLongPress={() => toggleVaultSelection(document.id)} onPress={() => { if (selectedVaultIds.size) toggleVaultSelection(document.id); else setVaultDocumentDetails(document); }}>
            <View style={styles.sectionHeader}>
              <DocumentThumbnail document={document} />
              <View style={styles.grow}><View style={styles.vaultTitleRow}><Text style={[layout.heading, styles.vaultTitle]}>{document.details.title}</Text><Text style={styles.smallNote}>{docTasks.filter((task) => task.completed).length}/{docTasks.length} tasks</Text></View><Text style={layout.subtitle}>{document.details.provider || 'Saved record'}</Text><View style={styles.dueDateLine}><AppIcon name="calendar" size={14} color={colors.textMuted} /><Text style={styles.taskMeta}>{dayLabel(document.details.dueDate)}</Text></View></View>
              <View style={styles.vaultRecordStatus}>{selected ? <View style={styles.vaultSelectionMark}><AppIcon name="check" size={14} color={colors.onPrimary} /></View> : null}<Pill text="Archived" tone="success" /></View>
            </View>
          </Pressable>
        </Card>;
      })}
      {!archivedDocuments.length ? <Card style={[styles.emptyVaultCard, { backgroundColor: colors.background, borderColor: colors.background }]}>
        <View style={[styles.emptyVaultIcon, { backgroundColor: isDark ? '#25392C' : '#EAF2E9' }]}><AppIcon name="shield" size={28} color={isDark ? '#9BC9A5' : '#4F805A'} /></View>
        <Text style={[layout.heading, { color: isDark ? '#9BC9A5' : '#4F805A' }]}>Your Vault is ready</Text>
        <Text style={layout.subtitle}>Create a task or scan a document. Once you finish its tasks, you can archive the record here for safekeeping.</Text>
        <Button label="Create a task" onPress={startManual} />
        <Button label="Scan a document" kind="secondary" onPress={() => setTab('scan')} />
      </Card> : null}
      {archivedDocuments.length > 0 && !matchingDocuments.length ? <Text style={layout.body}>No files found.</Text> : null}
    </ScrollView>;
  };
  const renderProfile = () => <ScrollView contentContainerStyle={layout.content}><View><Text style={layout.title}>Profile</Text><Text style={layout.subtitle}>{user.email}</Text></View><Card><Text style={layout.heading}>Appearance</Text><Text style={layout.subtitle}>Choose how PicTask looks across the app.</Text><Button label={`Switch to ${isDark ? 'light' : 'dark'} mode`} kind="secondary" leading={<AppIcon name={isDark ? 'sun' : 'moon'} size={20} color={colors.primaryDark} />} onPress={toggleTheme} /></Card><Card><View style={styles.switchRow}><View style={styles.grow}><Text style={layout.heading}>Vault protection</Text><Text style={layout.subtitle}>Ask for fingerprint, face, or device credential before opening Vault.</Text></View><Switch value={biometricEnabled} onValueChange={(value) => void toggleBiometric(value)} trackColor={{ true: colors.primary }} /></View></Card><Card><Text style={layout.heading}>Your data</Text><Text style={layout.subtitle}>Export a copy or permanently remove your account and records.</Text><Button label="Export my data" kind="secondary" onPress={() => void exportData()} /><Button label="Sync now" kind="secondary" onPress={() => void syncAll()} disabled={syncing || user.preview} />{!user.preview ? <Button label="Send password reset" kind="secondary" onPress={() => void resetPassword()} /> : null}<Button label="Delete account and data" kind="danger" onPress={deleteAccount} /></Card><Button label="Sign out" kind="cancel" onPress={() => void signOut()} /><Text style={styles.privacyNote}>PicTask does not use ads, behavioral tracking, cloud AI, or automatic payments.</Text></ScrollView>;
  const renderContent = () => review ? renderReview() : tab === 'home' ? renderHome() : tab === 'calendar' ? renderCalendar() : tab === 'scan' ? renderScanStart() : tab === 'vault' ? renderVault() : renderProfile();
  const datePickerValue = datePickerTarget?.kind === 'review' ? review?.details.dueDate
    : datePickerTarget?.kind === 'suggested' ? reviewTasks.find((task) => task.id === datePickerTarget.taskId)?.dueDate
    : datePickerTarget?.kind === 'newTask' ? newTaskDueDate
    : datePickerTarget?.kind === 'edit' ? editTask?.dueDate
    : undefined;
  const pickerYear = datePickerMonth.getFullYear();
  const pickerMonth = datePickerMonth.getMonth();
  const pickerFirstDay = new Date(pickerYear, pickerMonth, 1).getDay();
  const pickerDaysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
  const pickerCells = Array.from({ length: pickerFirstDay + pickerDaysInMonth }, (_, index) => index < pickerFirstDay ? null : index - pickerFirstDay + 1);
  const today = new Date();
  const todayValue = isoDateValue(today);
  const canShowPreviousMonth = pickerYear > today.getFullYear() || (pickerYear === today.getFullYear() && pickerMonth > today.getMonth());
  return <SafeAreaView style={layout.screen} edges={review ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}><ScreenBackground />{tab === 'home' && !review ? <View pointerEvents="none" style={[styles.homeBottomSurface, { height: Math.max(insets.bottom, 60) + 60, backgroundColor: colors.surface }]} /> : null}<NavigationBar style={isDark ? 'dark' : 'light'} /><StatusBar barStyle={isDark ? "light-content" : "dark-content"} /><AnimatedPage key={review ? "review" : tab}>{renderContent()}</AnimatedPage>{!review ? <View style={[styles.tabBar, styles.tabBarEdge, { paddingBottom: 4, paddingTop: 4, paddingHorizontal: 4, marginHorizontal: 8, marginBottom: Math.max(insets.bottom, 8) + 8, borderTopWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, shadowColor: '#000000', shadowOpacity: isDark ? 0.25 : 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }]}>{tabs.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.id }} onPress={() => changeTab(item.id)} style={({ pressed }) => [styles.tabItem, styles.tabItemEdge, { minHeight: 62, borderRadius: 18, paddingVertical: 5, gap: 2, justifyContent: 'center', backgroundColor: tab === item.id ? colors.blueSurface : 'transparent' }, pressed && { opacity: 0.6 }]}><View style={[styles.tabIndicator, { display: 'none' }]} /><View style={[styles.navIcon, { width: 40, height: 28 }]}><AppIcon name={item.icon} size={22} color={tab === item.id ? colors.primary : colors.textMuted} /></View><Text style={[styles.tabLabel, tab === item.id && styles.tabLabelSelected, { fontSize: 10 }]}>{item.label}</Text></Pressable>)}</View> : null}
    <Modal visible={Boolean(datePickerTarget)} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setDatePickerTarget(null)}>
      <View style={[styles.modalBackdrop, styles.datePickerBackdrop]}>
        <View style={styles.datePickerSheet}>
          <View style={styles.notificationHeader}>
            <View><Text style={layout.heading}>Choose due date</Text><Text style={layout.subtitle}>Select a day on the calendar</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close date picker" hitSlop={10} onPress={() => setDatePickerTarget(null)}><AppIcon name="x" size={22} color={colors.textMuted} /></Pressable>
          </View>
          <View style={styles.calendarHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !canShowPreviousMonth }} disabled={!canShowPreviousMonth} style={[styles.calendarArrow, !canShowPreviousMonth && styles.datePickerDisabled]} onPress={() => setDatePickerMonth(new Date(pickerYear, pickerMonth - 1, 1))}><AppIcon name="chevron-left" size={22} color={canShowPreviousMonth ? colors.primary : colors.textMuted} /></Pressable>
            <Text style={layout.heading}>{datePickerMonth.toLocaleString('en-PH', { month: 'long', year: 'numeric' })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" style={styles.calendarArrow} onPress={() => setDatePickerMonth(new Date(pickerYear, pickerMonth + 1, 1))}><AppIcon name="chevron-right" size={22} color={colors.primary} /></Pressable>
          </View>
          <View style={styles.weekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text style={styles.weekday} key={`${day}-${index}`}>{day}</Text>)}</View>
          <View style={styles.datePickerGrid}>{pickerCells.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={styles.datePickerDay} />;
            const value = isoDateValue(new Date(pickerYear, pickerMonth, day));
            const selected = value === datePickerValue;
            const disabled = value < todayValue;
            return <Pressable key={value} accessibilityRole="button" accessibilityLabel={new Intl.DateTimeFormat('en-PH', { dateStyle: 'full' }).format(new Date(`${value}T12:00:00`))} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => chooseDate(value)} style={[styles.datePickerDay, disabled && styles.datePickerDisabled, selected && styles.datePickerDaySelected]}><Text style={[styles.datePickerDayText, disabled && styles.datePickerDayTextDisabled, selected && styles.datePickerDayTextSelected]}>{day}</Text></Pressable>;
          })}</View>
          <Button label="Cancel" kind="secondary" onPress={() => setDatePickerTarget(null)} />
        </View>
      </View>
    </Modal>
    <Modal visible={notificationsVisible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setNotificationsVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.sheetKeyboard, styles.notificationSheet]}>
          <View style={styles.notificationHeader}>
            <View><Text style={layout.heading}>Notifications</Text><Text style={layout.subtitle}>Delivered task reminders</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" hitSlop={10} onPress={() => setNotificationsVisible(false)}><AppIcon name="x" size={22} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.notificationList, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {deliveredReminders.length ? deliveredReminders.map((reminder, index) => (
              <View key={`${reminder.taskId}-${reminder.daysUntilDue}-${index}`} style={styles.notificationItem}>
                <View style={styles.notificationIcon}><AppIcon name="bell" size={18} color={colors.primary} /></View>
                <View style={styles.grow}>
                  <Text style={styles.notificationTitle}>{reminder.taskTitle}</Text>
                  <Text style={styles.notificationBody}>Due in {reminder.daysUntilDue} day{reminder.daysUntilDue === 1 ? '' : 's'}</Text>
                  <Text style={styles.notificationDate}>{new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(reminder.scheduledAt)}</Text>
                </View>
              </View>
            )) : <View style={styles.notificationEmpty}><View style={styles.notificationIcon}><AppIcon name="check" size={18} color={colors.primary} /></View><Text style={layout.heading}>No delivered reminders</Text><Text style={layout.subtitle}>Reminders will appear here after they have been sent to your device.</Text></View>}
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal visible={Boolean(taskDetails)} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setTaskDetails(null)}>
      <View style={styles.modalBackdrop}>
        {selectedTask ? <View style={[styles.sheetKeyboard, styles.notificationSheet]}>
          <View style={styles.notificationHeader}>
            <View style={styles.grow}><Text style={layout.heading}>Task details</Text><Text style={layout.subtitle}>Read-only overview</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close task details" hitSlop={10} onPress={() => setTaskDetails(null)}><AppIcon name="x" size={22} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.notificationList, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Card>
              <Text style={layout.title}>{selectedTaskDocument?.details.title ?? selectedTask.title}</Text>
              <View style={styles.taskDetailRow}><Text style={layout.label}>Status</Text><Pill text={selectedTask.completed ? 'Completed' : 'In progress'} tone={selectedTask.completed ? 'success' : 'blue'} /></View>
              <View style={styles.taskDetailRow}><Text style={layout.label}>Due date</Text><View style={styles.taskDetailDate}><AppIcon name="calendar" size={16} color={colors.textMuted} /><Text style={layout.body}>{dayLabel(selectedTask.dueDate)}</Text></View></View>
            </Card>
            {selectedTaskDocument ? <Card>
              <Text style={layout.heading}>Document details</Text>
              <View style={styles.taskDetailRow}><Text style={layout.label}>Type</Text><Text style={[layout.body, styles.taskDetailValue]}>{selectedTaskDocument.category}</Text></View>
              <View style={styles.taskDetailRow}><Text style={layout.label}>Source</Text><Text style={[layout.body, styles.taskDetailValue]}>{selectedTaskDocument.sourceType}</Text></View>
            </Card> : null}
            <Card>
              <Text style={layout.heading}>Tasks in this plan</Text>
              <Text style={layout.subtitle}>{tasksInSelectedPlan.length} related task{tasksInSelectedPlan.length === 1 ? '' : 's'}</Text>
              {tasksInSelectedPlan.map((task) => <View key={task.id} style={styles.planTaskRow}>
                <View style={[styles.planTaskMark, task.completed && styles.planTaskMarkComplete]}>{task.completed ? <AppIcon name="check" size={14} color={colors.onPrimary} /> : null}</View>
                <View style={styles.grow}><Text style={[styles.taskTitle, task.completed && styles.completedText]}>{task.title}</Text><View style={styles.dueDateLine}><AppIcon name="calendar" size={14} color={colors.textMuted} /><Text style={styles.taskMeta}>{dayLabel(task.dueDate)}{getTaskPrerequisite(tasksInSelectedPlan, task) ? ` · After ${getTaskPrerequisite(tasksInSelectedPlan, task)?.title}` : ''}</Text></View></View>
                <Pill text={task.completed ? 'Done' : getTaskPrerequisite(tasksInSelectedPlan, task) ? 'Locked' : 'Next'} tone={task.completed ? 'success' : 'blue'} />
              </View>)}
            </Card>
          </ScrollView>
        </View> : null}
      </View>
    </Modal>
    <Modal visible={Boolean(archiveReview)} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => { if (!archiving && !restoringReviewedTasks) setArchiveReview(null); }}>
      <View style={styles.modalBackdrop}>
        {archiveReview ? <View style={[styles.sheetKeyboard, styles.notificationSheet]}>
          <View style={styles.notificationHeader}>
            <View style={styles.grow}><Text style={layout.heading}>Review before moving</Text><Text style={layout.subtitle}>This record is not in your Vault yet.</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Vault review" hitSlop={10} disabled={archiving || restoringReviewedTasks} onPress={() => setArchiveReview(null)}><AppIcon name="x" size={22} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.notificationList, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Card>
              <Text style={layout.title}>{archiveReview.details.title}</Text>
              <View style={styles.taskDetailRow}><Text style={layout.label}>Document type</Text><Text style={[layout.body, styles.taskDetailValue]}>{archiveReview.category}</Text></View>
              {archiveReview.details.provider ? <View style={styles.taskDetailRow}><Text style={layout.label}>Provider or source</Text><Text style={[layout.body, styles.taskDetailValue]}>{archiveReview.details.provider}</Text></View> : null}
              {archiveReview.details.amountDue !== undefined ? <View style={styles.taskDetailRow}><Text style={layout.label}>Amount due</Text><Text style={[layout.body, styles.taskDetailValue]}>{peso(archiveReview.details.amountDue)}</Text></View> : null}
              <View style={styles.taskDetailRow}><Text style={layout.label}>Due date</Text><View style={styles.taskDetailDate}><AppIcon name="calendar" size={16} color={colors.textMuted} /><Text style={[layout.body, styles.taskDetailValue]}>{dayLabel(archiveReview.details.dueDate)}</Text></View></View>
              {archiveReview.details.billingPeriod ? <View style={styles.taskDetailRow}><Text style={layout.label}>Billing period</Text><Text style={[layout.body, styles.taskDetailValue]}>{archiveReview.details.billingPeriod}</Text></View> : null}
              {archiveReview.details.accountNumber ? <View style={styles.taskDetailRow}><Text style={layout.label}>Account/reference</Text><Text style={[layout.body, styles.taskDetailValue]}>{maskIdentifier(archiveReview.details.accountNumber)}</Text></View> : null}
              <View style={styles.taskDetailRow}><Text style={styles.smallNote}>Source: {archiveReview.sourceType}</Text><Text style={styles.smallNote}>{archiveReview.retention === 'image_and_details' ? 'Image retained' : 'Details only'}</Text></View>
            </Card>
            <Card>
              <Text style={layout.heading}>Completed tasks</Text>
              {tasks.filter((task) => task.documentId === archiveReview.id).sort((a, b) => a.position - b.position).map((task) => <View key={task.id} style={styles.planTaskRow}>
                <View style={[styles.planTaskMark, styles.planTaskMarkComplete]}><AppIcon name="check" size={14} color={colors.onPrimary} /></View>
                <View style={styles.grow}><Text style={styles.taskTitle}>{task.title}</Text><View style={styles.dueDateLine}><AppIcon name="calendar" size={14} color={colors.textMuted} /><Text style={styles.taskMeta}>{dayLabel(task.dueDate)}</Text></View></View>
              </View>)}
            </Card>
            <Text style={layout.subtitle}>Move this reviewed record to your Vault?</Text>
            <View style={styles.archiveReviewActions}>
              <Button label={archiving ? 'Moving to Vault…' : 'Move to Vault'} onPress={() => void confirmArchive()} disabled={archiving || restoringReviewedTasks} />
              <Button label={restoringReviewedTasks ? 'Restoring tasks…' : 'Restore tasks'} kind="secondary" onPress={() => void restoreReviewedTasks()} disabled={archiving || restoringReviewedTasks} />
              <Button label="Cancel" kind="cancel" onPress={() => setArchiveReview(null)} disabled={archiving || restoringReviewedTasks} />
            </View>
          </ScrollView>
        </View> : null}
      </View>
    </Modal>
    <Modal visible={Boolean(vaultDocumentDetails)} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => { if (!vaultActionBusy) setVaultDocumentDetails(null); }}>
      <View style={styles.modalBackdrop}>
        {vaultDocumentDetails ? <View style={[styles.sheetKeyboard, styles.notificationSheet, styles.vaultDetailsSheet]}>
          <View style={styles.notificationHeader}>
            <View style={styles.grow}><Text style={layout.heading}>Archived record</Text><Text style={layout.subtitle}>Review the saved details and task history.</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close archived record details" hitSlop={10} disabled={vaultActionBusy} onPress={() => setVaultDocumentDetails(null)}><AppIcon name="x" size={22} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.notificationList, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Card>
              <Text style={layout.title}>{vaultDocumentDetails.details.title}</Text>
              {vaultDocumentDetails.details.amountDue !== undefined ? <View style={styles.taskDetailRow}><Text style={layout.label}>Amount due</Text><Text style={[layout.body, styles.taskDetailValue]}>{peso(vaultDocumentDetails.details.amountDue)}</Text></View> : null}
              <View style={styles.taskDetailRow}><Text style={layout.label}>Due date</Text><View style={styles.taskDetailDate}><AppIcon name="calendar" size={16} color={colors.textMuted} /><Text style={[layout.body, styles.taskDetailValue]}>{dayLabel(vaultDocumentDetails.details.dueDate)}</Text></View></View>
            </Card>
            <Card>
              <Text style={layout.heading}>Document details</Text>
              <View style={styles.taskDetailRow}><Text style={layout.label}>Type</Text><Text style={[layout.body, styles.taskDetailValue]}>{vaultDocumentDetails.category}</Text></View>
              <View style={styles.taskDetailRow}><Text style={layout.label}>Source</Text><Text style={[layout.body, styles.taskDetailValue]}>{vaultDocumentDetails.sourceType}</Text></View>
            </Card>
            <Card>
              <Text style={layout.heading}>Tasks in this plan</Text>
              {tasks.filter((task) => task.documentId === vaultDocumentDetails.id).sort((a, b) => a.position - b.position).map((task) => <View key={task.id} style={styles.planTaskRow}>
                <View style={[styles.planTaskMark, task.completed && styles.planTaskMarkComplete]}>{task.completed ? <AppIcon name="check" size={14} color={colors.onPrimary} /> : null}</View>
                <View style={styles.grow}><Text style={[styles.taskTitle, task.completed && styles.completedText]}>{task.title}</Text><View style={styles.dueDateLine}><AppIcon name="calendar" size={14} color={colors.textMuted} /><Text style={styles.taskMeta}>{dayLabel(task.dueDate)}</Text></View></View>
                <Pill text={task.completed ? 'Done' : 'Not done'} tone={task.completed ? 'success' : 'warning'} />
              </View>)}
            </Card>
            <View style={styles.archiveReviewActions}>
              <Button label={vaultActionBusy ? 'Restoring…' : 'Restore'} kind="secondary" disabled={vaultActionBusy} onPress={() => void restoreVaultDocumentDetails()} />
              <Button label="Delete" kind="danger" disabled={vaultActionBusy} onPress={() => {
                setSelectedVaultIds(new Set([vaultDocumentDetails.id]));
                setVaultDocumentDetails(null);
                setVaultDeleteFromDetails(true);
                setDeleteVaultVisible(true);
              }} />
            </View>
          </ScrollView>
        </View> : null}
      </View>
    </Modal>
    <Modal visible={deleteVaultVisible} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!vaultActionBusy) { setDeleteVaultVisible(false); if (vaultDeleteFromDetails) { setSelectedVaultIds(new Set()); setVaultDeleteFromDetails(false); } } }}>
      <View style={[styles.modalBackdrop, styles.deleteVaultBackdrop]}>
        <View style={[styles.modalCard, styles.deleteVaultModal, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
          <View style={styles.deleteVaultIcon}><AppIcon name="x" size={22} color={colors.danger} /></View>
          <Text style={layout.heading}>Delete selected records?</Text>
          <Text style={layout.subtitle}>This permanently deletes {selectedArchivedVaultDocuments.length} archived record{selectedArchivedVaultDocuments.length === 1 ? '' : 's'}, along with their linked tasks and any retained images. This cannot be undone.</Text>
          <Button label={vaultActionBusy ? 'Deleting…' : `Delete ${selectedArchivedVaultDocuments.length} record${selectedArchivedVaultDocuments.length === 1 ? '' : 's'}`} kind="danger" disabled={vaultActionBusy || !selectedArchivedVaultDocuments.length} onPress={() => void deleteSelectedVaultRecords()} />
          <Button label="Cancel" kind="secondary" disabled={vaultActionBusy} onPress={() => { setDeleteVaultVisible(false); if (vaultDeleteFromDetails) { setSelectedVaultIds(new Set()); setVaultDeleteFromDetails(false); } }} />
        </View>
      </View>
    </Modal>
    <Modal visible={Boolean(editTask)} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => { setEditTask(null); setTaskEditErrors({}); }}>{editTask ? <View style={styles.modalBackdrop}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetKeyboard}><ScrollView ref={editTaskScrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}><Text style={layout.heading}>Edit task</Text><Text style={layout.label}>Title *</Text><TextInput ref={(input) => { validationInputs.current.editTitle = input; }} keyboardAppearance={isDark ? 'dark' : 'light'} style={[layout.input, taskEditErrors.title ? styles.validationInput : undefined]} value={editTask.title} onChangeText={(title) => { setEditTask({ ...editTask, title }); setTaskEditErrors((errors) => ({ ...errors, title: '' })); }} />{taskEditErrors.title ? <Text accessibilityRole="alert" style={styles.validationError}>{taskEditErrors.title}</Text> : null}<Text style={layout.label}>Due date *</Text><View ref={(view) => { validationViews.current.editDueDate = view; }}><Pressable accessibilityRole="button" accessibilityLabel={`Choose due date${editTask.dueDate ? `, ${dayLabel(editTask.dueDate)}` : ''}`} onPress={() => openDatePicker({ kind: 'edit' }, editTask.dueDate)} style={[layout.input, styles.dateField, taskEditErrors.dueDate ? styles.validationInput : undefined]}><AppIcon name="calendar" size={18} color={colors.primary} /><Text style={editTask.dueDate ? layout.body : styles.datePlaceholder}>{editTask.dueDate ? dayLabel(editTask.dueDate) : 'Choose a date'}</Text></Pressable></View>{taskEditErrors.dueDate ? <Text accessibilityRole="alert" style={styles.validationError}>{taskEditErrors.dueDate}</Text> : null}<Text style={layout.label}>Reminder days</Text><TextInput keyboardAppearance={isDark ? 'dark' : 'light'} style={layout.input} value={editTask.reminderDays.join(', ')} onChangeText={(value) => setEditTask({ ...editTask, reminderDays: value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0) })} placeholder="7, 3, 1" placeholderTextColor={colors.textMuted} /><Button label="Save changes" onPress={() => void saveEditedTask()} /><Button label="Delete task" kind="danger" onPress={() => void deleteTask(editTask)} /><Button label="Cancel" kind="secondary" onPress={() => { setEditTask(null); setTaskEditErrors({}); }} /></ScrollView></KeyboardAvoidingView></View> : null}</Modal></SafeAreaView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  calendarArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 12 },
  startupScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 18 },
  startupBrand: { alignItems: 'center', gap: 14 },
  startupMark: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-7deg' }] },
  startupName: { color: colors.primaryDark, fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  startupStaticIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 10 },
  startupIndicator: { marginTop: 10 },
  reorderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reorderButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSurface },
  reorderRemoveButton: { backgroundColor: colors.warningSurface },
  reorderMoveButton: { backgroundColor: colors.successSurface },
  reorderButtonText: { color: colors.primaryDark, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  plansToggleRow: { alignItems: 'flex-end' },
  startupMessage: { color: colors.textMuted, fontSize: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
  notificationBadgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  notificationSheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 8 },
  vaultDetailsSheet: { overflow: 'hidden' },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 12 },
  notificationList: { gap: 10, paddingTop: 4 },
  archiveReviewActions: { gap: 10, marginTop: 2 },
  notificationItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, padding: 14 },
  overdueReviewCard: { borderWidth: 1, borderColor: colors.warningSurface },
  overdueReviewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  overdueTaskTitle: { marginTop: 6 },
  overdueReviewActions: { gap: 10 },
  notificationIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSurface },
  taskOverdueMeta: { color: colors.warning, fontWeight: '700' },
  notificationTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  notificationBody: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  notificationDate: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 5 },
  notificationEmpty: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 12 },
  vaultSelectionBar: { gap: 12 },
  vaultSelectionActions: { flexDirection: 'row', gap: 10 },
  vaultSelectionAction: { flex: 1 },
  vaultRecordSelected: { borderWidth: 2, borderColor: colors.primary },
  vaultRecordCard: { paddingVertical: 12 },
  vaultRecordStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vaultTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start', gap: 8 },
  vaultTitle: { flexShrink: 1 },
  vaultSelectionMark: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  deleteVaultBackdrop: { justifyContent: 'center', padding: 22 },
  deleteVaultModal: { alignItems: 'center', borderRadius: 24 },
  deleteVaultIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningSurface },
  taskDetailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  taskDetailDate: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  taskDetailValue: { flex: 1, textAlign: 'right' },
  dueDateLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  planThumbnail: { width: 44, height: 44, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.blueSurface },
  planThumbnailImage: { width: '100%', height: '100%' },
  planThumbnailFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  planCard: { paddingVertical: 12 },
  planTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planProgress: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  planProgressText: { position: 'absolute', color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  planTaskMark: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  planTaskMarkComplete: { backgroundColor: colors.primary },
  validationInput: { borderColor: colors.danger, borderWidth: 1.5 },
  validationError: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  dateField: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  datePlaceholder: { color: colors.textMuted, fontSize: 15 },
  taskDateField: { minHeight: 40, paddingVertical: 8, marginTop: 6 },
  taskDateText: { color: colors.text, fontSize: 13 },
  datePickerBackdrop: { justifyContent: 'center', padding: 20 },
  datePickerSheet: { width: '100%', maxWidth: 380, alignSelf: 'center', borderRadius: 24, padding: 18, gap: 12, backgroundColor: colors.background },
  datePickerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  datePickerDay: { width: '14.2857%', height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  datePickerDaySelected: { backgroundColor: colors.primary },
  datePickerDayText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  datePickerDisabled: { opacity: 0.4 },
  datePickerDayTextDisabled: { color: colors.textMuted },
  datePickerDayTextSelected: { color: colors.onPrimary, fontWeight: '800' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-7deg' }] },
  headerName: { color: colors.primaryDark, fontSize: 23, fontWeight: '800', letterSpacing: -0.8 },
  themeToggle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  authHero: { gap: 18, paddingTop: 12, paddingBottom: 8 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  welcomeHeadline: { fontSize: 37, lineHeight: 44, fontWeight: '800', letterSpacing: -1.5, color: colors.primaryDark },
  planPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 22, backgroundColor: colors.hero, borderWidth: 1, borderColor: colors.heroBorder },
  previewIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 8 },
  privacyCopy: { color: colors.textMuted, fontSize: 12, flexShrink: 1, lineHeight: 18 },
  attentionCard: { minHeight: 190, borderRadius: 28, paddingVertical: 24, paddingLeft: 24, paddingRight: 118, justifyContent: 'center', overflow: 'hidden', backgroundColor: '#28AAA8' },
  attentionCardDark: { backgroundColor: '#176F73' },
  attentionGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -88, top: -90, backgroundColor: 'rgba(170, 246, 232, 0.22)' },
  attentionAccent: { position: 'absolute', width: 240, height: 125, borderRadius: 100, right: 72, bottom: -96, transform: [{ rotate: '-22deg' }], backgroundColor: 'rgba(0, 112, 115, 0.16)' },
  attentionCopy: { zIndex: 1, gap: 10 },
  attentionEyebrow: { color: '#E8FFFA', fontSize: 15, fontWeight: '700' },
  attentionTitle: { color: '#FFFFFF', fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5 },
  attentionSubtitle: { color: '#E8FFFA', fontSize: 14, lineHeight: 20 },
  attentionArtwork: { position: 'absolute', width: 158, height: 158, right: -6, bottom: -2 },
  homePlanSection: { marginHorizontal: -24, marginBottom: -28, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 52, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.surface, gap: 12 },
  emptyCard: { alignItems: 'center', paddingVertical: 26, gap: 14 },
  emptyGlassCard: { borderWidth: 1, borderColor: colors.blueSurface, elevation: 0, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  emptyCoffeeIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, textAlign: 'center', lineHeight: 22, fontSize: 14, maxWidth: 300 },
  navIcon: { width: 48, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: 'transparent' },
  tabBarEdge: { paddingTop: 0 },
  homeBottomSurface: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tabItemEdge: { justifyContent: 'flex-start' },
  tabIndicator: { width: 40, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  tabIndicatorActive: { backgroundColor: colors.primary },
  sheetKeyboard: { maxHeight: '90%' },
  buttonPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  authWelcomeText: { color: colors.textMuted, fontSize: 16, lineHeight: 25, maxWidth: 340 },
  authCard: { padding: 22, gap: 14, shadowColor: '#000000', shadowOpacity: 0.04, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  authCardTitle: { color: colors.primaryDark, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  authDivider: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  authCardTitleUncentered: { textAlign: 'left' },
  authSubtitleUncentered: { textAlign: 'left' },
  messageUncentered: { textAlign: 'left' },
  ...{ selectedDayText: { color: colors.onPrimary } },
  vaultSearch: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 24, paddingHorizontal: 13, minHeight: 48 },
  vaultSearchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10 },
  emptyVaultCard: { alignItems: 'center', paddingVertical: 28, gap: 14 },
  emptyVaultIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  addTask: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  loader: { justifyContent: 'center', alignItems: 'center' }, authContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center' }, buttonWithLeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, link: { color: colors.primary, fontWeight: '700', textAlign: 'center', paddingVertical: 12, paddingHorizontal: 4 }, message: { color: colors.primaryDark, lineHeight: 20, textAlign: 'center' }, privacyNote: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 14 }, disabled: { opacity: 0.55 }, dangerButton: { alignItems: 'center', backgroundColor: colors.dangerFill, borderRadius: 14, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 }, pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }, pillText: { fontSize: 12, fontWeight: '700' }, previewCard: { borderColor: colors.warning }, heroCard: { backgroundColor: colors.hero, borderColor: colors.heroBorder, gap: 12 }, heroEyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 }, heroTitle: { color: colors.primaryDark, fontSize: 22, fontWeight: '700', lineHeight: 28 }, heroDetail: { color: colors.textMuted, fontSize: 14 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, grow: { flex: 1 }, taskRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, completedRow: { opacity: 0.58 }, check: { width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.primary }, taskText: { flex: 1, gap: 3 }, taskTitle: { color: colors.text, fontSize: 15, fontWeight: '600' }, completedText: { textDecorationLine: 'line-through' }, taskMeta: { color: colors.textMuted, fontSize: 12 },   rowAction: { color: colors.primary, fontWeight: '700', padding: 4 }, calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, calendarCard: { paddingBottom: 8 }, weekRow: { flexDirection: 'row', marginTop: 4 }, weekday: { width: '14.2857%', textAlign: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '700' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: '14.2857%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginTop: 3, borderRadius: 12 }, selectedDay: { backgroundColor: colors.primary }, dayText: { color: colors.text, fontWeight: '600' }, dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: colors.primary }, selectedDot: { backgroundColor: colors.white }, scanFeature: { alignItems: 'flex-start', padding: 20 }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.blueSurface }, choiceText: { color: colors.textMuted, fontWeight: '700' }, choiceTextSelected: { color: colors.primary }, inline: { flexDirection: 'row', alignItems: 'center', gap: 8 }, smallNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, retentionOption: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 3 }, retentionSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surfaceMuted }, retentionTitle: { color: colors.text, fontWeight: '700' }, previewImage: { width: '100%', height: 210, resizeMode: 'cover', borderRadius: 18, borderWidth: 1, borderColor: colors.border },   draftTask: { gap: 6 },
  todayDay: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.blueSurface },
  draftTaskActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, addCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, amount: { color: colors.primaryDark, fontSize: 23, fontWeight: '700' }, tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8, paddingBottom: 8, justifyContent: 'space-around' }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 56 }, tabLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '600' }, tabLabelSelected: { color: colors.primary, fontWeight: '800' }, modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }, modalCard: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 12 },
});

function useAppStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}
export default function Root() {
  return <SafeAreaProvider><ThemeProvider><App /></ThemeProvider></SafeAreaProvider>;
}
