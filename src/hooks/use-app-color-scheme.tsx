import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

type ColorScheme = 'light' | 'dark';
type ColorSchemeMode = ColorScheme | 'system';

type AppColorSchemeContextValue = {
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
};

const AppColorSchemeContext = createContext<AppColorSchemeContextValue | null>(null);

export function AppColorSchemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ColorSchemeMode>('system');
  const colorScheme =
    mode === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : mode;

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (mode === 'system') {
        document.documentElement.style.removeProperty('color-scheme');
      } else {
        document.documentElement.style.colorScheme = mode;
      }
    } else {
      Appearance.setColorScheme(mode === 'system' ? 'auto' : mode);
    }
  }, [mode]);

  const toggleColorScheme = useCallback(() => {
    setMode(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme]);
  const value = useMemo(
    () => ({ colorScheme, toggleColorScheme }),
    [colorScheme, toggleColorScheme],
  );

  return <AppColorSchemeContext.Provider value={value}>{children}</AppColorSchemeContext.Provider>;
}

export function useAppColorScheme() {
  const context = useContext(AppColorSchemeContext);
  if (!context) {
    throw new Error('useAppColorScheme must be used within AppColorSchemeProvider');
  }
  return context;
}
