import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { color, motion, space } from '@/theme/tokens';
import { Txt } from '@/theme/text';
import type { Strength } from '@/lib/validation';

const SEGMENTS = 4;

const toneFor = (score: number) =>
  score <= 1 ? color.negative : score === 2 ? color.warning : color.positive;

/**
 * Four hairline segments, not a progress bar or a ring. It reports what the password is worth; it
 * never gates the button.
 */
export function StrengthMeter({ strength }: { strength: Strength }) {
  if (!strength.label) return null;
  const tint = toneFor(strength.score);

  return (
    <View style={styles.root}>
      <View style={styles.track}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <Segment key={i} on={i < strength.score} tint={tint} last={i === SEGMENTS - 1} />
        ))}
      </View>
      <Txt variant="micro" f="sansMedium" style={[styles.label, { color: tint }]}>
        {strength.label}
      </Txt>
    </View>
  );
}

function Segment({ on, tint, last }: { on: boolean; tint: string; last: boolean }) {
  const animated = useAnimatedStyle(() => ({
    backgroundColor: withTiming(on ? tint : color.hairline, {
      duration: motion.fast,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }),
  }));

  return <Animated.View style={[styles.seg, !last && styles.segGap, animated]} />;
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', paddingTop: space.md },
  track: { flexDirection: 'row', flex: 1 },
  seg: { flex: 1, height: 2, borderRadius: 1 },
  segGap: { marginRight: space.xs },
  label: { marginLeft: space.md, minWidth: 62, textAlign: 'right' },
});
