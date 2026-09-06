import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { Amount } from '../Amount';
import { color, space } from '@/theme/tokens';
import { duration, ease, stagger, useReducedMotion } from '@/theme/motion';
import type { Cents } from '@/domain/money';

export interface RuleDatum {
  label: string;
  cents: Cents;
}

/**
 * Magnitude, drawn as a rule.
 *
 * OTTO's whole structure is hairlines — every field, every group boundary, the crossbar of the mark
 * itself. So a bar chart here is not a bar chart with the rules removed; it is the rule doing one
 * more job. The line under each row is already there for grouping, and its *length* carries the
 * value. Nothing new is introduced to the vocabulary, and no boxed bar arrives to fight the ledger.
 *
 * One series, one colour: these are all outflow, so hue would encode nothing that length does not
 * already say. Red across every row would read as an alarm on ordinary spending.
 */
export function RuleBars({
  data,
  max,
  delay = 0,
}: {
  data: RuleDatum[];
  /** Shared denominator. Passed in so several groups can share one scale when that is the point. */
  max?: Cents;
  delay?: number;
}) {
  const top = max ?? Math.max(1, ...data.map((d) => d.cents));

  return (
    <View>
      {data.map((d, i) => (
        <Row key={d.label} datum={d} fraction={d.cents / top} index={i} delay={delay} />
      ))}
    </View>
  );
}

function Row({
  datum,
  fraction,
  index,
  delay,
}: {
  datum: RuleDatum;
  fraction: number;
  index: number;
  delay: number;
}) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      grow.value = 1;
      return;
    }
    const at = delay + stagger(index, 70, 8);
    grow.value = withDelay(at, withTiming(1, { duration: duration.rule, easing: ease.out }));
    // The rule's length is data. It must arrive even if the animation layer never runs.
    const settle = setTimeout(() => {
      grow.value = 1;
    }, at + duration.rule + 400);
    return () => clearTimeout(settle);
  }, [reduced, index, delay, grow]);

  // Ruled from the left, the same direction as every other line in the app.
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value * fraction }] }));

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Txt variant="body" t="muted" numberOfLines={1} style={styles.label}>
          {datum.label}
        </Txt>
        <Amount cents={datum.cents} size="body" tone="ink" />
      </View>

      {/* The track is the ordinary hairline; the value is the same line, brightened and thickened.
          Two states of one element, not two elements. */}
      <View style={styles.track}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: space.lg },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  label: { flexShrink: 1, paddingRight: space.md },
  track: {
    height: 2,
    marginTop: space.sm,
    borderRadius: 1,
    backgroundColor: color.hairline,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    backgroundColor: color.ink,
    transformOrigin: 'left',
  },
});
