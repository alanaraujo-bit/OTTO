import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { Amount } from '../Amount';
import { color, space } from '@/theme/tokens';
import { duration, ease, stagger, useReducedMotion } from '@/theme/motion';
import { parseDay, type DebtStatus } from '@/domain/projection';

/**
 * A debt, counted out.
 *
 * The installments are discrete, so they are drawn discretely: one tick per installment, filled for
 * the ones already paid. A continuous bar would round twelve payments into a smooth percentage and
 * lose the only fact the owner actually acts on — how many are left. Progress rings are banned in
 * this world for the same reason: they are a shape where a count belongs.
 *
 * The ticks also answer "when does this end" without a second control: you can see the remainder.
 */
export function DebtLadder({ debt, index = 0, delay = 0 }: { debt: DebtStatus; index?: number; delay?: number }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      fill.value = 1;
      return;
    }
    const at = delay + stagger(index, 90, 6);
    fill.value = withDelay(at, withTiming(1, { duration: duration.focal, easing: ease.out }));
    const settle = setTimeout(() => {
      fill.value = 1;
    }, at + duration.focal + 400);
    return () => clearTimeout(settle);
  }, [reduced, index, delay, fill]);

  const ends = format(parseDay(debt.finishes), "MMM 'de' yyyy", { locale: ptBR });

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Txt variant="body" t="ink" numberOfLines={1} style={styles.title}>
          {debt.series.title}
        </Txt>
        <Txt variant="label" f="mono" t="muted" tabular>
          {debt.paid}/{debt.total}
        </Txt>
      </View>

      <View style={styles.ticks}>
        {Array.from({ length: debt.total }, (_, i) => (
          <Tick key={i} paid={i < debt.paid} order={i} total={debt.total} progress={fill} />
        ))}
      </View>

      <View style={styles.foot}>
        <View style={styles.remaining}>
          <Txt variant="micro" t="faint">
            faltam{' '}
          </Txt>
          <Amount cents={debt.remainingCents} size="body" tone="muted" showCents={false} />
        </View>
        <Txt variant="micro" t="faint">
          termina em {ends}
        </Txt>
      </View>
    </View>
  );
}

function Tick({
  paid,
  order,
  total,
  progress,
}: {
  paid: boolean;
  order: number;
  total: number;
  progress: SharedValue<number>;
}) {
  // Paid ticks land in sequence as the row fills, so the eye reads the count being made rather than
  // a bar appearing. Unpaid ticks are already at rest — they are the ground the count is made on.
  const animated = useAnimatedStyle(() => {
    if (!paid) return { opacity: 1 };
    const at = order / Math.max(1, total);
    const local = Math.min(1, Math.max(0, (progress.value - at * 0.7) / 0.3));
    return { opacity: 0.25 + local * 0.75 };
  });

  return (
    <Animated.View
      style={[styles.tick, paid ? styles.tickPaid : styles.tickOpen, animated]}
    />
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.xl },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { flexShrink: 1, paddingRight: space.md },
  // `gap` does the separating, so no tick carries a margin that has to be cancelled at the ends.
  ticks: { flexDirection: 'row', gap: 2, paddingTop: space.md },
  tick: { flex: 1, height: 6, borderRadius: 1 },
  tickPaid: { backgroundColor: color.ink },
  tickOpen: { backgroundColor: color.hairline },
  foot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: space.md,
  },
  remaining: { flexDirection: 'row', alignItems: 'baseline' },
});
