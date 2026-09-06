import { type ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { duration, ease, useReducedMotion } from '@/theme/motion';
import { HIT } from '@/theme/tokens';

/**
 * A touch that answers.
 *
 * An instrument that does not move under the finger reads as a screenshot, and OTTO's home had
 * exactly one touch target on it — which is most of why it felt inert. The response is deliberately
 * small: a fraction of a percent of scale and a dip in luminance, on the UI thread, over the tap
 * duration. Anything larger would be a toy bouncing, which this world is not.
 *
 * Under "Remove animations" the scale is dropped and the opacity change is kept. Reduced motion
 * removes spatial movement; it must not remove the confirmation that a control was hit.
 */
export function Press({
  children,
  onPress,
  disabled,
  haptic = 'selection',
  scale = 0.97,
  dim = 0.55,
  style,
  outerStyle,
  accessibilityLabel,
  accessibilityState,
  hitSlop = 8,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  haptic?: 'selection' | 'light' | 'none';
  /** Resting is 1. The pressed value. */
  scale?: number;
  /** Opacity while held. */
  dim?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * Layout for the touch target itself. `style` lands on the inner animated view, which is a child
   * of the Pressable and so cannot tell a parent row how wide the control is — a `flex: 1` written
   * there sizes the contents inside a target that has already collapsed to its own width. Anything
   * that positions the control among its siblings belongs here.
   */
  outerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean };
  hitSlop?: number;
}) {
  const reduced = useReducedMotion();
  const held = useSharedValue(0);

  const animated = useAnimatedStyle(() => {
    const t = held.value;
    return {
      opacity: 1 - t * (1 - dim),
      transform: reduced ? [] : [{ scale: 1 - t * (1 - scale) }],
    };
  });

  const set = (to: number) => {
    held.value = withTiming(to, {
      duration: to === 1 ? duration.tap : duration.state,
      easing: ease.out,
    });
  };

  return (
    <Pressable
      onPressIn={() => set(1)}
      onPressOut={() => set(0)}
      onPress={() => {
        if (disabled) return;
        if (haptic === 'selection') void Haptics.selectionAsync();
        else if (haptic === 'light')
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      disabled={disabled}
      hitSlop={hitSlop}
      style={outerStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, ...accessibilityState }}
    >
      <Animated.View style={[styles.min, style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Material's floor. A control smaller than this is a defect, not a style. */
  min: { minHeight: HIT, justifyContent: 'center' },
});
