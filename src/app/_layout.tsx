import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  if (!convex) {
    return (
      <ThemeProvider value={theme}>
        <ThemedView style={styles.missingEnv}>
          <ThemedText type="subtitle">Set EXPO_PUBLIC_CONVEX_URL</ThemedText>
          <AnimatedSplashOverlay />
        </ThemedView>
      </ThemeProvider>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <ThemeProvider value={theme}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: 'Scan document', presentation: 'modal' }} />
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
