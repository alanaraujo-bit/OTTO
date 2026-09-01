import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { color, font, type } from './tokens';

type Role = keyof typeof type;
type Tone = 'ink' | 'muted' | 'faint' | 'positive' | 'negative' | 'warning' | 'onInk';
type Family = 'sans' | 'sansMedium' | 'sansSemibold' | 'mono' | 'monoMedium' | 'monoSemibold';

const tone: Record<Tone, string> = {
  ink: color.ink,
  muted: color.inkMuted,
  faint: color.inkFaint,
  positive: color.positive,
  negative: color.negative,
  warning: color.warning,
  onInk: color.onInk,
};

export interface TxtProps extends TextProps {
  variant?: Role;
  t?: Tone;
  f?: Family;
  /** Numbers must never shift width between frames. */
  tabular?: boolean;
  center?: boolean;
}

export function Txt({
  variant = 'body',
  t = 'ink',
  f = 'sans',
  tabular,
  center,
  style,
  ...rest
}: TxtProps) {
  const r = type[variant];
  const s: TextStyle = {
    fontFamily: font[f],
    fontSize: r.size,
    lineHeight: r.leading,
    letterSpacing: r.tracking,
    color: tone[t],
  };
  return (
    <RNText
      {...rest}
      style={StyleSheet.compose(
        [s, tabular && styles.tabular, center && styles.center] as TextStyle[],
        style as TextStyle,
      )}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
});
