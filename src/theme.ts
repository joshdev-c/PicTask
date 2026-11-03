import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const lightColors = {
  background: '#F5F4F0', surface: '#FFFFFF', surfaceMuted: '#E8EEF0',
  primary: '#0B5664', primaryDark: '#12343B', text: '#18282B', textMuted: '#627276',
  border: '#E4E6E3', success: '#2D7180', warning: '#94601D', danger: '#B34249', dangerFill: '#A52D38',
  white: '#FFFFFF', onPrimary: '#FFFFFF', hero: '#E5F0F2', heroBorder: '#D3E5E8',
  successSurface: '#E5F0F2', warningSurface: '#FAEDD9', blueSurface: '#E1EEF5',
  input: '#FAFAF8', overlay: 'rgba(15, 35, 39, 0.55)',
};
export type ThemeColors = typeof lightColors;
export const darkColors: ThemeColors = {
  background: '#101B1F', surface: '#1A292E', surfaceMuted: '#263C43',
  primary: '#80C4D0', primaryDark: '#D9F0F2', text: '#E9F1F1', textMuted: '#ADC0C3',
  border: '#344A50', success: '#8CC7D0', warning: '#F0C17C', danger: '#FF9DA4', dangerFill: '#A52D38',
  white: '#FFFFFF', onPrimary: '#10343A', hero: '#203A40', heroBorder: '#34555E',
  successSurface: '#203B40', warningSurface: '#3F3423', blueSurface: '#233B46',
  input: '#132328', overlay: 'rgba(0, 0, 0, 0.7)',
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
