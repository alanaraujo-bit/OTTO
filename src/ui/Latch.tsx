import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { color } from '@/theme/tokens';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';

/**
 * The latch itself: a rule that slides, not a pill that fills.
 *
 * A stock switch would be the second selection grammar in an app whose answer to "this one is
 * chosen" is always a rule — the tab bar's marker, the segmented control in lançar, the focus line
 * under a field. So the travelling part is a rule, and it is the same weight as every other one.
 */
export function Latch({ on, dim = false }: { on: boolean; dim?: boolean }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    t.value = reduced
      ? withTiming(on ? 1 : 0, { duration: duration.state, easing: ease.out })
      : withSpring(on ? 1 : 0, spring.crisp);
  }, [on, reduced, t]);

  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * (LATCH_W - LATCH_KNOB) }],
    backgroundColor: on ? color.ink : color.inkFaint,
  }));
  const rail = useAnimatedStyle(() => ({ opacity: dim ? 0.35 : 1 }));

  return (
    <Animated.View style={[styles.latch, rail]}>
      <View style={styles.latchTrack} />
      <Animated.View style={[styles.latchKnob, knob]} />
    </Animated.View>
  );
}

const LATCH_W = 44;
const LATCH_KNOB = 20;

const styles = StyleSheet.create({
  /* A rule with a travelling segment on it, not a pill with a dot in it. A bordered capsule read on
     the device as a button with a minus sign in it. */
  latch: { width: LATCH_W, height: 12, justifyContent: 'center' },
  latchTrack: { height: 2, borderRadius: 1, backgroundColor: color.hairline },
  latchKnob: { position: 'absolute', width: LATCH_KNOB, height: 2, borderRadius: 1 },
});
