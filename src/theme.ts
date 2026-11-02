import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const lightColors = {
  background: '#F3F7F6', surface: '#FFFFFF', surfaceMuted: '#E5EFEB',
  primary: '#167568', primaryDark: '#153E38', text: '#183B35', textMuted: '#61766F',
  border: '#DCE7E2', success: '#28734F', warning: '#94601D', danger: '#B34249', dangerFill: '#A52D38',
  white: '#FFFFFF', onPrimary: '#FFFFFF', hero: '#DDEFE7', heroBorder: '#C5E0D2',
  successSurface: '#E3F2E9', warningSurface: '#FAEDD9', blueSurface: '#E1EEF5',
  input: '#F8FBF9', overlay: 'rgba(9, 27, 24, 0.55)',
};
export type ThemeColors = typeof lightColors;
export const darkColors: ThemeColors = {
  background: '#0D1918', surface: '#162724', surfaceMuted: '#223C35',
  primary: '#83DBC1', primaryDark: '#E1F7EE', text: '#E6F3ED', textMuted: '#A3BAB0',
  border: '#30473F', success: '#8FD8AB', warning: '#F0C17C', danger: '#FF9DA4', dangerFill: '#A52D38',
  white: '#FFFFFF', onPrimary: '#103D32', hero: '#203D33', heroBorder: '#365D4B',
  successSurface: '#203E30', warningSurface: '#3F3423', blueSurface: '#233B46',
  input: '#10211D', overlay: 'rgba(0, 0, 0, 0.7)',
};

const createLayout = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 28, gap: 18, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 10 },
  title: { color: colors.primaryDark, fontSize: 32, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  heading: { color: colors.primaryDark, fontSize: 18, fontWeight: '700' },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.45, textTransform: 'uppercase' },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, paddingHorizontal: 13, paddingVertical: 12 },
  button: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.primary, borderRadius: 14, minHeight: 52, justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 14, minHeight: 52, justifyContent: 'center', paddingHorizontal: 16 },
  secondaryButtonText: { color: colors.primaryDark, fontSize: 15, fontWeight: '700' },
});

const ThemeContext = createContext({ colors: lightColors, layout: createLayout(lightColors), isDark: false, toggleTheme: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<'light' | 'dark' | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('pictask.theme').then(value => {
      if (active && (value === 'light' || value === 'dark')) setPreference(value);
    }).catch(() => {}).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  const isDark = (preference ?? systemScheme) === 'dark';
  const value = useMemo(() => {
    const colors = isDark ? darkColors : lightColors;
    return { colors, layout: createLayout(colors), isDark, toggleTheme: () => {
      const next = isDark ? 'light' : 'dark';
      setPreference(next);
      void AsyncStorage.setItem('pictask.theme', next).catch(() => {});
    } };
  }, [isDark]);
  return createElement(ThemeContext.Provider, { value }, loaded ? children : null);
}
export const useTheme = () => useContext(ThemeContext);
