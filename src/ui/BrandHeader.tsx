import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import { useKeyboardOpen } from '@/lib/useKeyboard';
import { Wordmark, type Mood } from './Wordmark';
import { space } from '@/theme/tokens';

/** Resting mark, and the air under it. */
const FULL = 40;
const FULL_GAP = space.xxxl + space.xl;
/** While the keyboard is up. Small enough to give the fields their room, big enough to read a face. */
const SMALL = 22;
const SMALL_GAP = space.lg;

const SCALE = SMALL / FULL;
const OPEN_H = FULL + FULL_GAP;
const SHUT_H = SMALL + SMALL_GAP;

/**
 * The brand block, which does not leave when the keyboard arrives — it steps back.
 *
 * The earlier version folded the mark away to zero to reclaim the space. That was right about the
 * space and wrong about the mark: the keyboard is up for the entire time the user is typing, which
 * is exactly the window in which the wordmark has something to say. So it shrinks to a small
 * watching glyph instead, and every reaction the eyes have stays legible while it matters.
 *
 * The block scales from its top-left corner, so the mark never drifts off the gutter.
 */
export function BrandHeader({ mood = 'idle' }: { mood?: Mood }) {
  const open = useKeyboardOpen();

  const shell = useAnimatedStyle(() => ({
    height: OPEN_H - (OPEN_H - SHUT_H) * open.value,
  }));

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - SCALE) * open.value }],
  }));

  return (
    <Animated.View style={[styles.shell, shell]}>
      <Animated.View style={[styles.mark, markStyle]}>
        <Wordmark height={FULL} animate alive mood={mood} />
      </Animated.View>
    </Animated.View>
  );
}

/** What the block occupies at rest — screens size their layout from this, not from a literal. */
BrandHeader.height = OPEN_H;

const styles = StyleSheet.create({
  shell: { overflow: 'hidden', alignItems: 'flex-start' },
  mark: { transformOrigin: 'left top' },
});
