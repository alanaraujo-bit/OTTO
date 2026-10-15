import { type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { duration, ease, useReducedMotion } from '@/theme/motion';

/**
 * A section that is introduced by the act of scrolling to it.
 *
 * The screen's first fold is ruled on entrance (`Reveal`). Everything below it has no entrance of its
 * own: it waits until the owner's scroll brings it into view, then rules itself once and stays. That
 * is the one moment each section gets, so it is not repeated as the owner scrolls back and forth.
 *
 * The test runs on the UI thread from the scroll offset, so no state changes during a scroll. Once a
 * section has been seen it is seen for good, and a section that starts already in view is not held
 * back by a missed measurement.
 *
 * Under "Remove animations" the section is simply present. Reduced motion drops the travel, not the
 * content.
 */
export function SeenReveal({
  children,
  scrollY,
  viewH,
}: {
  children: ReactNode;
  /** The ScrollView's offset, shared with the screen. */
  scrollY: SharedValue<number>;
  /** The ScrollView's visible height. */
  viewH: SharedValue<number>;
}) {
  const reduced = useReducedMotion();
  const top = useSharedValue(Number.POSITIVE_INFINITY);
  const seen = useSharedValue(reduced ? 1 : 0);

  // Reading the top of the section from the layout is relative to its parent, which is the scroll
  // content, so it is comparable with the scroll offset directly.
  const onLayout = (e: LayoutChangeEvent) => {
    top.value = e.nativeEvent.layout.y;
  };

  useAnimatedReaction(
    () => scrollY.value + viewH.value * 0.88 > top.value,
    (inView) => {
      if (!inView || seen.value === 1) return;
      seen.value = reduced ? 1 : withTiming(1, { duration: duration.rule, easing: ease.out });
    },
    [reduced],
  );

  const style = useAnimatedStyle(() => ({
    opacity: seen.value,
    transform: [{ translateY: (1 - seen.value) * 14 }],
  }));

  return (
    <Animated.View style={style} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}
