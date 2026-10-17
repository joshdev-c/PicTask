import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  // Align the native navigation chrome with the PicTask palette so headers and
  // screen backgrounds match the mockup instead of the default grey.
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      primary: colors.brand,
      border: colors.border,
    },
  };

  if (!convex) {
    return (
      <ThemeProvider value={theme}>
        <ThemedView style={styles.missingEnv}>
          <ThemedText type="display">Set EXPO_PUBLIC_CONVEX_URL</ThemedText>
          <AnimatedSplashOverlay />
        </ThemedView>
      </ThemeProvider>
    );
  }

  const headerStyle = {
    backgroundColor: colors.background,
    headerTintColor: colors.brand,
    headerShadowVisible: false,
    headerTitleStyle: { color: colors.text },
    contentStyle: { backgroundColor: colors.background },
  };

  return (
    <ConvexProvider client={convex}>
      <ThemeProvider value={theme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={headerStyle}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="scan"
            options={{
              title: 'Scan document',
              presentation: 'modal',
              headerStyle: { backgroundColor: colors.darkSurface },
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { color: '#FFFFFF' },
              contentStyle: { backgroundColor: colors.darkSurface },
            }}
          />
          <Stack.Screen name="review/[documentId]" options={{ title: 'Review extracted tasks' }} />
          <Stack.Screen name="task/[taskId]" options={{ title: 'Task' }} />
          <Stack.Screen name="workflow/[workflowId]" options={{ title: 'Workflow' }} />
          <Stack.Screen name="document/[documentId]" options={{ title: 'Document' }} />
        </Stack>
      </ThemeProvider>
    </ConvexProvider>
  );
}

const styles = StyleSheet.create({
  missingEnv: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
