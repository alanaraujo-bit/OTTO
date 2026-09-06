import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useKeyboardOpen } from '@/lib/useKeyboard';
import { useReducedMotion } from '@/theme/motion';

/**
 * Folds away context — a wordmark, a subtitle — while the keyboard is up, giving the field being
 * typed into the room it needs. Height is animated deliberately: the point is to reclaim the space,
 * not just to hide the pixels.
 */
export function CollapseOnKeyboard({
  children,
  height,
  keep = 0,
}: {
  children: ReactNode;
  /** Natural height of the block, including its trailing space. */
  height: number;
  /** Height to retain while collapsed. */
  keep?: number;
}) {
  const open = useKeyboardOpen();
  const reduced = useReducedMotion();

  const animated = useAnimatedStyle(() => ({
    height: height - (height - keep) * open.value,
    opacity: 1 - open.value,
    transform: [{ scale: reduced ? 1 : 1 - open.value * 0.12 }],
  }));

  return (
    <Animated.View style={[animated, { overflow: 'hidden', transformOrigin: 'left top' }]}>
      {children}
    </Animated.View>
  );
}
