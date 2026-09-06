import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { color, HIT, radius, space } from '@/theme/tokens';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';
import { Txt } from '@/theme/text';
import { Check } from './Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'filled' | 'outline' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  /** Confirms the action landed, before the screen changes under the user. */
  success?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  accessibilityHint?: string;
}

/**
 * Press feedback and the success confirmation both run on the UI thread — at 120Hz a JS-driven
 * scale is visibly late.
 *
 * The three states crossfade in place rather than swapping content, so the control never jumps size
 * and the user's thumb stays over the same target throughout.
 */
export function Button({
  label,
  onPress,
  variant = 'filled',
  loading = false,
  success = false,
  disabled = false,
  leading,
  accessibilityHint,
}: ButtonProps) {
  const reduced = useReducedMotion();
  const press = useSharedValue(0);
  const done = useSharedValue(0);
  const inert = disabled || loading || success;

  useEffect(() => {
    if (!success) {
      done.value = withTiming(0, { duration: duration.exit });
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    done.value = reduced
      ? withTiming(1, { duration: duration.state })
      : withSpring(1, spring.crisp);
  }, [success, done, reduced]);

  const shell = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.02 }],
    opacity: 1 - press.value * 0.12,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 1 - done.value,
    transform: [{ scale: reduced ? 1 : 1 - done.value * 0.15 }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: done.value,
    transform: [{ scale: reduced ? 1 : 0.6 + done.value * 0.4 }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPressIn={() => {
        press.value = withTiming(1, { duration: duration.tap, easing: ease.out });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: duration.state, easing: ease.out });
      }}
      onPress={onPress}
      style={[
        styles.base,
        variant === 'filled' && styles.filled,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        disabled && !success && styles.inert,
        shell,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'filled' ? color.onInk : color.ink} size="small" />
      ) : (
        <View style={styles.stack}>
          <Animated.View style={[styles.layer, labelStyle]}>
            {leading ? <View style={styles.leading}>{leading}</View> : null}
            <Txt variant="body" f="sansSemibold" t={variant === 'filled' ? 'onInk' : 'ink'}>
              {label}
            </Txt>
          </Animated.View>

          <Animated.View style={[styles.mark, markStyle]} pointerEvents="none">
            <Check size={20} tint={variant === 'filled' ? color.onInk : color.positive} />
          </Animated.View>
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
  stack: { alignItems: 'center', justifyContent: 'center' },
  layer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  leading: { marginRight: space.md },
  mark: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
