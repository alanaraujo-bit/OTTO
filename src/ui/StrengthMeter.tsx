import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { color, space } from '@/theme/tokens';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';
import { Txt } from '@/theme/text';
import type { Strength } from '@/lib/validation';

const SEGMENTS = 4;

const toneFor = (score: number) =>
  score <= 1 ? color.negative : score === 2 ? color.warning : color.positive;

/**
 * Four hairline segments, not a progress bar or a ring. It reports what the password is worth; it
 * never gates the button.
 *
 * The segments fill in sequence, each drawn from its left edge like every other rule in the app, so
 * gaining a level reads as progress rather than as a colour change.
 */
export function StrengthMeter({ strength }: { strength: Strength }) {
  if (!strength.label) return null;
  const tint = toneFor(strength.score);

  return (
    <View style={styles.root}>
      <View style={styles.track}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <Segment key={i} index={i} on={i < strength.score} tint={tint} last={i === SEGMENTS - 1} />
        ))}
      </View>
      <Label tint={tint} text={strength.label} />
    </View>
  );
}

function Segment({
  index,
  on,
  tint,
  last,
}: {
  index: number;
  on: boolean;
  tint: string;
  last: boolean;
}) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    const target = on ? 1 : 0;
    if (reduced) {
      fill.value = withTiming(target, { duration: duration.state });
      return;
    }
    // Filling forward staggers; emptying is immediate, so losing a level never feels rewarded.
    fill.value = on
      ? withDelay(index * 45, withSpring(1, spring.soft))
      : withTiming(0, { duration: duration.exit, easing: ease.out });
  }, [on, index, fill, reduced]);

  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fill.value, [0, 1], [color.hairline, tint]),
    transform: [{ scaleX: reduced ? 1 : 0.15 + fill.value * 0.85 }],
  }));

  return <Animated.View style={[styles.seg, !last && styles.segGap, animated]} />;
}

function Label({ tint, text }: { tint: string; text: string }) {
  const reduced = useReducedMotion();
  const shift = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    shift.value = 0;
    shift.value = withSpring(1, spring.soft);
  }, [text, shift, reduced]);

  const animated = useAnimatedStyle(() => ({
    opacity: 0.35 + shift.value * 0.65,
    transform: [{ translateY: reduced ? 0 : (1 - shift.value) * 4 }],
  }));

  return (
    <Animated.View style={animated}>
      <Txt variant="micro" f="sansMedium" style={[styles.label, { color: tint }]}>
        {text}
      </Txt>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', paddingTop: space.md },
  track: { flexDirection: 'row', flex: 1 },
  seg: { flex: 1, height: 2, borderRadius: 1, transformOrigin: 'left' },
  segGap: { marginRight: space.xs },
  label: { marginLeft: space.md, minWidth: 62, textAlign: 'right' },
});
