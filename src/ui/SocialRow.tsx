import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, motion, radius, space } from '@/theme/tokens';
import { Txt } from '@/theme/text';
import { AppleMark, GoogleMark } from './BrandMarks';

const APressable = Animated.createAnimatedComponent(Pressable);

function SocialButton({
  label,
  mark,
  onPress,
  busy,
}: {
  label: string;
  mark: React.ReactNode;
  onPress: () => void;
  busy?: boolean;
}) {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.02 }],
    backgroundColor: press.value > 0 ? color.surface : 'transparent',
  }));

  return (
    <APressable
      accessibilityRole="button"
      accessibilityLabel={`Continuar com ${label}`}
      disabled={busy}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 90 });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: motion.base });
      }}
      onPress={onPress}
      style={[styles.btn, busy && styles.busy, animated]}
    >
      {mark}
      <Txt variant="label" f="sansMedium" t="ink" style={styles.label}>
        {label}
      </Txt>
    </APressable>
  );
}

/**
 * Grouped by a rule above, the way every group in this app is — no "ou continue com" divider.
 */
export function SocialRow({
  onGoogle,
  onApple,
  busy,
}: {
  onGoogle: () => void;
  onApple: () => void;
  busy?: boolean;
}) {
  return (
    <View>
      <View style={styles.rule} />
      <Txt variant="micro" f="sansMedium" t="faint" style={styles.legend}>
        OU ENTRE COM
      </Txt>
      <View style={styles.row}>
        <SocialButton label="Google" mark={<GoogleMark />} onPress={onGoogle} busy={busy} />
        <View style={styles.gap} />
        <SocialButton label="Apple" mark={<AppleMark />} onPress={onApple} busy={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color.hairline },
  legend: { paddingTop: space.lg, paddingBottom: space.md },
  row: { flexDirection: 'row' },
  gap: { width: space.md },
  btn: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color.hairlineStrong,
  },
  busy: { opacity: 0.42 },
  label: { marginLeft: space.sm },
});
