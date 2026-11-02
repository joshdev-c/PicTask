import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import { ThemeProvider, useTheme, type ThemeColors } from './src/theme';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Coffee, FileText, House, Moon, Plus, ScanLine, Search, Shield, Sun, UserRound, X } from 'lucide-react-native';
import type { AppTab, AppUser, DocumentCategory, DocumentRecord, DocumentStatus, RetentionChoice, ScanReviewInput, TaskRecord } from './src/types';
import { createId, extractReview, makeTasks, maskIdentifier, recommendedTaskTitles } from './src/lib/extractor';
import { loadLocalRecords, loadMutations, queueMutation, removeLocalRecords, removeLocalTask, removeMutation, saveLocalDocument, saveLocalTask } from './src/lib/db';
import { deleteRemoteTask, fetchRemoteRecords, supabase, syncDocument, syncTask } from './src/lib/supabase';
import { getUpcomingTaskReminders, scheduleTaskReminders } from './src/lib/notifications';

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

function PulseDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced]);
  return <View style={stylesForPulse.container} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.View style={[stylesForPulse.ring, { borderColor: color, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] }]} />
    <View style={[stylesForPulse.dot, { backgroundColor: color }]} />
  </View>;
}

const stylesForPulse = StyleSheet.create({
  container: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

function AppHeader({ notificationCount, onNotificationsPress }: { notificationCount: number; onNotificationsPress: () => void }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useAppStyles();
  return <View style={styles.appHeader}>
    <View style={styles.headerBrand}><View style={styles.headerMark}><AppIcon name="check" size={22} color={colors.onPrimary} /></View><Text style={styles.headerName}>PicTask</Text></View>
    <View style={styles.headerActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Notifications${notificationCount ? `, ${notificationCount} upcoming reminders` : ''}`} onPress={onNotificationsPress} style={({ pressed }) => [styles.themeToggle, pressed && styles.buttonPressed]}>
        <AppIcon name="bell" size={20} color={colors.primaryDark} />
        {notificationCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text></View> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'} accessibilityHint="Changes the appearance of the entire app" onPress={toggleTheme} style={({ pressed }) => [styles.themeToggle, pressed && styles.buttonPressed]}>
        <AppIcon name={isDark ? 'sun' : 'moon'} size={21} color={colors.primaryDark} />
      </Pressable>
    </View>
  </View>;
}

const tabs: Array<{ id: AppTab; icon: AppIconName; label: string }> = [
  { id: 'home', icon: 'home', label: 'Home' }, { id: 'calendar', icon: 'calendar', label: 'Calendar' },
  { id: 'scan', icon: 'scan-line', label: 'Scan' }, { id: 'vault', icon: 'shield', label: 'Vault' }, { id: 'profile', icon: 'user', label: 'Profile' },
];
const dayLabel = (date?: string) => date ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00`)) : 'No due date';
const peso = (value?: number) => value === undefined ? 'Amount not detected' : value.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
const nowIso = () => new Date().toISOString();
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
  const style = kind === 'primary' ? layout.button : kind === 'secondary' ? layout.secondaryButton : kind === 'danger' ? styles.dangerButton : [layout.secondaryButton, { backgroundColor: isDark ? '#3A444A' : '#E5E7EB', marginTop: -10 }];
  const textStyle = kind === 'danger' ? [layout.buttonText, { color: colors.white }] : kind === 'primary' ? layout.buttonText : layout.secondaryButtonText;
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" accessibilityState={{ disabled, busy: disabled }} disabled={disabled} onPressIn={() => { if (!reduced) animatePress(0.975); }} onPressOut={() => animatePress(1)} onPress={onPress} style={({ pressed }) => [style, leading ? styles.buttonWithLeading : undefined, disabled ? styles.disabled : undefined, pressed ? { opacity: 0.85 } : undefined]}>{leading}<Text style={textStyle}>{label}</Text>{kind === "primary" ? <AppIcon name="arrow-right" size={18} color={colors.onPrimary} /> : null}</Pressable></Animated.View>;
}
function Card({ children, style }: { children: React.ReactNode; style?: object }) { const { layout } = useTheme(); return <View style={[layout.card, style]}>{children}</View>; }
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
  return <KeyboardAvoidingView style={layout.screen} behavior={Platform.select({ ios: 'padding', default: undefined })}><StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
    <SafeAreaView style={layout.screen} edges={["top", "left", "right", "bottom"]}><ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
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
  const first = new Date(year, month, 1).getDay(); const total = new Date(year, month + 1, 0).getDate(); const activeDates = new Set(tasks.filter((task) => !task.completed && task.dueDate).map((task) => task.dueDate));
  const cells = Array.from({ length: first + total }, (_, index) => index < first ? null : index - first + 1);
  return <Card style={styles.calendarCard}><View style={styles.calendarHeader}><Pressable accessibilityRole="button" accessibilityLabel="Previous month" style={styles.calendarArrow} onPress={() => setCursor(new Date(year, month - 1, 1))}><AppIcon name="chevron-left" size={24} color={colors.primary} /></Pressable><Text style={layout.heading}>{cursor.toLocaleString('en-PH', { month: 'long', year: 'numeric' })}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next month" style={styles.calendarArrow} onPress={() => setCursor(new Date(year, month + 1, 1))}><AppIcon name="chevron-right" size={24} color={colors.primary} /></Pressable></View><View style={styles.weekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text style={styles.weekday} key={`${day}-${index}`}>{day}</Text>)}</View><View style={styles.calendarGrid}>{cells.map((day, index) => {
    if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />; const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const selected = value === selectedDate;
    return <Pressable key={value} onPress={() => onSelect(value)} style={[styles.dayCell, selected && styles.selectedDay]}><Text style={[styles.dayText, selected && styles.selectedDayText]}>{day}</Text>{activeDates.has(value) ? <View style={[styles.dayDot, selected && styles.selectedDot]} /> : null}</Pressable>;
  })}</View></Card>;
}

function TaskRow({ task, onToggle, onEdit, compact = false }: { task: TaskRecord; onToggle: () => void; onEdit?: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const styles = useAppStyles();
  return <View style={[styles.taskRow, task.completed && styles.completedRow]}><Pressable accessibilityRole="checkbox" accessibilityLabel={task.title} hitSlop={6} accessibilityState={{ checked: task.completed }} onPress={onToggle} style={[styles.check, task.completed && styles.checked]}>{task.completed ? <AppIcon name="check" size={17} color={colors.onPrimary} /> : null}</Pressable><View style={styles.taskText}><Text style={[styles.taskTitle, task.completed && styles.completedText]}>{task.title}</Text>{!compact ? <Text style={styles.taskMeta}>{dayLabel(task.dueDate)} · {task.syncState === 'synced' ? 'Synced' : task.syncState === 'local' ? 'Local preview' : 'Waiting to sync'}</Text> : null}</View>{onEdit ? <Pressable onPress={onEdit}><Text style={styles.rowAction}>Edit</Text></Pressable> : null}</View>;
}

function App() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { colors, layout, isDark } = useTheme();
  const styles = useAppStyles();
  const [user, setUser] = useState<AppUser | null>(null); const [ready, setReady] = useState(false); const [tab, setTab] = useState<AppTab>('home');
  const [startupComplete, setStartupComplete] = useState(false);
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultCategory, setVaultCategory] = useState<DocumentCategory | 'all'>('all');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]); const [tasks, setTasks] = useState<TaskRecord[]>([]); const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [biometricEnabled, setBiometricEnabled] = useState(false); const [syncing, setSyncing] = useState(false); const [review, setReview] = useState<ScanReviewInput | null>(null); const [reviewTasks, setReviewTasks] = useState<TaskRecord[]>([]); const [editTask, setEditTask] = useState<TaskRecord | null>(null); const [newTaskTitle, setNewTaskTitle] = useState(''); const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [screenOwnerId, setScreenOwnerId] = useState<string | null>(null);

  // Reset before rendering a new session so a previous screen or modal cannot flash.
  const ownerId = user?.id ?? null;
  if (screenOwnerId !== ownerId) {
    setScreenOwnerId(ownerId);
    setTab('home');
    setReview(null);
    setReviewTasks([]);
    setEditTask(null);
    setNewTaskTitle('');
    setNotificationsVisible(false);
  }

  useEffect(() => { let active = true; let unsubscribe: (() => void) | undefined; void (async () => { const saved = await SecureStore.getItemAsync('pictask.biometric'); if (active) setBiometricEnabled(saved === 'true'); if (supabase) { const { data } = await supabase.auth.getSession(); if (active && data.session?.user) setUser({ id: data.session.user.id, email: data.session.user.email ?? 'Account', preview: false }); const listener = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user ? { id: session.user.id, email: session.user.email ?? 'Account', preview: false } : null); }); unsubscribe = () => listener.data.subscription.unsubscribe(); } if (active) setReady(true); })(); return () => { active = false; unsubscribe?.(); }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setStartupComplete(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const flushPending = async (ownerId: string) => { if (!supabase) return; for (const mutation of await loadMutations(ownerId)) { try { if (mutation.operation === 'upsert' && mutation.entity === 'document') await syncDocument(JSON.parse(mutation.payload) as DocumentRecord); if (mutation.operation === 'upsert' && mutation.entity === 'task') await syncTask(JSON.parse(mutation.payload) as TaskRecord); if (mutation.operation === 'delete' && mutation.entity === 'task') await deleteRemoteTask(JSON.parse(mutation.payload).id); await removeMutation(mutation.id); } catch { break; } } };
  const loadRecords = async (ownerId: string, preview: boolean) => { const local = await loadLocalRecords(ownerId); setDocuments(local.documents); setTasks(local.tasks); if (!preview && supabase) try { await flushPending(ownerId); const remote = await fetchRemoteRecords(ownerId); if (remote) { setDocuments(remote.documents); setTasks(remote.tasks); await Promise.all(remote.documents.map(saveLocalDocument)); await Promise.all(remote.tasks.map(saveLocalTask)); } } catch { /* local cache stays available offline */ } };
  useEffect(() => { if (user) void loadRecords(user.id, user.preview); else { setDocuments([]); setTasks([]); } }, [user?.id]);
  useEffect(() => {
    const listener = NetInfo.addEventListener((state) => { if (state.isConnected && user && !user.preview) void flushPending(user.id); });
    return () => listener();
  }, [user?.id]);
  const persistDocument = async (record: DocumentRecord) => { await saveLocalDocument(record); if (!user || user.preview || !supabase) return { ...record, syncState: 'local' as const }; try { const remote = await syncDocument(record); return { ...remote, syncState: 'synced' as const }; } catch { await queueMutation({ id: createId('mutation'), ownerId: record.ownerId, entity: 'document', operation: 'upsert', payload: JSON.stringify(record), localTimestamp: nowIso(), retryCount: 0 }); return { ...record, syncState: 'failed' as const }; } };
  const persistTask = async (record: TaskRecord) => { await saveLocalTask(record); if (!user || user.preview || !supabase) return { ...record, syncState: 'local' as const }; try { await syncTask(record); return { ...record, syncState: 'synced' as const }; } catch { await queueMutation({ id: createId('mutation'), ownerId: record.ownerId, entity: 'task', operation: 'upsert', payload: JSON.stringify(record), localTimestamp: nowIso(), retryCount: 0 }); return { ...record, syncState: 'failed' as const }; } };
  const syncAll = async () => { if (!user || user.preview || !supabase) return; setSyncing(true); await Promise.all(documents.map(async (record) => { const saved = await persistDocument({ ...record, syncState: 'pending' }); setDocuments((all) => all.map((item) => item.id === record.id ? saved : item)); })); await Promise.all(tasks.map(async (record) => { const saved = await persistTask({ ...record, syncState: 'pending' }); setTasks((all) => all.map((item) => item.id === record.id ? saved : item)); })); setSyncing(false); };
  const openVault = async () => { if (biometricEnabled && await LocalAuthentication.hasHardwareAsync()) { const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your PicTask Vault', disableDeviceFallback: false }); if (!result.success) return; } setTab('vault'); };
  const changeTab = (next: AppTab) => { if (next === 'vault') void openVault(); else setTab(next); };
  const startManual = () => { const input: ScanReviewInput = { sourceType: 'manual', category: 'general', confidence: 'manual', retention: 'details_only', details: { title: 'New task', provider: '', retainFullIdentifier: false } }; setReview(input); setReviewTasks([]); };
  const scanImage = async (mode: 'camera' | 'photo') => { const permission = mode === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) { Alert.alert('Permission needed', `Please allow ${mode === 'camera' ? 'camera' : 'photo'} access to scan a document you choose.`); return; } const result = mode === 'camera' ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }); if (result.canceled) return; const uri = result.assets[0].uri; try { const recognized = await TextRecognition.recognize(uri); const draft = extractReview(recognized.text, uri, mode === 'camera' ? 'scan' : 'photo'); setReview(draft); setReviewTasks(makeTasks(user?.id ?? 'local-user', 'draft', draft.category, draft.details.dueDate, draft.details.amountDue)); } catch { const draft = extractReview('', uri, mode === 'camera' ? 'scan' : 'photo'); draft.confidence = 'low'; setReview(draft); setReviewTasks(makeTasks(user?.id ?? 'local-user', 'draft', draft.category)); Alert.alert('Review required', 'Text could not be read automatically. You can enter details manually. OCR requires an Android development build.'); } };
  const updateReview = (change: Partial<ScanReviewInput['details']>) => setReview((current) => current ? { ...current, details: { ...current.details, ...change } } : current);
  const changeCategory = (category: DocumentCategory) => { setReview((current) => current ? { ...current, category } : current); setReviewTasks((current) => current.map((task, index) => ({ ...task, title: recommendedTaskTitles(category, review?.details.amountDue)[index] ?? task.title, recommendationSource: category === 'bill' ? 'bill_rule' : category === 'deadline' ? 'deadline_rule' : 'general_rule' }))); };
  const addDraftTask = () => { if (!newTaskTitle.trim() || !user) return; setReviewTasks((current) => [...current, { id: createId('task'), ownerId: user.id, documentId: 'draft', position: current.length, title: newTaskTitle.trim(), dueDate: review?.details.dueDate, completed: false, recommendationSource: 'manual', reminderDays: [7, 3, 1], syncState: 'pending', createdAt: nowIso(), updatedAt: nowIso() }]); setNewTaskTitle(''); };
  const saveReview = async () => { if (!review || !user) return; const id = createId('document'); const timestamp = nowIso(); const cleanDetails = { ...review.details }; delete cleanDetails.rawText; if (cleanDetails.accountNumber && !cleanDetails.retainFullIdentifier) cleanDetails.accountNumber = cleanDetails.accountNumber.slice(-4); const document: DocumentRecord = { id, ownerId: user.id, sourceType: review.sourceType, category: review.category, details: cleanDetails, retention: review.retention, sourceUri: review.retention === 'image_and_details' ? review.sourceUri : undefined, status: 'active', syncState: user.preview ? 'local' : 'pending', createdAt: timestamp, updatedAt: timestamp }; const nextTasks = reviewTasks.map((task, position) => ({ ...task, documentId: id, ownerId: user.id, position, dueDate: task.dueDate ?? document.details.dueDate, updatedAt: timestamp })); const savedDocument = await persistDocument(document); const savedTasks = await Promise.all(nextTasks.map(persistTask)); setDocuments((all) => [savedDocument, ...all]); setTasks((all) => [...all, ...savedTasks]); for (const task of savedTasks) void scheduleTaskReminders(task); if (review.sourceUri && review.retention !== 'image_and_details') try { await FileSystem.deleteAsync(review.sourceUri, { idempotent: true }); } catch { /* gallery provider may own the original */ } setReview(null); setReviewTasks([]); setTab('home'); };
  const toggleTask = async (task: TaskRecord) => { const next = { ...task, completed: !task.completed, updatedAt: nowIso(), syncState: user?.preview ? 'local' as const : 'pending' as const }; const saved = await persistTask(next); setTasks((all) => all.map((item) => item.id === task.id ? saved : item)); };
  const saveEditedTask = async () => { if (!editTask) return; const saved = await persistTask({ ...editTask, updatedAt: nowIso(), syncState: user?.preview ? 'local' : 'pending' }); setTasks((all) => all.map((item) => item.id === saved.id ? saved : item)); setEditTask(null); if (!saved.completed) void scheduleTaskReminders(saved); };
  const deleteTask = async (task: TaskRecord) => { await removeLocalTask(task.id); setTasks((all) => all.filter((item) => item.id !== task.id)); setEditTask(null); if (!user || user.preview || !supabase) return; try { await deleteRemoteTask(task.id); } catch { await queueMutation({ id: createId('mutation'), ownerId: task.ownerId, entity: 'task', operation: 'delete', payload: JSON.stringify({ id: task.id }), localTimestamp: nowIso(), retryCount: 0 }); } };
  const archiveDocument = async (document: DocumentRecord) => { const saved = await persistDocument({ ...document, status: 'archived' as DocumentStatus, archivedAt: nowIso(), updatedAt: nowIso(), syncState: user?.preview ? 'local' : 'pending' }); setDocuments((all) => all.map((item) => item.id === saved.id ? saved : item)); };
  const restoreDocument = async (document: DocumentRecord) => { const saved = await persistDocument({ ...document, status: 'active' as DocumentStatus, archivedAt: undefined, updatedAt: nowIso(), syncState: user?.preview ? 'local' : 'pending' }); setDocuments((all) => all.map((item) => item.id === saved.id ? saved : item)); };
  const activeDocuments = documents.filter((document) => document.status === 'active'); const activeTasks = tasks.filter((task) => activeDocuments.some((document) => document.id === task.documentId)); const sortByDeadline = (a: TaskRecord, b: TaskRecord) => Number(a.completed) - Number(b.completed) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'); const nextTasks = [...activeTasks].filter((task) => !task.completed).sort(sortByDeadline); const upcomingReminders = getUpcomingTaskReminders(nextTasks); const tasksForSelectedDay = activeTasks.filter((task) => task.dueDate === selectedDate).sort(sortByDeadline); const readyToArchive = activeDocuments.filter((document) => { const documentTasks = tasks.filter((task) => task.documentId === document.id); return documentTasks.length > 0 && documentTasks.every((task) => task.completed); });
  const toggleBiometric = async (next: boolean) => { if (next) { if (!(await LocalAuthentication.hasHardwareAsync())) { Alert.alert('Not available', 'This device does not offer biometric or device-credential authentication.'); return; } const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm Vault protection', disableDeviceFallback: false }); if (!result.success) return; } setBiometricEnabled(next); await SecureStore.setItemAsync('pictask.biometric', String(next)); };
  const exportData = async () => { await Share.share({ title: 'PicTask export', message: JSON.stringify({ exportedAt: nowIso(), documents, tasks }, null, 2) }); };
  const resetPassword = async () => { if (!supabase || !user || user.preview) return; const { error } = await supabase.auth.resetPasswordForEmail(user.email); Alert.alert(error ? 'Could not send email' : 'Email sent', error?.message ?? 'Check your inbox for password-reset instructions.'); };
  const deleteAccount = () => Alert.alert('Delete account?', 'This permanently removes your app records, optional vault images, and local cache.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void (async () => { if (!user) return; await removeLocalRecords(user.id); if (supabase && !user.preview) { await supabase.functions.invoke('delete-account'); await supabase.auth.signOut(); } setUser(null); })(); } }]);
  const signOut = async () => { if (supabase && !user?.preview) await supabase.auth.signOut(); setUser(null); };
  if (!ready || !startupComplete) return <View style={[layout.screen, styles.startupScreen]}><StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} /><View style={styles.startupBrand}><View style={styles.startupMark}><AppIcon name="check" size={28} color={colors.onPrimary} /></View><Text style={styles.startupName}>PicTask</Text></View>{reducedMotion ? <View style={styles.startupStaticIndicator} /> : <ActivityIndicator accessibilityLabel="Loading PicTask" size="small" color={colors.primary} style={styles.startupIndicator} />}<Text style={styles.startupMessage}>Getting things ready for you...</Text></View>;
  if (!user) return <AuthScreen onPreview={() => setUser({ id: 'local-preview', email: 'Local preview', preview: true })} />;

  const renderHome = () => <ScrollView contentContainerStyle={layout.content}>
    <AppHeader notificationCount={upcomingReminders.length} onNotificationsPress={() => setNotificationsVisible(true)} />
    <View style={styles.homeIntro}>
      <Text style={styles.heroEyebrow}>{new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date()).toUpperCase()}</Text>
      <Text accessibilityRole="header" style={layout.title}>
        {nextTasks.length === 0 ? 'Well done!' : `${nextTasks.length} task${nextTasks.length === 1 ? '' : 's'} ${nextTasks.length === 1 ? 'needs' : 'need'} attention`}
      </Text>
      <Text style={layout.subtitle}>
        {nextTasks.length === 0 ? "You're all caught up. Enjoy the breathing room." : 'Take them one step at a time.'}
      </Text>
    </View>
    {user.preview ? <Card style={styles.previewCard}><Pill text="Local preview" tone="warning" /><Text style={layout.body}>A space to try things out. Your preview stays on this device.</Text></Card> : null}
    <Card style={styles.heroCard}>
      <View style={styles.sectionHeader}><Text style={styles.heroEyebrow}>YOUR NEXT STEP</Text><PulseDot color={isDark ? '#9BC9A5' : '#4F805A'} /></View>
      {nextTasks[0] ? <><Text style={styles.heroTitle}>{nextTasks[0].title}</Text><Text style={styles.heroDetail}>{dayLabel(nextTasks[0].dueDate)}</Text><Button label="Mark complete" onPress={() => void toggleTask(nextTasks[0])} /></> : <><Text style={styles.heroTitle}>You are all caught up.</Text><Text style={styles.heroDetail}>Scan a notice or create a task when you are ready.</Text><Button label="Create a task" onPress={startManual} /></>}
    </Card>
    {readyToArchive.length ? <><Text style={layout.heading}>Ready for Vault</Text>{readyToArchive.map((document) => <Card key={document.id}><Text style={layout.heading}>{document.details.title}</Text><Text style={layout.subtitle}>All tasks are complete. Review before archiving.</Text><Button label="Review and move to Vault" onPress={() => void archiveDocument(document)} /></Card>)}</> : null}
    <View style={styles.sectionHeader}><Text style={layout.heading}>Upcoming</Text><Pressable onPress={() => setTab('calendar')}><Text style={styles.link}>View calendar</Text></Pressable></View>
    {nextTasks.slice(0, 4).map((task) => <Card key={task.id}><TaskRow task={task} onToggle={() => void toggleTask(task)} /></Card>)}
    {!nextTasks.length ? <Card style={styles.emptyCard}><View style={styles.previewIcon}><AppIcon name="coffee" size={26} color={colors.primary} /></View><Text style={layout.heading}>A little breathing room.</Text><Text style={styles.emptyText}>Your upcoming tasks will find a home here. Start by scanning your first document.</Text><Button label="Scan a document" kind="secondary" onPress={() => setTab("scan")} /></Card> : null}
  </ScrollView>;
  const renderCalendar = () => <ScrollView contentContainerStyle={layout.content}><View><Text style={layout.title}>Calendar</Text><Text style={layout.subtitle}>Choose a day to see its planned actions.</Text></View><CalendarGrid tasks={activeTasks} selectedDate={selectedDate} onSelect={setSelectedDate} /><View style={styles.sectionHeader}><View><Text style={layout.heading}>{dayLabel(selectedDate)}</Text><Text style={layout.subtitle}>Tasks for this date</Text></View><Pill text={`${tasksForSelectedDay.length} task${tasksForSelectedDay.length === 1 ? '' : 's'}`} tone="blue" /></View>{tasksForSelectedDay.map((task) => <Card key={task.id}><TaskRow task={task} onToggle={() => void toggleTask(task)} onEdit={() => setEditTask(task)} /></Card>)}{!tasksForSelectedDay.length ? <Card><Text style={layout.body}>No tasks are scheduled for this date.</Text><Button label="Create a task" kind="secondary" onPress={startManual} /></Card> : null}</ScrollView>;
  const renderScanStart = () => <ScrollView contentContainerStyle={layout.content}><View><Text style={layout.title}>Create a plan</Text><Text style={layout.subtitle}>Scan a bill, import a notice, or start with a manual task.</Text></View><Card style={styles.scanFeature}><AppIcon name="file-text" size={36} color={colors.primary} /><Text style={layout.heading}>Your document stays in your control</Text><Text style={layout.subtitle}>Text recognition runs on your Android device. You review every detail before saving.</Text></Card><Button label="Scan document" onPress={() => void scanImage('camera')} /><Button label="Import photo" kind="secondary" onPress={() => void scanImage('photo')} /><Button label="Create task manually" kind="secondary" onPress={startManual} /><Card><Text style={layout.label}>Privacy default</Text><Text style={layout.body}>Scans save as reviewed details only unless you explicitly choose to retain the original image.</Text></Card></ScrollView>;
  const renderReview = () => { if (!review) return null; const identifier = review.details.accountNumber; return <ScrollView contentContainerStyle={layout.content} keyboardShouldPersistTaps="handled"><View style={styles.sectionHeader}><View><Text style={layout.title}>Review details</Text><Text style={layout.subtitle}>{review.confidence === 'high' ? 'Check the detected fields before creating tasks.' : 'Add the missing details to make this plan useful.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close review" hitSlop={10} onPress={() => setReview(null)}><AppIcon name="x" size={22} color={colors.textMuted} /></Pressable></View>{review.sourceUri ? <Image source={{ uri: review.sourceUri }} style={styles.previewImage} /> : null}<Card><Text style={layout.label}>Document type</Text><View style={styles.choiceRow}>{(['bill', 'deadline', 'general'] as DocumentCategory[]).map((category) => <Pressable key={category} onPress={() => changeCategory(category)} style={[styles.choice, review.category === category && styles.choiceSelected]}><Text style={[styles.choiceText, review.category === category && styles.choiceTextSelected]}>{category === 'bill' ? 'Bill' : category === 'deadline' ? 'Deadline' : 'General'}</Text></Pressable>)}</View><Text style={layout.label}>Title</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} value={review.details.title} onChangeText={(title) => updateReview({ title })} placeholder="Task title" placeholderTextColor={colors.textMuted} /><Text style={layout.label}>Provider or source</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} value={review.details.provider} onChangeText={(provider) => updateReview({ provider })} placeholder="Meralco, school, employer…" placeholderTextColor={colors.textMuted} /><Text style={layout.label}>Amount due</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} keyboardType="decimal-pad" value={review.details.amountDue?.toString() ?? ''} onChangeText={(value) => updateReview({ amountDue: value ? Number(value.replace(/,/g, '')) : undefined })} placeholder="e.g. 1520.50" placeholderTextColor={colors.textMuted} /><Text style={layout.label}>Due date</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} value={review.details.dueDate ?? ''} onChangeText={(dueDate) => updateReview({ dueDate })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} /><Text style={layout.label}>Billing period</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} value={review.details.billingPeriod ?? ''} onChangeText={(billingPeriod) => updateReview({ billingPeriod })} placeholder="Optional" placeholderTextColor={colors.textMuted} /><Text style={layout.label}>Account/reference number</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} value={review.details.accountNumber ?? ''} onChangeText={(accountNumber) => updateReview({ accountNumber })} placeholder="Optional" placeholderTextColor={colors.textMuted} />{identifier ? <View style={styles.inline}><Pill text={maskIdentifier(identifier)} /><Text style={styles.smallNote}>Masked in the app by default.</Text></View> : null}<View style={styles.switchRow}><View style={styles.grow}><Text style={layout.body}>Retain full identifier</Text><Text style={layout.subtitle}>Only enable if you need it for payment reference.</Text></View><Switch value={review.details.retainFullIdentifier} onValueChange={(retainFullIdentifier) => updateReview({ retainFullIdentifier })} trackColor={{ true: colors.primary }} /></View></Card><Card><Text style={layout.heading}>Keep the original image?</Text><Text style={layout.subtitle}>Details only is selected by default.</Text>{(['details_only', 'image_and_details', 'discard_after_task'] as RetentionChoice[]).map((retention) => <Pressable key={retention} onPress={() => setReview({ ...review, retention })} style={[styles.retentionOption, review.retention === retention && styles.retentionSelected]}><Text style={styles.retentionTitle}>{retention === 'details_only' ? 'Save reviewed details only' : retention === 'image_and_details' ? 'Save image and reviewed details' : 'Discard image after task creation'}</Text><Text style={layout.subtitle}>{retention === 'details_only' ? 'Original image is not kept.' : retention === 'image_and_details' ? 'Stored privately in your Vault.' : 'Creates tasks but keeps no source record.'}</Text></Pressable>)}</Card><Card><Text style={layout.heading}>Suggested tasks</Text><Text style={layout.subtitle}>Edit, remove, or reorder these before saving.</Text>{reviewTasks.map((task, index) => <View key={task.id} style={styles.draftTask}><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={[layout.input, styles.grow]} value={task.title} onChangeText={(title) => setReviewTasks((all) => all.map((item) => item.id === task.id ? { ...item, title } : item))} /><Pressable onPress={() => setReviewTasks((all) => all.filter((item) => item.id !== task.id))}><AppIcon name="x" size={22} color={colors.danger} /></Pressable><Pressable disabled={index === 0} onPress={() => setReviewTasks((all) => { const copy = [...all]; [copy[index - 1], copy[index]] = [copy[index], copy[index -1]]; return copy.map((item, position) => ({ ...item, position })); })}><Text style={styles.rowAction}>↑</Text></Pressable></View>)}<View style={styles.addTask}><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={[layout.input, styles.grow]} value={newTaskTitle} onChangeText={setNewTaskTitle} placeholder="Add a task" placeholderTextColor={colors.textMuted} /><Pressable onPress={addDraftTask} style={styles.addCircle}><AppIcon name="plus" size={22} color={colors.onPrimary} /></Pressable></View></Card><Button label="Save plan" onPress={() => void saveReview()} /><Button label="Cancel" kind="cancel" onPress={() => setReview(null)} /></ScrollView>; };
  const renderVault = () => {
    const archivedDocuments = documents.filter((document) => document.status === 'archived');
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
      {matchingDocuments.map((document) => { const docTasks = tasks.filter((task) => task.documentId === document.id); return <Card key={document.id}><View style={styles.sectionHeader}><View style={styles.grow}><Text style={layout.heading}>{document.details.title}</Text><Text style={layout.subtitle}>{document.details.provider || 'Saved record'} · {dayLabel(document.details.dueDate)}</Text></View><Pill text="Archived" tone="success" /></View>{document.details.amountDue !== undefined ? <Text style={styles.amount}>{peso(document.details.amountDue)}</Text> : null}<Text style={styles.smallNote}>{docTasks.filter((task) => task.completed).length}/{docTasks.length} tasks completed</Text><Button label="Restore for corrections" kind="secondary" onPress={() => void restoreDocument(document)} /></Card>; })}
      {!archivedDocuments.length ? <Card style={[styles.emptyVaultCard, { backgroundColor: colors.background, borderColor: colors.background }]}>
        <View style={[styles.emptyVaultIcon, { backgroundColor: isDark ? '#25392C' : '#EAF2E9' }]}><AppIcon name="shield" size={28} color={isDark ? '#9BC9A5' : '#4F805A'} /></View>
        <Text style={[layout.heading, { color: isDark ? '#9BC9A5' : '#4F805A' }]}>Your Vault is ready</Text>
        <Text style={layout.subtitle}>Create a task or scan a document. Once you finish its tasks, you can archive the record here for safekeeping.</Text>
        <Button label="Create a task" onPress={startManual} />
        <Button label="Scan a document" kind="secondary" onPress={() => setTab('scan')} />
      </Card> : null}
      {archivedDocuments.length > 0 && !matchingDocuments.length ? <Card><Text style={layout.body}>No files found.</Text></Card> : null}
    </ScrollView>;
  };
  const renderProfile = () => <ScrollView contentContainerStyle={layout.content}><View><Text style={layout.title}>Profile</Text><Text style={layout.subtitle}>{user.email}</Text></View><Card><View style={styles.switchRow}><View style={styles.grow}><Text style={layout.heading}>Vault protection</Text><Text style={layout.subtitle}>Ask for fingerprint, face, or device credential before opening Vault.</Text></View><Switch value={biometricEnabled} onValueChange={(value) => void toggleBiometric(value)} trackColor={{ true: colors.primary }} /></View></Card><Card><Text style={layout.heading}>Your data</Text><Text style={layout.subtitle}>Export a copy or permanently remove your account and records.</Text><Button label="Export my data" kind="secondary" onPress={() => void exportData()} /><Button label="Sync now" kind="secondary" onPress={() => void syncAll()} disabled={syncing || user.preview} />{!user.preview ? <Button label="Send password reset" kind="secondary" onPress={() => void resetPassword()} /> : null}<Button label="Delete account and data" kind="danger" onPress={deleteAccount} /></Card><Button label="Sign out" kind="secondary" onPress={() => void signOut()} /><Text style={styles.privacyNote}>PicTask does not use ads, behavioral tracking, cloud AI, or automatic payments.</Text></ScrollView>;
  const renderContent = () => review ? renderReview() : tab === 'home' ? renderHome() : tab === 'calendar' ? renderCalendar() : tab === 'scan' ? renderScanStart() : tab === 'vault' ? renderVault() : renderProfile();
  return <SafeAreaView style={layout.screen} edges={review ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}><StatusBar barStyle={isDark ? "light-content" : "dark-content"} /><AnimatedPage key={review ? "review" : tab}>{renderContent()}</AnimatedPage>{!review ? <View style={[styles.tabBar, styles.tabBarEdge, { paddingBottom: Math.max(insets.bottom, 8) }]}>{tabs.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.id }} onPress={() => changeTab(item.id)} style={({ pressed }) => [styles.tabItem, styles.tabItemEdge, pressed && { opacity: 0.6 }]}><View style={[styles.tabIndicator, tab === item.id && styles.tabIndicatorActive]} /><View style={[styles.navIcon, tab === item.id && styles.navIconActive]}><AppIcon name={item.icon} size={22} color={tab === item.id ? colors.primary : colors.textMuted} /></View><Text style={[styles.tabLabel, tab === item.id && styles.tabLabelSelected]}>{item.label}</Text></Pressable>)}</View> : null}
    <Modal visible={notificationsVisible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setNotificationsVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.sheetKeyboard, styles.notificationSheet]}>
          <View style={styles.notificationHeader}>
            <View><Text style={layout.heading}>Notifications</Text><Text style={layout.subtitle}>Upcoming task reminders</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" hitSlop={10} onPress={() => setNotificationsVisible(false)}><AppIcon name="x" size={22} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.notificationList, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {upcomingReminders.length ? upcomingReminders.map((reminder, index) => (
              <View key={`${reminder.taskId}-${reminder.daysUntilDue}-${index}`} style={styles.notificationItem}>
                <View style={styles.notificationIcon}><AppIcon name="bell" size={18} color={colors.primary} /></View>
                <View style={styles.grow}>
                  <Text style={styles.notificationTitle}>{reminder.taskTitle}</Text>
                  <Text style={styles.notificationBody}>Due in {reminder.daysUntilDue} day{reminder.daysUntilDue === 1 ? '' : 's'}</Text>
                  <Text style={styles.notificationDate}>{new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(reminder.scheduledAt)}</Text>
                </View>
              </View>
            )) : <View style={styles.notificationEmpty}><View style={styles.notificationIcon}><AppIcon name="check" size={18} color={colors.primary} /></View><Text style={layout.heading}>No upcoming reminders</Text><Text style={layout.subtitle}>Reminders for active tasks with due dates will appear here.</Text></View>}
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal visible={Boolean(editTask)} transparent animationType={reducedMotion ? "none" : "slide"} onRequestClose={() => setEditTask(null)}>{editTask ? <View style={styles.modalBackdrop}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheetKeyboard}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}><Text style={layout.heading}>Edit task</Text><Text style={layout.label}>Title</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} value={editTask.title} onChangeText={(title) => setEditTask({ ...editTask, title })} /><Text style={layout.label}>Due date</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} value={editTask.dueDate ?? ''} onChangeText={(dueDate) => setEditTask({ ...editTask, dueDate })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} /><Text style={layout.label}>Reminder days</Text><TextInput keyboardAppearance={isDark ? "dark" : "light"} style={layout.input} value={editTask.reminderDays.join(', ')} onChangeText={(value) => setEditTask({ ...editTask, reminderDays: value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0) })} placeholder="7, 3, 1" placeholderTextColor={colors.textMuted} /><Button label="Save changes" onPress={() => void saveEditedTask()} /><Button label="Delete task" kind="danger" onPress={() => void deleteTask(editTask)} /><Button label="Cancel" kind="secondary" onPress={() => setEditTask(null)} /></ScrollView></KeyboardAvoidingView></View> : null}</Modal></SafeAreaView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  calendarArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 12 },
  startupScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 18 },
  startupBrand: { alignItems: 'center', gap: 14 },
  startupMark: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-7deg' }] },
  startupName: { color: colors.primaryDark, fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  startupIndicator: { marginTop: 10 },
  startupStaticIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 10 },
  startupMessage: { color: colors.textMuted, fontSize: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
  notificationBadgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  notificationSheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 8 },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 12 },
  notificationList: { gap: 10, paddingTop: 4 },
  notificationItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, padding: 14 },
  notificationIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSurface },
  notificationTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  notificationBody: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  notificationDate: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 5 },
  notificationEmpty: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 12 },
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
  homeIntro: { gap: 8, paddingBottom: 4 },
  emptyCard: { alignItems: 'center', paddingVertical: 26, gap: 14 },
  emptyText: { color: colors.textMuted, textAlign: 'center', lineHeight: 22, fontSize: 14, maxWidth: 300 },
  navIcon: { width: 48, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: 'transparent' },
  tabBarEdge: { paddingTop: 0 },
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
  loader: { justifyContent: 'center', alignItems: 'center' }, authContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: colors.background }, buttonWithLeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, link: { color: colors.primary, fontWeight: '700', textAlign: 'center', paddingVertical: 12, paddingHorizontal: 4 }, message: { color: colors.primaryDark, lineHeight: 20, textAlign: 'center' }, privacyNote: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 14 }, disabled: { opacity: 0.55 }, dangerButton: { alignItems: 'center', backgroundColor: colors.dangerFill, borderRadius: 14, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 }, pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }, pillText: { fontSize: 12, fontWeight: '700' }, previewCard: { borderColor: colors.warning }, heroCard: { backgroundColor: colors.hero, borderColor: colors.heroBorder, gap: 12 }, heroEyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 }, heroTitle: { color: colors.primaryDark, fontSize: 22, fontWeight: '700', lineHeight: 28 }, heroDetail: { color: colors.textMuted, fontSize: 14 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, grow: { flex: 1 }, taskRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, completedRow: { opacity: 0.58 }, check: { width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.primary }, taskText: { flex: 1, gap: 3 }, taskTitle: { color: colors.text, fontSize: 15, fontWeight: '600' }, completedText: { textDecorationLine: 'line-through' }, taskMeta: { color: colors.textMuted, fontSize: 12 },   rowAction: { color: colors.primary, fontWeight: '700', padding: 4 }, calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, calendarCard: { paddingBottom: 8 }, weekRow: { flexDirection: 'row', marginTop: 4 }, weekday: { width: '14.2857%', textAlign: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '700' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: '14.2857%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginTop: 3, borderRadius: 12 }, selectedDay: { backgroundColor: colors.primary }, dayText: { color: colors.text, fontWeight: '600' }, dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: colors.primary }, selectedDot: { backgroundColor: colors.white }, scanFeature: { alignItems: 'flex-start', padding: 20 }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.blueSurface }, choiceText: { color: colors.textMuted, fontWeight: '700' }, choiceTextSelected: { color: colors.primary }, inline: { flexDirection: 'row', alignItems: 'center', gap: 8 }, smallNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, retentionOption: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 3 }, retentionSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surfaceMuted }, retentionTitle: { color: colors.text, fontWeight: '700' }, previewImage: { width: '100%', height: 210, resizeMode: 'cover', borderRadius: 18, borderWidth: 1, borderColor: colors.border }, draftTask: { flexDirection: 'row', gap: 6, alignItems: 'center' }, addTask: { flexDirection: 'row', gap: 8, alignItems: 'center' }, addCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, amount: { color: colors.primaryDark, fontSize: 23, fontWeight: '700' }, tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8, paddingBottom: 8, justifyContent: 'space-around' }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 56 }, tabLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '600' }, tabLabelSelected: { color: colors.primary, fontWeight: '800' }, modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }, modalCard: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 12 },
});

function useAppStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}
export default function Root() {
  return <SafeAreaProvider><ThemeProvider><App /></ThemeProvider></SafeAreaProvider>;
}
