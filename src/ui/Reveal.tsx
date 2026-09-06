import { useEffect, type ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { duration, ease, stagger, useReducedMotion } from '@/theme/motion';

/**
 * The ruling sequence: siblings arrive in order, rising a few dp as they fade in.
 *
 * Two safety rules, both learned the hard way:
 *  - Visibility never depends on the animation completing. A watchdog assigns the resting value
 *    outright once the entrance should have finished, so a stalled animation layer cannot leave the
 *    screen blank.
 *  - Under "Remove animations" the content is simply present. Reduced motion drops spatial
 *    movement; it does not delay or hide anything.
 */
export function Reveal({
  children,
  index = 0,
  rise = 10,
  shift = 0,
  delay = 0,
  step,
  cap,
  ms,
  style,
}: {
  children: ReactNode;
  /** Position in the sequence. Delay is capped so a long screen never feels slow. */
  index?: number;
  rise?: number;
  /**
   * Horizontal travel, in dp from the right.
   *
   * For a screen arriving on a lateral push. Android's native stack finishes its slide in a couple
   * of hundred milliseconds and will not be slowed — `animationDuration` is iOS-only — so the
   * transition has to keep going after the page has landed. Content that coasts in from the same
   * direction the page came from, and settles in sequence, *is* that continuation: the eye reads one
   * long movement instead of a fast slide followed by nothing.
   */
  shift?: number;
  /** Milliseconds between siblings. Larger reads as more deliberate. */
  step?: number;
  /** How many siblings the stagger keeps counting before it stops adding delay. */
  cap?: number;
  /**
   * Offset applied before the sequence starts. A screen arriving on a push uses this to begin
   * ruling itself partway through the slide, so it lands composing rather than landing composed.
   */
  delay?: number;
  /**
   * How long one sibling takes to arrive. Defaults to the ruling duration.
   *
   * A tab change needs longer than a field ruling itself. There is no native slide carrying any part
   * of it on Android, so this travel **is** the transition — and 420ms of it reads as a jump rather
   * than as a movement.
   */
  ms?: number;
  style?: ViewStyle;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    const at = delay + stagger(index, step, cap);
    const span = ms ?? duration.rule;
    progress.value = withDelay(at, withTiming(1, { duration: span, easing: ease.out }));

    // The watchdog is measured from the same offset. Forgetting to fold `delay` in here would widen
    // the window in which a stalled animation leaves the screen blank — which is defect 2 again.
    const settle = setTimeout(() => {
      progress.value = 1;
    }, at + span + 400);
    return () => clearTimeout(settle);
  }, [reduced, index, delay, step, cap, ms, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: (1 - progress.value) * shift },
      { translateY: (1 - progress.value) * rise },
    ],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
