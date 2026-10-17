/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    /** Default ink used for body copy and titles. */
    text: '#111F1F',
    /** App canvas — warm off-white from the PicTask mockup. */
    background: '#F6F4F2',
    /** Raised surfaces such as cards and search fields. */
    backgroundElement: '#FFFFFF',
    /** Selected pill / tinted control fill. */
    backgroundSelected: '#E4EFF0',
    /** Muted copy, meta lines and section captions. */
    textSecondary: '#697572',
    /** Hairlines and card outlines. */
    border: '#E8E5E1',
    /** Brand teal used for links, FABs and primary buttons. */
    brand: '#0A4957',
    /** Light teal wash for selected chips and pills. */
    brandTint: '#E4EFF0',
    /** Amber accent (e.g. the active scan kind chip). */
    amber: '#F6AE2D',
    /** Cream surface behind quotes and paper-like previews. */
    amberSurface: '#FBF2DA',
    /** Dark amber ink for text sitting on cream surfaces. */
    amberInk: '#593B00',
    /** Success green — "detected", "saved" states. */
    green: '#1D7B4F',
    /** Danger red — failed extraction, conflicts. */
    danger: '#B3261D',
    /** Pale red wash for warning surfaces. */
    dangerSurface: '#FBEBE8',
    /** Dark capture surface used by the scan screen. */
    darkSurface: '#0A3A44',
    /** Deepest stop of the scan background gradient. */
    darkSurfaceDeep: '#08232B',
  },
  dark: {
    text: '#F5F3F1',
    background: '#0F1416',
    backgroundElement: '#1A2224',
    backgroundSelected: '#22343C',
    textSecondary: '#9BA6A6',
    border: '#26302F',
    brand: '#3E93A3',
    brandTint: '#14343C',
    amber: '#F6AE2D',
    amberSurface: '#2A2416',
    amberInk: '#F6AE2D',
    green: '#4CC38A',
    danger: '#E5766B',
    dangerSurface: '#3A2420',
    darkSurface: '#0A3A44',
    darkSurfaceDeep: '#08232B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/** Corner radii measured from the PicTask mockup. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Soft elevation shared by the mockup's raised cards. */
export const Shadow = {
  card: {
    shadowColor: '#0A2A2E',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
