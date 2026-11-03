import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const lightColors = {
  background: '#EAF6FA', surface: '#FFFFFF', surfaceMuted: '#E0F2F3',
  primary: '#087F80', primaryDark: '#101B36', text: '#18243B', textMuted: '#68748A',
  border: '#D8E9EF', success: '#087F80', warning: '#94601D', danger: '#B34249', dangerFill: '#A52D38',
  white: '#FFFFFF', onPrimary: '#FFFFFF', hero: '#DDF3F2', heroBorder: '#BCE4E3',
  successSurface: '#DDF3F2', warningSurface: '#FAEDD9', blueSurface: '#E2F1F7',
  input: '#F8FCFD', overlay: 'rgba(15, 35, 55, 0.55)',
};
export type ThemeColors = typeof lightColors;
export const darkColors: ThemeColors = {
  background: '#0B2024', surface: '#132D32', surfaceMuted: '#1D3C40',
  primary: '#62C8BB', primaryDark: '#D9F5F0', text: '#E8F4F1', textMuted: '#A5C1BD',
  border: '#2D4D4F', success: '#72D3C4', warning: '#F0C17C', danger: '#FF9DA4', dangerFill: '#A52D38',
  white: '#FFFFFF', onPrimary: '#10343A', hero: '#183D40', heroBorder: '#2C5D5D',
  successSurface: '#1B4141', warningSurface: '#3F3423', blueSurface: '#1B393E',
  input: '#10272B', overlay: 'rgba(0, 0, 0, 0.7)',
};

const createLayout = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 28, gap: 18, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, borderWidth: 0, shadowColor: '#000000', shadowOpacity: colors.background === darkColors.background ? 0.24 : 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3, gap: 10 },
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
