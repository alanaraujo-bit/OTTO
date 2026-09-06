import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { Amount } from './Amount';
import { color, space } from '@/theme/tokens';
import { duration, ease, useReducedMotion } from '@/theme/motion';
import { brlShort } from '@/domain/money';
import type { Cents } from '@/domain/money';

/**
 * The two forces on the month, side by side.
 *
 * A single "saldo" answers where you stand; it says nothing about what is pulling. These two figures
 * are what the reference screens get right, and they survive the translation into this world because
 * neither of them needs a card to be a group — a vertical rule between two columns is the same
 * ledger geometry as every horizontal rule on the screen, turned ninety degrees.
 *
 * The bar under each figure is not decoration and not a progress ring: it is the split between what
 * has already moved and what is still forecast, which is the one thing the totals hide. Half a
 * month's outflow already paid and half still ahead are the same number and very different news.
 */
export function MonthFlow({
  outflow,
  outflowDone,
  inflow,
  inflowDone,
  /** A closed month has no forecast half, so the bars are full and the captions say so. */
  closed,
  delay = 0,
}: {
  outflow: Cents;
  outflowDone: Cents;
  inflow: Cents;
  inflowDone: Cents;
  closed: boolean;
  delay?: number;
}) {
  return (
    <View style={styles.row}>
      <Column
        label="a pagar"
        total={outflow}
        done={outflowDone}
        tint={color.negative}
        tone="negative"
        closed={closed}
        delay={delay}
      />
      <View style={styles.split} />
      <Column
        label="a receber"
        total={inflow}
        done={inflowDone}
        tint={color.positive}
        tone="positive"
        closed={closed}
        delay={delay + 90}
      />
    </View>
  );
}

function Column({
  label,
  total,
  done,
  tint,
  tone,
  closed,
  delay,
}: {
  label: string;
  total: Cents;
  done: Cents;
  tint: string;
  tone: 'positive' | 'negative';
  closed: boolean;
  delay: number;
}) {
  const reduced = useReducedMotion();
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;

  /**
   * The track is measured and the fill animates a number of dp, not a percentage string.
   *
   * This is the same decision `BalanceCurve` documents for its reveal, and for the same reason: a
   * percentage width resolved inside an `overflow: hidden` parent is the shape of bug this project
   * has already been bitten by on device and never on web, and a worklet that rebuilds a string
   * every frame is the least reliable way to ask for it. A measured number cannot resolve to zero.
   */
  const [trackW, setTrackW] = useState(0);
  const onTrack = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setTrackW((prev) => (prev === w ? prev : w));
  };

  const grow = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      grow.value = 1;
      return;
    }
    grow.value = 0;
    grow.value = withDelay(delay, withTiming(1, { duration: duration.rule, easing: ease.out }));
    const settle = setTimeout(() => {
      grow.value = 1;
    }, delay + duration.rule + 400);
    return () => clearTimeout(settle);
  }, [reduced, grow, delay, ratio]);

  const fill = useAnimatedStyle(() => ({ width: trackW * ratio * grow.value }));

  const left = total - done;

  return (
    <View style={styles.col}>
      <Txt variant="micro" f="sansMedium" t="muted" style={styles.label}>
        {label.toUpperCase()}
      </Txt>

      <View style={styles.value}>
        <Amount cents={total} size="heading" tone={total === 0 ? 'faint' : tone} showCents={false} />
      </View>

      {/* The track is the same hairline as every rule on this screen; only the filled part carries
          chroma, and only because chroma here means money. */}
      <View style={styles.track} onLayout={onTrack}>
        <Animated.View style={[styles.fill, { backgroundColor: tint }, fill]} />
      </View>

      <Txt variant="micro" t="faint" numberOfLines={1}>
        {total === 0
          ? 'nada no mês'
          : closed || left <= 0
            ? `${brlShort(done)} realizado`
            : `${brlShort(left)} ainda por vir`}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  col: { flex: 1 },
  split: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.hairline,
    marginHorizontal: space.lg,
  },
  label: { letterSpacing: 0.8 },
  value: { paddingTop: space.xs },
  track: {
    height: 2,
    backgroundColor: color.hairline,
    marginTop: space.sm,
    marginBottom: space.sm,
    overflow: 'hidden',
  },
  fill: { height: 2 },
});
