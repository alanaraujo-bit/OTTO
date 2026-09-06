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

export interface PaceDatum {
  label: string;
  /** The comparable stretch: spend through the read day. Drawn solid. */
  cents: Cents;
  /**
   * The rest of that month — real spend that happened outside the compared window. Drawn as a faint
   * continuation of the same rule, never as a second bar.
   */
  tail?: Cents;
  /** Where this row's own normal sits. Null when there is not enough history to have one. */
  usual?: Cents | null;
  /**
   * A closed month: record the current reading is being measured against, rather than the reading
   * itself. Drawn back a step so the live row is the one the eye lands on.
   *
   * Stated this way round on purpose. The obvious spelling was a `current` flag, but then every
   * caller that is not a month-by-month chart has to pass `current: true` on every row to get the
   * ordinary treatment — one prop carrying two meanings, and a chart that renders wrong the first
   * time someone reuses it.
   */
  past?: boolean;
}

/**
 * A rule with a mark on it.
 *
 * `RuleBars` established that magnitude in this app is the length of a hairline, not a boxed bar.
 * This is that same rule doing one more job: a tick across it at the owner's own median, so the
 * question the whole screen exists to answer — *is this normal?* — is read as a position rather than
 * as arithmetic between two figures. Past the mark is more than usual; short of it is less.
 *
 * The tick is the only mark in this app allowed to cross a rule, and it earns that: it is the
 * reference the rule is being measured against, so it has to be on the same line, not beside it.
 *
 * **Solid is the compared window; faint is the rest of that month.** Comparing a month that is two
 * days old against months that are thirty days old is the wrong reading, so the solid part of every
 * rule covers the same stretch of each month. The faint tail is there because the rest of those
 * months did happen and hiding it would make July look like a R$ 134 month.
 */
export function PaceBars({
  data,
  delay = 0,
}: {
  data: PaceDatum[];
  delay?: number;
}) {
  // One denominator across every row, including the marks: a tick that is off its own scale points
  // at nothing.
  const top = Math.max(
    1,
    ...data.map((d) => d.cents + (d.tail ?? 0)),
    ...data.map((d) => d.usual ?? 0),
  );

  return (
    <View>
      {data.map((d, i) => (
        <Row key={d.label} datum={d} top={top} index={i} delay={delay} />
      ))}
    </View>
  );
}

function Row({
  datum,
  top,
  index,
  delay,
}: {
  datum: PaceDatum;
  top: Cents;
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

  const solid = datum.cents / top;
  const whole = (datum.cents + (datum.tail ?? 0)) / top;

  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value * solid }] }));
  const tail = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value * whole }] }));
  // The mark is a fact about the past; it does not need to be revealed, only to not appear before
  // the rule it annotates.
  const tick = useAnimatedStyle(() => ({ opacity: grow.value }));

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Txt variant="body" t={datum.past ? 'muted' : 'ink'} numberOfLines={1} style={styles.label}>
          {datum.label}
        </Txt>
        <Amount cents={datum.cents} size="body" tone={datum.past ? 'muted' : 'ink'} />
      </View>

      {/* The rail exists so the mark and the rule resolve their percentages against the same box.
          With the mark parented to the row instead, it lined up only because the row happened to have
          no horizontal padding — and would drift silently the day one was added. */}
      <View style={styles.rail}>
        <View style={styles.track}>
          {/* Drawn first so the solid rule sits on top of its own continuation. */}
          {datum.tail ? <Animated.View style={[styles.tail, tail]} /> : null}
          <Animated.View style={[styles.fill, datum.past ? styles.fillPast : null, fill]} />
        </View>

        {datum.usual != null ? (
          <Animated.View
            style={[styles.tick, tick, { left: `${Math.min(100, (datum.usual / top) * 100)}%` }]}
            pointerEvents="none"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: space.lg },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  label: { flexShrink: 1, paddingRight: space.md },
  rail: { marginTop: space.sm },
  track: {
    height: 2,
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
  /* A closed month is record the owner is being measured against, not the reading itself. */
  fillPast: { backgroundColor: color.inkFaint },
  tail: {
    position: 'absolute',
    width: '100%',
    height: 2,
    borderRadius: 1,
    backgroundColor: color.hairlineStrong,
    transformOrigin: 'left',
  },
  /* The reference mark. Sits outside the track so it is not clipped by the track's overflow. */
  tick: {
    position: 'absolute',
    bottom: -3,
    width: 1,
    height: 8,
    backgroundColor: color.inkMuted,
  },
});
