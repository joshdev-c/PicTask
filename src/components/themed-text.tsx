import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'subtitle'
    | 'display'
    | 'heading'
    | 'cardTitle'
    | 'caption'
    | 'label'
    | 'small'
    | 'smallBold'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  /** Large screen titles such as "3 tasks need attention" and "Vault". */
  display: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
    letterSpacing: -0.4,
  },
  /** Section headings such as "Due soon" and "Recent". */
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
    letterSpacing: -0.2,
  },
  /** Titles inside cards and list rows. */
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  /** Small meta lines — file names, dates, counts. */
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  /** Uppercase micro-labels such as NEXT UP / THIS WEEK. */
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    letterSpacing: 1,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
