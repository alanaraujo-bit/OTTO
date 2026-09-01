import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { color, HIT, motion, radius, space } from '@/theme/tokens';
import { Txt } from '@/theme/text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'filled' | 'outline' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  accessibilityHint?: string;
}

/**
 * Press feedback runs entirely on the UI thread — at 120Hz a JS-driven scale is visibly late.
 */
export function Button({
  label,
  onPress,
  variant = 'filled',
  loading = false,
  disabled = false,
  leading,
  accessibilityHint,
}: ButtonProps) {
  const press = useSharedValue(0);
  const inert = disabled || loading;

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.02 }],
    opacity: 1 - press.value * 0.12,
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 90 });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: motion.base });
      }}
      onPress={onPress}
      style={[
        styles.base,
        variant === 'filled' && styles.filled,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        inert && styles.inert,
        animated,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'filled' ? color.onInk : color.ink}
          size="small"
        />
      ) : (
        <View style={styles.content}>
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <Txt variant="body" f="sansSemibold" t={variant === 'filled' ? 'onInk' : 'ink'}>
            {label}
          </Txt>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  filled: { backgroundColor: color.ink },
  outline: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color.hairlineStrong,
    backgroundColor: 'transparent',
  },
  ghost: { minHeight: HIT, backgroundColor: 'transparent' },
  inert: { opacity: 0.42 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  leading: { marginRight: space.md },
});
