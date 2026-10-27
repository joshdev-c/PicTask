import Ionicons from '@expo/vector-icons/Ionicons';
import {
  TabList,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from 'expo-router/ui';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useAppColorScheme } from '@/hooks/use-app-color-scheme';

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

export default function NavigationTabs() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useAppColorScheme();
  const progress = useThemeProgress(colorScheme);
  const barColor = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [
      Colors.light.backgroundElement,
      Colors.dark.backgroundElement,
    ]),
    borderTopColor: interpolateColor(progress.value, [0, 1], [
      Colors.light.border,
      Colors.dark.border,
    ]),
  }));

  return (
    <Tabs style={styles.container}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <Animated.View
          style={StyleSheet.flatten([
            styles.navigationBar,
            { paddingBottom: insets.bottom, height: 68 + insets.bottom },
          ])}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, barColor]}
          />
          <TabTrigger name="index" href="/" asChild>
            <NavigationTab label="Home" icon="home-outline" activeIcon="home" />
          </TabTrigger>
          <TabTrigger name="tasks" href="/tasks" asChild>
            <NavigationTab label="Tasks" icon="list-outline" activeIcon="list" />
          </TabTrigger>
          <ScanTabButton />
          <TabTrigger name="vault" href="/vault" asChild>
            <NavigationTab label="Vault" icon="lock-closed-outline" activeIcon="lock-closed" />
          </TabTrigger>
          <TabTrigger name="reminders" href="/reminders" asChild>
            <NavigationTab
              label="Reminders"
              icon="notifications-outline"
              activeIcon="notifications"
            />
          </TabTrigger>
        </Animated.View>
      </TabList>
    </Tabs>
  );
}

function NavigationTab({
  label,
  icon,
  activeIcon,
  isFocused,
  ...props
}: Omit<TabTriggerSlotProps, 'ref'> & {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const { colorScheme } = useAppColorScheme();
  const progress = useThemeProgress(colorScheme);
  const active = isFocused ?? false;
  const tintStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [
        active ? Colors.light.brand : Colors.light.textSecondary,
        active ? Colors.dark.brand : Colors.dark.textSecondary,
      ],
    ),
  }));

  return (
    <Animated.View style={styles.tabSlot}>
      <Pressable
        {...props}
        accessibilityRole="button"
        style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
      >
        <AnimatedIonicons
          name={active ? activeIcon : icon}
          size={21}
          style={[styles.tabIcon, tintStyle]}
        />
        <Animated.Text style={[styles.tabLabel, tintStyle]}>{label}</Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

function ScanTabButton() {
  const { colorScheme } = useAppColorScheme();
  const progress = useThemeProgress(colorScheme);
  const colors = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [
      Colors.light.brand,
      Colors.dark.brand,
    ]),
  }));
  const labelColor = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [Colors.light.brand, Colors.dark.brand]),
  }));

  return (
    <View style={styles.scanSlot}>
      <Animated.Text style={[styles.scanLabel, labelColor]}>SCAN</Animated.Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a document"
        onPress={() => router.push('/scan')}
        style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.scanButtonBackground, colors]} />
        <Ionicons name="scan-outline" size={23} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function useThemeProgress(colorScheme: 'light' | 'dark') {
  return useDerivedValue(() =>
    withTiming(colorScheme === 'dark' ? 1 : 0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    }),
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  navigationBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tabSlot: {
    flex: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.one,
  },
  tabIcon: {
    fontSize: 21,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  scanSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Spacing.two,
  },
  scanButton: {
    position: 'absolute',
    top: -15,
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonBackground: {
    borderRadius: 16,
  },
  scanLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
